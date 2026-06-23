/**
 * Agent registry + skill emitters.
 *
 * The canonical source of truth is the Claude-form skill:
 *   kit/skills/<skill>/SKILL.md  (agent-neutral source; frontmatter: description [+ allowed-tools], body markdown)
 *
 * Each target agent gets its own emitter that rewrites the install path, the
 * file name, and the frontmatter to that agent's native convention — while
 * keeping the markdown body unchanged. Formats verified 2026-06-22 against
 * each tool's docs / real repos; see docs/multi-agent.md for sources.
 */

/**
 * Parse a SKILL.md into ordered top-level frontmatter keys + body.
 * Block scalars (description: |) and their indented continuation lines are
 * kept attached to their key, so we can re-emit them verbatim.
 */
export function parseSkill(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { keys: [], body: content, hasFrontmatter: false };

  const lines = m[1].split('\n');
  const keys = [];
  let cur = null;
  for (const line of lines) {
    const km = line.match(/^([A-Za-z][\w-]*):(.*)$/);
    if (km && !/^\s/.test(line)) {
      cur = { key: km[1], lines: [line] };
      keys.push(cur);
    } else if (cur) {
      cur.lines.push(line);
    }
  }
  return { keys, body: m[2], hasFrontmatter: true };
}

function getKeyBlock(parsed, key) {
  const k = parsed.keys.find((x) => x.key === key);
  return k ? k.lines.join('\n') : null;
}

/** Wrap frontmatter + body back into a file. */
function compose(frontmatter, body) {
  return `---\n${frontmatter}\n---\n${body}`;
}

/**
 * Split a canonical skill relative path into its skill name + inner path.
 * Canonical skills live in the agent-neutral `kit/skills/` (relative: `skills/`);
 * each agent's emitter maps them to its own output location.
 *   'skills/ap-plan/SKILL.md'            -> { skill: 'ap-plan', inner: 'SKILL.md' }
 *   'skills/ap-scaffold/references/x.md' -> { skill: 'ap-scaffold', inner: 'references/x.md' }
 */
export function parseSkillPath(rel) {
  const m = rel.replace(/\\/g, '/').match(/^skills\/([^/]+)\/(.+)$/);
  if (!m) return null;
  return { skill: m[1], inner: m[2] };
}

// ── Frontmatter emitters (per agent) ──────────────────────────────────────

/** Claude: identity — keep the canonical frontmatter exactly. */
function fmClaude(parsed) {
  return parsed.keys.map((k) => k.lines.join('\n')).join('\n');
}

/** name + description only. allowed-tools (Claude-specific) is dropped. */
function fmNameDesc(parsed, name) {
  const desc = getKeyBlock(parsed, 'description') || 'description: ""';
  return `name: ${name}\n${desc}`;
}

/** Hermes adds version + a metadata.hermes.tags block. */
function fmHermes(parsed, name) {
  const desc = getKeyBlock(parsed, 'description') || 'description: ""';
  return [
    `name: ${name}`,
    desc,
    'version: 1.0.0',
    'metadata:',
    '  hermes:',
    '    tags: [agentpipe, spec-first, tdd]',
  ].join('\n');
}


// ── Agent registry ─────────────────────────────────────────────────────────

