#!/usr/bin/env node
// test/agents.mjs — Unit tests for the agent registry + skill emitters.
// Run from repo root: node test/agents.mjs
import {
  parseSkill, parseSkillPath, emitSkillFile, resolveAgents,
  emitRules, agentRulesMode, GUARDS_BEGIN, GUARDS_END,
  emitHooks, agentHasHooks,
  AGENTS, AGENT_IDS, DEFAULT_AGENT,
} from '../cli/src/lib/agents.js';

let passed = 0, failed = 0;
const ok = (d) => { passed++; console.log(`\x1b[32m  ✓ ${d}\x1b[0m`); };
const no = (d, e) => { failed++; console.log(`\x1b[31m  ✗ ${d}${e ? `  [${e}]` : ''}\x1b[0m`); };
const eq = (d, a, b) => (a === b ? ok(d) : no(d, `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`));
const has = (d, s, sub) => (s.includes(sub) ? ok(d) : no(d, `missing ${JSON.stringify(sub)}`));
const not = (d, s, sub) => (!s.includes(sub) ? ok(d) : no(d, `unexpected ${JSON.stringify(sub)}`));

const SKILL = `---
description: |
  Generate spec with scenarios.
  Use when asked to "write the spec".
allowed-tools: Read, Write, Edit, AskUserQuestion, Agent
---
# sp-plan

Body content here.
`;

console.log('\n── parseSkill ──');
{
  const p = parseSkill(SKILL);
  eq('has frontmatter', p.hasFrontmatter, true);
  eq('two top-level keys', p.keys.length, 2);
  eq('first key is description', p.keys[0].key, 'description');
  eq('second key is allowed-tools', p.keys[1].key, 'allowed-tools');
  has('description block keeps continuation lines', p.keys[0].lines.join('\n'), 'write the spec');
  has('body preserved', p.body, 'Body content here.');
}
{
  const p = parseSkill('# no frontmatter\njust body');
  eq('no-frontmatter detected', p.hasFrontmatter, false);
  eq('body is whole content', p.body, '# no frontmatter\njust body');
}

console.log('\n── parseSkillPath ──');
{
  eq('skill name', parseSkillPath('skills/sp-plan/SKILL.md').skill, 'sp-plan');
  eq('inner SKILL.md', parseSkillPath('skills/sp-plan/SKILL.md').inner, 'SKILL.md');
  eq('nested inner', parseSkillPath('skills/sp-scaffold/references/x.md').inner, 'references/x.md');
  eq('non-skill path -> null', parseSkillPath('docs/WORKFLOW.md'), null);
}

console.log('\n── emitSkillFile: paths ──');
const REL = 'skills/sp-plan/SKILL.md';
{
  eq('claude path', emitSkillFile('claude', REL, SKILL).path, '.claude/skills/sp-plan/SKILL.md');
  eq('antigravity path', emitSkillFile('antigravity', REL, SKILL).path, '.agents/skills/sp-plan/SKILL.md');
  eq('openclaw path', emitSkillFile('openclaw', REL, SKILL).path, 'skills/sp-plan/SKILL.md');
  eq('hermes path', emitSkillFile('hermes', REL, SKILL).path, 'optional-skills/specpipe/sp-plan/SKILL.md');
  eq('codex path', emitSkillFile('codex', REL, SKILL).path, '.agents/skills/sp-plan/SKILL.md');
  eq('cursor path -> native skills', emitSkillFile('cursor', REL, SKILL).path, '.cursor/skills/sp-plan/SKILL.md');
}

