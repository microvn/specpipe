#!/usr/bin/env node
// test/agents.mjs — Unit tests for the agent registry + skill emitters.
// Run from repo root: node test/agents.mjs
import {
  parseSkill, parseSkillPath, emitSkillFile, emitSkillFileGlobal, resolveAgents,
  emitRules, agentRulesMode, RULES_BEGIN, RULES_END,
  emitHooks, agentHasHooks,
  AGENTS, AGENT_IDS, DEFAULT_AGENT,
} from '../cli/src/lib/agents.js';
import { resolveSkills, skillAllowed, ALL_SKILL_NAMES, OPTIONAL_SKILLS } from '../cli/src/lib/installer.js';
import { resolveHooks, HOOK_IDS } from '../cli/src/lib/hooks.js';

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
  // Hermes is global-only for skills; its skillTarget shapes the name/inner under the
  // global root (.hermes/skills/<name>/), so per-project emitSkillFile yields the bare relpath.
  eq('hermes path (global-only; bare relpath)', emitSkillFile('hermes', REL, SKILL).path, 'sp-plan/SKILL.md');
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

console.log('\n── emitSkillFile: .agents/ family emits identical bytes ──');
{
  // codex + antigravity share .agents/skills/<name>/ — they MUST emit byte-equal
  // content (incl. the subagent caveat, which SKILL triggers via its Agent tool),
  // or computeDesired's Map sees divergent content and a clean multi-agent install
  // false-flags the shared file as "customized". Regression guard.
  const cdx = emitSkillFile('codex', REL, SKILL);
  const agv = emitSkillFile('antigravity', REL, SKILL);
  eq('codex/antigravity share path', cdx.path, agv.path);
  eq('codex/antigravity byte-identical content', cdx.content, agv.content);
  has('caveat heading is agent-neutral', cdx.content, '## Running outside Claude Code');
  not('caveat does not name a specific agent', cdx.content, 'Running on');
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
  has('non-claude gets a caveat section', cu, '## Running outside Claude Code');
  has('subagent caveat present', cu, 'Subagents:');
  not('claude has no caveat section', emitSkillFile('claude', REL, SKILL).content, 'Running outside');

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
  // Claude now emits its rules hub as a merged section into CLAUDE.md (single source).
  const cl = emitRules('claude', BODY);
  eq('claude rules mode is merge', cl.mode, 'merge');
  eq('claude rules target CLAUDE.md', cl.path, '.claude/CLAUDE.md');
  has('claude section has begin marker', cl.content, RULES_BEGIN);
  has('claude section carries body', cl.content, 'rule one');

  const cu = emitRules('cursor', BODY);
  eq('cursor rules path', cu.path, '.cursor/rules/specpipe-rules.mdc');
  has('cursor rules alwaysApply', cu.content, 'alwaysApply: true');
  has('cursor rules carries body', cu.content, 'rule one');

  const ag = emitRules('antigravity', BODY);
  eq('antigravity rules path (.agents plural — v1.19.5+ default)', ag.path, '.agents/rules/specpipe-rules.md');
  not('antigravity rules: no fabricated frontmatter', ag.content, 'trigger:');

  const oc = emitRules('openclaw', BODY);
  eq('openclaw advisory doc path', oc.path, 'SPECPIPE-RULES.md');
  eq('openclaw mode is doc', oc.mode, 'doc');

  const cx = emitRules('codex', BODY);
  eq('codex targets AGENTS.md', cx.path, 'AGENTS.md');
  eq('codex mode is merge', cx.mode, 'merge');
  has('codex section has begin marker', cx.content, RULES_BEGIN);
  has('codex section has end marker', cx.content, RULES_END);
}

console.log('\n── emitHooks (enforced) ──');
{
  eq('hermes: no enforced hooks', agentHasHooks('hermes'), false);
  eq('openclaw: no enforced hooks', agentHasHooks('openclaw'), false);

  // Claude now emits its hooks from the registry too (settings.json + 5 scripts).
  const cl = emitHooks('claude');
  eq('claude hooks config path', cl.configPath, '.claude/settings.json');
  eq('claude ships 5 guard scripts', cl.scripts.length, 5);
  has('claude shell-guard wired with warn policy', cl.configContent, 'SECRET_POLICY=warn');
  has('claude read-guard wired', cl.configContent, 'specpipe-read-guard.sh');

  // Antigravity blocking hooks (.agents/hooks.json) — schema verified live on CLI 1.0.13:
  // named-hook map → event → [{matcher, hooks:[{type,command,timeout}]}], NO `enabled` bool,
  // command relative to the .agents hook cwd.
  eq('antigravity: now enforced', agentHasHooks('antigravity'), true);
  const ag = emitHooks('antigravity');
  eq('antigravity hooks config path', ag.configPath, '.agents/hooks.json');
  has('antigravity matcher run_command', ag.configContent, 'run_command');
  has('antigravity named-hook wrapper', ag.configContent, 'specpipe-guards');
  has('antigravity nested hooks array', ag.configContent, '"type": "command"');
  has('antigravity command relative to .agents cwd', ag.configContent, 'bash hooks/specpipe-shell-guard.sh');
  const agCfg = JSON.parse(ag.configContent);
  eq('antigravity has NO enabled bool', agCfg.enabled, undefined);
  eq('antigravity events nest under hook name', Array.isArray(agCfg['specpipe-guards'].PreToolUse), true);

  const cx = emitHooks('codex');
  eq('codex hooks config path', cx.configPath, '.codex/hooks.json');
  eq('codex ships shell-guard', cx.scripts.some((s) => s.dst === '.codex/hooks/specpipe-shell-guard.sh'), true);
  has('codex config wires the shell guard', cx.configContent, 'specpipe-shell-guard.sh');
  has('codex PreToolUse matcher', cx.configContent, 'PreToolUse');
  const okJson = (d, s) => { try { JSON.parse(s); ok(d); } catch { no(d, 'invalid JSON'); } };
  okJson('codex config is valid JSON', cx.configContent);

  const cu = emitHooks('cursor');
  eq('cursor hooks config path', cu.configPath, '.cursor/hooks.json');
  eq('cursor ships 3 guards (shell + read + file)', cu.scripts.length, 3);
  has('cursor config uses failClosed', cu.configContent, 'failClosed');
  has('cursor beforeReadFile guard', cu.configContent, 'beforeReadFile');
  has('cursor file-guard on postToolUse', cu.configContent, 'postToolUse');
  // file-guard is advisory → must NOT carry failClosed (it would block writes).
  const cuCfg = JSON.parse(cu.configContent);
  eq('cursor file-guard has no failClosed', cuCfg.hooks.postToolUse[0].failClosed, undefined);
  okJson('cursor config is valid JSON', cu.configContent);

  // --hooks selection
  eq('resolveHooks(all) = null', resolveHooks('all'), null);
  eq('resolveHooks(none) = empty set', resolveHooks('none').size, 0);
  eq('resolveHooks short name (shell→shell-guard)', resolveHooks('shell').has('shell-guard'), true);
  eq('claude --hooks none emits nothing', emitHooks('claude', resolveHooks('none')), null);
  eq('claude --hooks shell,read = 2 scripts', emitHooks('claude', resolveHooks('shell,read')).scripts.length, 2);
  eq('HOOK_IDS has 5 hooks', HOOK_IDS.length, 5);
  let hookThrew = false;
  try { resolveHooks('nope'); } catch { hookThrew = true; }
  eq('resolveHooks throws on unknown', hookThrew, true);
}