export const AGENTS = {
  claude: {
    label: 'Claude Code',
    // Verified: code.claude.com/docs/en/skills
    skillTarget: (name, inner) => `.claude/skills/${name}/${inner}`,
    globalRoot: '.claude/skills',
    skillFile: 'SKILL.md',
    hooks: 'native',
    capabilities: 'full',
    emitFrontmatter: fmClaude,
  },
  // Antigravity + Codex share the vendor-neutral `.agents/skills/` standard, so they emit
  // to the same path with identical frontmatter — computeDesired's Map dedups them (one
  // emission serves the family). Intentional; `list` then shows that file under one agent.
  antigravity: {
    label: 'Antigravity',
    // Verified: official Google Codelab — .agents/skills/<name>/SKILL.md
    skillTarget: (name, inner) => `.agents/skills/${name}/${inner}`,
    globalRoot: '.agents/skills',
    skillFile: 'SKILL.md',
    hooks: 'rules', // guards emitted to .agent/rules/ (plain markdown)
    capabilities: 'router-no-hooks',
    emitFrontmatter: fmNameDesc,
  },
  openclaw: {
    label: 'OpenClaw',
    // Verified: github.com/openclaw/openclaw  skills/<name>/SKILL.md
    skillTarget: (name, inner) => `skills/${name}/${inner}`,
    globalRoot: 'skills',
    skillFile: 'SKILL.md',
    hooks: 'none',
    capabilities: 'router-no-hooks',
    emitFrontmatter: fmNameDesc,
  },
  hermes: {
    label: 'Hermes-Agent',
    // Verified: github.com/NousResearch/hermes-agent  optional-skills/<cat>/<name>/SKILL.md
    skillTarget: (name, inner) => `optional-skills/agentpipe/${name}/${inner}`,
    globalRoot: 'optional-skills/agentpipe',
    skillFile: 'SKILL.md',
    hooks: 'none',
    capabilities: 'router-no-hooks',
    emitFrontmatter: fmHermes,
  },
  codex: {
    label: 'OpenAI Codex CLI',
    // Verified (developers.openai.com/codex/skills + openai/codex repo): Codex Agent
    // Skills live in the vendor-neutral `.agents/skills/` (NOT `.codex/skills/`, which
    // is a known non-working path — openai/codex#15136). Custom-prompts are deprecated.
    skillTarget: (name, inner) => `.agents/skills/${name}/${inner}`,
    globalRoot: '.agents/skills',
    skillFile: 'SKILL.md',
    hooks: 'agents-md', // guards fold into AGENTS.md (plain markdown, no frontmatter)
    capabilities: 'router-no-hooks',
    emitFrontmatter: fmNameDesc,
  },
  cursor: {
    label: 'Cursor',
    // Verified: cursor.com/help/customization/skills — Cursor has NATIVE skills at
    // .cursor/skills/<name>/SKILL.md (also reads .claude/skills & .agents/skills).
    // Skills are on-demand (/skill, @skill) — the correct home, not always-on .mdc rules.
    // Guards stay an always-on .cursor/rules/*.mdc (see RULES.cursor).
    skillTarget: (name, inner) => `.cursor/skills/${name}/${inner}`,
    globalRoot: '.cursor/skills',
    skillFile: 'SKILL.md',
    hooks: 'rules', // advisory now; Cursor DOES support blocking hooks (.cursor/hooks.json) — roadmapped
    capabilities: 'router-no-hooks',
    emitFrontmatter: fmNameDesc,
  },
};

export const AGENT_IDS = Object.keys(AGENTS);
export const DEFAULT_AGENT = 'claude';

/**
 * Resolve a --agents string into a validated list of agent ids.
 * 'all' -> every agent. Comma-separated -> those ids. Throws on unknown id.
 */
export function resolveAgents(spec) {
  if (!spec) return [DEFAULT_AGENT];
  if (spec === 'all') return [...AGENT_IDS];
  const ids = spec.split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = ids.filter((id) => !AGENTS[id]);
  if (unknown.length) {
    throw new Error(`Unknown agent(s): ${unknown.join(', ')}. Valid: ${AGENT_IDS.join(', ')}, all`);
  }
  return ids;
}

/**
 * Emit one canonical skill file for a target agent.
 * @param {string} agentId
 * @param {string} canonicalRel - e.g. '.claude/skills/ap-plan/SKILL.md'
 * @param {string} content - the canonical file content
 * @returns {{ path: string, content: string } | null} target rel path + content, or null if not a skill file
 */
export function emitSkillFile(agentId, canonicalRel, content) {
  const agent = AGENTS[agentId];
  if (!agent) throw new Error(`Unknown agent: ${agentId}`);

  const parts = parseSkillPath(canonicalRel);
  if (!parts) return null;
  const { skill, inner } = parts;

  const path = agent.skillTarget(skill, inner);

  // Non-SKILL.md files (references, templates, examples) copy verbatim.
  if (inner !== 'SKILL.md') return { path, content };

  // Claude is identity — skip the parse/recompose round-trip entirely.
  if (agentId === 'claude') return { path, content };

  const parsed = parseSkill(content);
  if (!parsed.hasFrontmatter) return { path, content };

  const body = adaptBody(agentId, parsed.body, toolsOf(parsed));
  return { path, content: compose(agent.emitFrontmatter(parsed, skill), body) };
}