console.log('\n── emitSkillFile: frontmatter transforms ──');
{
  const claude = emitSkillFile('claude', REL, SKILL).content;
  eq('claude is byte-identical (identity)', claude, SKILL);
  has('claude keeps allowed-tools', claude, 'allowed-tools');

  const ag = emitSkillFile('antigravity', REL, SKILL).content;
  has('antigravity adds name from dir', ag, 'name: sp-plan');
  has('antigravity keeps description', ag, 'Generate spec with scenarios.');
  not('antigravity drops allowed-tools', ag, 'allowed-tools');

  const oc = emitSkillFile('openclaw', REL, SKILL).content;
  has('openclaw adds name', oc, 'name: sp-plan');
  not('openclaw drops allowed-tools', oc, 'allowed-tools');

  const he = emitSkillFile('hermes', REL, SKILL).content;
  has('hermes adds version', he, 'version: 1.0.0');
  has('hermes adds tags block', he, 'tags: [specpipe');

  const cu = emitSkillFile('cursor', REL, SKILL).content;
  has('cursor (native skill) adds name', cu, 'name: sp-plan');
  not('cursor drops allowed-tools', cu, 'allowed-tools');
  has('cursor keeps body', cu, 'Body content here.');
}

console.log('\n── emitSkillFile: reference files copy verbatim ──');
{
  const refRel = 'skills/sp-scaffold/references/react.md';
  const refContent = '# react profile\nstuff';
  const ag = emitSkillFile('antigravity', refRel, refContent);
  eq('ref path under skill dir', ag.path, '.agents/skills/sp-scaffold/references/react.md');
  eq('ref content untouched', ag.content, refContent);
  const cu = emitSkillFile('cursor', refRel, refContent);
  eq('cursor ref under .cursor/skills/<name>/', cu.path, '.cursor/skills/sp-scaffold/references/react.md');
}

console.log('\n── resolveAgents ──');
{
  eq('default -> claude', resolveAgents().join(','), 'claude');
  eq('all -> every agent', resolveAgents('all').length, AGENT_IDS.length);
  eq('csv parse', resolveAgents('claude,cursor').join(','), 'claude,cursor');
  eq('trims spaces', resolveAgents(' claude , cursor ').join(','), 'claude,cursor');
  try { resolveAgents('bogus'); no('unknown agent throws'); }
  catch { ok('unknown agent throws'); }
}

console.log('\n── registry invariants ──');
{
  eq('default agent exists', !!AGENTS[DEFAULT_AGENT], true);
  eq('six agents', AGENT_IDS.length, 6);
  let allHaveFields = true;
  for (const id of AGENT_IDS) {
    const a = AGENTS[id];
    if (!a.label || !a.skillTarget || !a.emitFrontmatter || !a.hooks || !a.capabilities) allHaveFields = false;
  }
  eq('every agent has required fields', allHaveFields, true);
}

console.log('\n── AskUserQuestion rewrite on real skills ──');
{
  const dir = new URL('../kit/skills/', import.meta.url);
  const { readFileSync, readdirSync } = await import('node:fs');
  let leaks = 0, claudeId = 0, total = 0;
  for (const s of readdirSync(dir)) {
    let src;
    try { src = readFileSync(new URL(`${s}/SKILL.md`, dir), 'utf8'); } catch { continue; }
    total++;
    const rel = `skills/${s}/SKILL.md`;
    if (!/AskUserQuestion/.test(emitSkillFile('cursor', rel, src).content)) {} else { leaks++; }
    if (emitSkillFile('claude', rel, src).content === src) claudeId++;
  }
  eq('no AskUserQuestion leaks in non-Claude output', leaks, 0);
  eq('every skill is byte-identical for Claude', claudeId, total);
  eq('found the real skill set', total >= 13, true);
}

