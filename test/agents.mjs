#!/usr/bin/env node
// test/agents.mjs — Unit tests for the agent registry + skill emitters.
// Run from repo root: node test/agents.mjs
import {
  parseSkill, parseSkillPath, emitSkillFile, resolveAgents,
  emitRules, agentRulesMode, GUARDS_BEGIN, GUARDS_END,
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
# ap-plan

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
  eq('skill name', parseSkillPath('.claude/skills/ap-plan/SKILL.md').skill, 'ap-plan');
  eq('inner SKILL.md', parseSkillPath('.claude/skills/ap-plan/SKILL.md').inner, 'SKILL.md');
  eq('nested inner', parseSkillPath('.claude/skills/ap-scaffold/references/x.md').inner, 'references/x.md');
  eq('non-skill path -> null', parseSkillPath('docs/WORKFLOW.md'), null);
}

console.log('\n── emitSkillFile: paths ──');
const REL = '.claude/skills/ap-plan/SKILL.md';
{
  eq('claude path', emitSkillFile('claude', REL, SKILL).path, '.claude/skills/ap-plan/SKILL.md');
  eq('antigravity path', emitSkillFile('antigravity', REL, SKILL).path, '.agents/skills/ap-plan/SKILL.md');
  eq('openclaw path', emitSkillFile('openclaw', REL, SKILL).path, 'skills/ap-plan/SKILL.md');
  eq('hermes path', emitSkillFile('hermes', REL, SKILL).path, 'optional-skills/agentpipe/ap-plan/SKILL.md');
  eq('codex path', emitSkillFile('codex', REL, SKILL).path, '.codex/skills/ap-plan/SKILL.md');
  eq('cursor path -> .mdc flat', emitSkillFile('cursor', REL, SKILL).path, '.cursor/rules/ap-plan.mdc');
}

console.log('\n── emitSkillFile: frontmatter transforms ──');
{
  const claude = emitSkillFile('claude', REL, SKILL).content;
  eq('claude is byte-identical (identity)', claude, SKILL);
  has('claude keeps allowed-tools', claude, 'allowed-tools');

  const ag = emitSkillFile('antigravity', REL, SKILL).content;
  has('antigravity adds name from dir', ag, 'name: ap-plan');
  has('antigravity keeps description', ag, 'Generate spec with scenarios.');
  not('antigravity drops allowed-tools', ag, 'allowed-tools');

  const oc = emitSkillFile('openclaw', REL, SKILL).content;
  has('openclaw adds name', oc, 'name: ap-plan');
  not('openclaw drops allowed-tools', oc, 'allowed-tools');

  const he = emitSkillFile('hermes', REL, SKILL).content;
  has('hermes adds version', he, 'version: 1.0.0');
  has('hermes adds tags block', he, 'tags: [agentpipe');

  const cu = emitSkillFile('cursor', REL, SKILL).content;
  has('cursor adds alwaysApply', cu, 'alwaysApply: false');
  has('cursor adds globs key', cu, 'globs:');
  not('cursor has no name field', cu, 'name: ap-plan');
  has('cursor keeps body', cu, 'Body content here.');
}

console.log('\n── emitSkillFile: reference files copy verbatim ──');
{
  const refRel = '.claude/skills/ap-scaffold/references/react.md';
  const refContent = '# react profile\nstuff';
  const ag = emitSkillFile('antigravity', refRel, refContent);
  eq('ref path under skill dir', ag.path, '.agents/skills/ap-scaffold/references/react.md');
  eq('ref content untouched', ag.content, refContent);
  const cu = emitSkillFile('cursor', refRel, refContent);
  eq('cursor ref under .cursor/rules/<name>/', cu.path, '.cursor/rules/ap-scaffold/references/react.md');
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

console.log('\n── capability adaptation (Phase 3) ──');
{
  // SKILL fixture declares AskUserQuestion + Agent in allowed-tools.
  const cu = emitSkillFile('cursor', REL, SKILL).content;
  has('non-claude gets adaptation section', cu, 'Running outside Claude Code');
  has('AskUserQuestion note injected', cu, 'Asking the user');
  has('Subagent note injected', cu, 'Subagents:');
  has('note names the agent', cu, 'On Cursor:');
  not('claude body has no adaptation section', emitSkillFile('claude', REL, SKILL).content, 'Running outside Claude Code');

  // A skill with no Claude-specific tools gets no adaptation section.
  const plain = `---\ndescription: |\n  Plain skill.\nallowed-tools: Read, Grep\n---\n# body\ntext`;
  not('plain skill: no adaptation section', emitSkillFile('cursor', REL, plain).content, 'Running outside Claude Code');
  has('plain skill body preserved', emitSkillFile('cursor', REL, plain).content, 'text');
}

console.log('\n── emitRules (guardrails) ──');
{
  const BODY = '- rule one\n- rule two\n';
  eq('claude has no rules (native hooks)', emitRules('claude', BODY), null);
  eq('claude rules mode is null', agentRulesMode('claude'), null);

  const cu = emitRules('cursor', BODY);
  eq('cursor rules path', cu.path, '.cursor/rules/agentpipe-guards.mdc');
  has('cursor rules alwaysApply', cu.content, 'alwaysApply: true');
  has('cursor rules carries body', cu.content, 'rule one');

  const ag = emitRules('antigravity', BODY);
  eq('antigravity rules path', ag.path, '.agents/rules/agentpipe-guards.md');
  has('antigravity trigger always_on', ag.content, 'trigger: always_on');

  const oc = emitRules('openclaw', BODY);
  eq('openclaw advisory doc path', oc.path, 'AGENTPIPE-GUARDS.md');
  eq('openclaw mode is doc', oc.mode, 'doc');

  const cx = emitRules('codex', BODY);
  eq('codex targets AGENTS.md', cx.path, 'AGENTS.md');
  eq('codex mode is agents-md', cx.mode, 'agents-md');
  has('codex section has begin marker', cx.content, GUARDS_BEGIN);
  has('codex section has end marker', cx.content, GUARDS_END);
}

console.log(`\n══════════════════════════════════`);
console.log(failed === 0 ? `\x1b[32m  All ${passed} tests passed\x1b[0m` : `\x1b[31m  ${failed} failed, ${passed} passed\x1b[0m`);
console.log(`══════════════════════════════════`);
process.exit(failed === 0 ? 0 : 1);