/** Tools a canonical skill declares (from its `allowed-tools` frontmatter). */
function toolsOf(parsed) {
  const block = getKeyBlock(parsed, 'allowed-tools');
  if (!block) return [];
  return block.replace(/^allowed-tools:\s*/, '').split(',').map((s) => s.trim()).filter(Boolean);
}

// Phrase-level rewrites that turn Claude's `AskUserQuestion` tool references into
// an explicit, mechanism-named instruction every conversational agent can follow:
// present one structured multiple-choice question in plain text and wait. Ordered
// most-specific first so the result stays grammatical (not a bare token swap).
const ASK = 'a single plain-text multiple-choice question';
const ASK_SUBS = [
  [/go through the `?AskUserQuestion`? tool\s+—\s+never ask inline in text/gi, `be presented as ${ASK} (wait for the reply — don't bury choices in prose)`],
  [/\bthe `?AskUserQuestion`? tool\b/gi, ASK],
  [/\b(a single|one) `?AskUserQuestion`? call\b/gi, ASK],
  [/`?AskUserQuestion`? call\b/gi, ASK],
  [/`?AskUserQuestion`? format\b/gi, 'question format'],
  [/\bEvery `?AskUserQuestion`?\b/g, 'Every question'],
  [/\b(via|through|with|using) `?AskUserQuestion`?/gi, `$1 ${ASK}`],
  [/\b[Uu]se `?AskUserQuestion`?/g, `ask ${ASK}`],
  [/`?AskUserQuestion`?/g, ASK],
];

function rewriteAsk(body) {
  return ASK_SUBS.reduce((s, [re, to]) => s.replace(re, to), body);
}

/**
 * Adapt a skill body for a non-Claude agent (Phase 3). Claude gets the body
 * verbatim. For other agents:
 *  - AskUserQuestion references are rewritten in place into an explicit
 *    "plain-text multiple-choice question" instruction (mechanism named, so the
 *    agent knows exactly what to do — not vague prose).
 *  - Subagent orchestration can't be fixed by wording (it's an execution model),
 *    so it gets an honest caveat appended.
 *  - GraphAtlas already self-degrades in the body ("if GA available … else grep"),
 *    so it needs no adaptation.
 */
function adaptBody(agentId, body, tools) {
  if (agentId === 'claude') return body;

  const has = (name) => tools.some((t) => t === name || t.startsWith(name));
  let out = rewriteAsk(body);

  if (has('Agent') || has('Task')) {
    out = `${out.replace(/\s*$/, '')}\n\n---\n\n## Running on ${AGENTS[agentId].label}\n\n` +
      '- **Subagents:** parts of this skill describe Claude subagent orchestration ' +
      '(parallel waves, worktrees, auto-mode dispatch). If your runtime has no ' +
      'subagents, do that work yourself — one item at a time, sequentially, in this ' +
      'session — and skip the parallel/worktree mechanics.\n';
  }
  return out;
}

/**
 * Emit ANY canonical template file for an agent.
 * Skill files are transformed (see emitSkillFile); everything else (hooks,
 * config, docs) is copied verbatim at its original relative path. This gives
 * lifecycle commands a single way to reproduce a file's desired content.
 * @returns {{ path: string, content: string }}
 */
export function emitFile(agentId, templateRel, content) {
  const skill = emitSkillFile(agentId, templateRel, content);
  return skill || { path: templateRel, content };
}

// Guardrails (advisory rules) + enforced (blocking) hooks live in agent-guards.js;
// re-exported here so callers keep importing them from agents.js.
export {
  GUARDS_BEGIN, GUARDS_END, HOOKS_SRC_DIR,
  agentRulesMode, emitRules, agentHasHooks, emitHooks,
} from './agent-guards.js';
