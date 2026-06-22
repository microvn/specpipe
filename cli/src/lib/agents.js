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

  return { path, content: compose(agent.emitFrontmatter(parsed, skill), parsed.body) };
}
