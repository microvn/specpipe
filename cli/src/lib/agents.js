/**
 * Agent registry + skill emitters.
 *
 * The canonical source of truth is the Claude-form skill:
 *   kit/.claude/skills/<skill>/SKILL.md  (frontmatter: description [+ allowed-tools], body markdown)
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
 *   '.claude/skills/ap-plan/SKILL.md'            -> { skill: 'ap-plan', inner: 'SKILL.md' }
 *   '.claude/skills/ap-scaffold/references/x.md' -> { skill: 'ap-scaffold', inner: 'references/x.md' }
 */
export function parseSkillPath(rel) {
  const m = rel.replace(/\\/g, '/').match(/^\.claude\/skills\/([^/]+)\/(.+)$/);
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

/** Cursor .mdc rules: description + globs + alwaysApply (no name; filename is the id). */
function fmCursor(parsed) {
  const desc = getKeyBlock(parsed, 'description') || 'description: ""';
  return [desc, 'globs:', 'alwaysApply: false'].join('\n');
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
  antigravity: {
    label: 'Antigravity',
    // Verified path convention via GitHub code search: .agents/skills/ (plural) dominant
    skillTarget: (name, inner) => `.agents/skills/${name}/${inner}`,
    globalRoot: '.agents/skills',
    skillFile: 'SKILL.md',
    hooks: 'rules', // .agent(s)/rules — translated in a later phase
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
    // Codex Agent Skills (custom-prompts deprecated). Project-scoped skills dir.
    skillTarget: (name, inner) => `.codex/skills/${name}/${inner}`,
    globalRoot: '.codex/skills',
    skillFile: 'SKILL.md',
    hooks: 'agents-md', // guard-intent folds into AGENTS.md in a later phase
    capabilities: 'router-no-hooks',
    emitFrontmatter: fmNameDesc,
  },
  cursor: {
    label: 'Cursor',
    // Verified: cursor.com/docs/rules  .cursor/rules/<name>.mdc  (flat, MDC)
    // SKILL.md -> <name>.mdc ; reference files land under .cursor/rules/<name>/
    skillTarget: (name, inner) =>
      inner === 'SKILL.md' ? `.cursor/rules/${name}.mdc` : `.cursor/rules/${name}/${inner}`,
    globalRoot: '.cursor/rules',
    skillFile: 'SKILL.md',
    hooks: 'rules',
    capabilities: 'manual-no-hooks', // invoked via @name, no slash + no auto-description
    emitFrontmatter: fmCursor,
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

/**
 * Keep the body verbatim, but append a capability-adaptation section when the
 * skill declares Claude-specific tools the target agent may not have. This is
 * how a skill "degrades gracefully" instead of silently assuming Claude's
 * tool surface (Phase 3). Claude itself gets the body unchanged.
 */
function adaptBody(agentId, body, tools) {
  if (agentId === 'claude') return body;

  const has = (name) => tools.some((t) => t === name || t.startsWith(name));
  const notes = [];
  if (has('AskUserQuestion')) {
    notes.push('- **Asking the user:** written for Claude\'s `AskUserQuestion` tool. Present the same choices in plain text and wait for the answer before proceeding.');
  }
  if (has('Agent') || has('Task')) {
    notes.push('- **Subagents:** this skill may dispatch subagents (Claude\'s `Task`/`Agent`). If your runtime can\'t spawn subagents, perform each delegated step yourself, sequentially, in this same session.');
  }
  if (has('mcp__graphatlas')) {
    notes.push('- **GraphAtlas MCP:** optional code-graph tool. If unavailable, fall back to `grep` and file search.');
  }
  if (!notes.length) return body;

  return `${body.replace(/\s*$/, '')}\n\n---\n\n## Running outside Claude Code\n\nThis skill was authored for Claude Code. On ${AGENTS[agentId].label}:\n\n${notes.join('\n')}\n`;
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

// ── Guardrails (Phase 2) ────────────────────────────────────────────────────
// Claude enforces guards via native hooks. Every other agent gets the same
// intent as an always-on RULE — advisory, not enforced. OpenClaw/Hermes have no
// rules system, so they get a plain advisory doc.

const RULES = {
  cursor: {
    mode: 'file',
    path: '.cursor/rules/agentpipe-guards.mdc',
    frontmatter: 'description: agentpipe guardrails — always-on engineering constraints\nglobs:\nalwaysApply: true',
  },
  antigravity: {
    mode: 'file',
    path: '.agents/rules/agentpipe-guards.md',
    frontmatter: 'trigger: always_on\nglobs: ["**/*"]',
  },
  codex: { mode: 'agents-md', path: 'AGENTS.md' },
  openclaw: { mode: 'doc', path: 'AGENTPIPE-GUARDS.md' },
  hermes: { mode: 'doc', path: 'AGENTPIPE-GUARDS.md' },
};

export const GUARDS_BEGIN = '<!-- agentpipe:guards:begin -->';
export const GUARDS_END = '<!-- agentpipe:guards:end -->';

/** How an agent carries guardrails: 'file' | 'doc' | 'agents-md' | null (native hooks). */
export function agentRulesMode(agentId) {
  return RULES[agentId]?.mode || null;
}

/**
 * Emit the guardrails artifact for an agent from the canonical guards body.
 * @returns {{ mode, path, content } | null} null for Claude (native hooks).
 */
export function emitRules(agentId, body) {
  const r = RULES[agentId];
  if (!r) return null;
  if (r.mode === 'file') return { mode: 'file', path: r.path, content: `---\n${r.frontmatter}\n---\n${body}` };
  if (r.mode === 'doc') return { mode: 'doc', path: r.path, content: `# agentpipe guardrails\n\n${body}` };
  // agents-md: a marked section merged into a shared AGENTS.md
  return { mode: 'agents-md', path: r.path, content: `${GUARDS_BEGIN}\n## agentpipe guardrails\n\n${body}${GUARDS_END}\n` };
}