console.log('\n── capability adaptation (Phase 3) ──');
{
  // SKILL fixture declares AskUserQuestion + Agent in allowed-tools.
  const cu = emitSkillFile('cursor', REL, SKILL).content;
  has('non-claude gets a Running-on section', cu, 'Running on Cursor');
  has('subagent caveat present', cu, 'Subagents:');
  not('claude has no Running-on section', emitSkillFile('claude', REL, SKILL).content, 'Running on');

  // AskUserQuestion references are rewritten in place, not left as the tool name.
  const asking = `---\ndescription: |\n  d\nallowed-tools: Read, AskUserQuestion\n---\n# body\nUse the \`AskUserQuestion\` tool to confirm; pass all in a single \`AskUserQuestion\` call.`;
  const askCu = emitSkillFile('cursor', REL, asking).content;
  not('cursor: AskUserQuestion rewritten away', askCu, 'AskUserQuestion');
  has('cursor: explicit plain-text instruction', askCu, 'plain-text multiple-choice question');
  has('claude: AskUserQuestion kept verbatim', emitSkillFile('claude', REL, asking).content, 'AskUserQuestion');

  // A skill with no Claude-specific tools gets no adaptation section.
  const plain = `---\ndescription: |\n  Plain skill.\nallowed-tools: Read, Grep\n---\n# body\ntext`;
  not('plain skill: no adaptation section', emitSkillFile('cursor', REL, plain).content, 'Running on');
  has('plain skill body preserved', emitSkillFile('cursor', REL, plain).content, 'text');
}

console.log('\n── emitRules (guardrails) ──');
{
  const BODY = '- rule one\n- rule two\n';
  eq('claude has no rules (native hooks)', emitRules('claude', BODY), null);
  eq('claude rules mode is null', agentRulesMode('claude'), null);

  const cu = emitRules('cursor', BODY);
  eq('cursor rules path', cu.path, '.cursor/rules/specpipe-guards.mdc');
  has('cursor rules alwaysApply', cu.content, 'alwaysApply: true');
  has('cursor rules carries body', cu.content, 'rule one');

  const ag = emitRules('antigravity', BODY);
  eq('antigravity rules path (singular .agent, official)', ag.path, '.agent/rules/specpipe-guards.md');
  not('antigravity rules: no fabricated frontmatter', ag.content, 'trigger:');

  const oc = emitRules('openclaw', BODY);
  eq('openclaw advisory doc path', oc.path, 'SPECPIPE-GUARDS.md');
  eq('openclaw mode is doc', oc.mode, 'doc');

  const cx = emitRules('codex', BODY);
  eq('codex targets AGENTS.md', cx.path, 'AGENTS.md');
  eq('codex mode is agents-md', cx.mode, 'agents-md');
  has('codex section has begin marker', cx.content, GUARDS_BEGIN);
  has('codex section has end marker', cx.content, GUARDS_END);
}

console.log('\n── emitHooks (enforced) ──');
{
  eq('claude has no enforced-hooks emitter (uses .claude/hooks)', emitHooks('claude'), null);
  eq('antigravity: no enforced hooks', agentHasHooks('antigravity'), false);
  eq('hermes: no enforced hooks', agentHasHooks('hermes'), false);

  const cx = emitHooks('codex');
  eq('codex hooks config path', cx.configPath, '.codex/hooks.json');
  eq('codex ships shell-guard', cx.scripts.some((s) => s.dst === '.codex/hooks/specpipe-shell-guard.sh'), true);
  has('codex config wires the shell guard', cx.configContent, 'specpipe-shell-guard.sh');
  has('codex PreToolUse matcher', cx.configContent, 'PreToolUse');
  const okJson = (d, s) => { try { JSON.parse(s); ok(d); } catch { no(d, 'invalid JSON'); } };
  okJson('codex config is valid JSON', cx.configContent);

  const cu = emitHooks('cursor');
  eq('cursor hooks config path', cu.configPath, '.cursor/hooks.json');
  eq('cursor ships 2 guards', cu.scripts.length, 2);
  has('cursor config uses failClosed', cu.configContent, 'failClosed');
  has('cursor beforeReadFile guard', cu.configContent, 'beforeReadFile');
  okJson('cursor config is valid JSON', cu.configContent);
}

console.log(`\n══════════════════════════════════`);
console.log(failed === 0 ? `\x1b[32m  All ${passed} tests passed\x1b[0m` : `\x1b[31m  ${failed} failed, ${passed} passed\x1b[0m`);
console.log(`══════════════════════════════════`);
process.exit(failed === 0 ? 0 : 1);