// ── global skills (per-agent user-level dirs) ──
console.log('\n── globalSkillRoot + emitSkillFileGlobal ──');
eq('claude globalSkillRoot', AGENTS.claude.globalSkillRoot, '.claude/skills');
eq('codex globalSkillRoot is ~/.codex/skills (NOT .agents)', AGENTS.codex.globalSkillRoot, '.codex/skills');
eq('antigravity globalSkillRoot is the CLI dir', AGENTS.antigravity.globalSkillRoot, '.gemini/antigravity-cli/skills');
eq('openclaw globalSkillRoot', AGENTS.openclaw.globalSkillRoot, '.openclaw/skills');
eq('hermes globalSkillRoot', AGENTS.hermes.globalSkillRoot, '.hermes/skills');
eq('hermes is global-only for skills', AGENTS.hermes.perProjectSkills, false);
eq('cursor has a native global dir (~/.cursor/skills)', AGENTS.cursor.globalSkillRoot, '.cursor/skills');

const gClaude = emitSkillFileGlobal('claude', REL, SKILL);
eq('claude global path roots at .claude/skills', gClaude.path, '.claude/skills/sp-plan/SKILL.md');
not('claude global skill keeps no name: field', gClaude.content, 'name: sp-plan');
const gCodex = emitSkillFileGlobal('codex', REL, SKILL);
eq('codex global path roots at .codex/skills (differs from project .agents)', gCodex.path, '.codex/skills/sp-plan/SKILL.md');
has('codex global skill gets per-agent name: field', gCodex.content, 'name: sp-plan');
eq('cursor global path roots at .cursor/skills', emitSkillFileGlobal('cursor', REL, SKILL).path, '.cursor/skills/sp-plan/SKILL.md');
eq('hermes global path roots at .hermes/skills', emitSkillFileGlobal('hermes', REL, SKILL).path, '.hermes/skills/sp-plan/SKILL.md');

// ── skill selection (resolveSkills / skillAllowed) ──
console.log('\n── skill selection ──');
eq('ALL_SKILL_NAMES has 13 skills', ALL_SKILL_NAMES.length, 13);
eq('resolveSkills("all") = null (all)', resolveSkills('all'), null);
eq('resolveSkills(undefined) = null (all)', resolveSkills(undefined), null);
const core = resolveSkills('core');
eq('core excludes sp-humanize (optional)', core.has('sp-humanize'), false);
eq('core excludes sp-spec-render (optional)', core.has('sp-spec-render'), false);
eq('core includes sp-build', core.has('sp-build'), true);
eq('core size = all − optional', core.size, ALL_SKILL_NAMES.length - OPTIONAL_SKILLS.length);
const two = resolveSkills('sp-build,fix');
eq('resolveSkills auto-prefixes sp- (fix → sp-fix)', two.has('sp-fix'), true);
eq('resolveSkills keeps explicit sp-build', two.has('sp-build'), true);
let skillThrew = false;
try { resolveSkills('nope'); } catch { skillThrew = true; }
eq('resolveSkills throws on unknown name', skillThrew, true);
eq('skillAllowed: null set passes everything', skillAllowed('skills/sp-humanize/SKILL.md', null), true);
eq('skillAllowed: filters out deselected skill', skillAllowed('skills/sp-humanize/SKILL.md', core), false);
eq('skillAllowed: keeps selected skill', skillAllowed('skills/sp-build/SKILL.md', core), true);
eq('skillAllowed: non-skill file always passes', skillAllowed('.claude/hooks/path-guard.sh', core), true);

console.log(`\n══════════════════════════════════`);
console.log(failed === 0 ? `\x1b[32m  All ${passed} tests passed\x1b[0m` : `\x1b[31m  ${failed} failed, ${passed} passed\x1b[0m`);
console.log(`══════════════════════════════════`);
process.exit(failed === 0 ? 0 : 1);
