// Operating rules (the single rich source kit/rules/specpipe-rules.md) emitted per
// agent into its project-config file. Claude → CLAUDE.md and Codex → AGENTS.md get a
// marked section merged into the (possibly pre-existing) shared file; the others get
// an owned rules file. Enforced (blocking) hooks are separate (hooks.js).

const RULES = {
  // Claude reads .claude/CLAUDE.md — merge our section in, don't clobber the user's file.
  claude: { mode: 'merge', path: '.claude/CLAUDE.md' },
  cursor: {
    mode: 'file',
    path: '.cursor/rules/specpipe-rules.mdc',
    frontmatter: 'description: specpipe operating rules — spec-first cycle, guardrails, testing, conventions\nglobs:\nalwaysApply: true',
  },
  // Antigravity rules are plain markdown (no documented trigger/glob frontmatter).
  // Antigravity moved its default workspace-rules dir to `.agents/rules/` (plural) as of
  // v1.19.5 — the team rep confirmed `.agents` is the path "going forward"; `.agent/rules`
  // (singular) is only a backward-compat fallback. Use the plural default, which also lines
  // up with Antigravity's `.agents/skills/` + `.agents/hooks.json`.
  // Source: discuss.ai.google.dev/t/new-folder-for-rules/126165
  antigravity: { mode: 'doc', path: '.agents/rules/specpipe-rules.md' },
  codex: { mode: 'merge', path: 'AGENTS.md' },
  openclaw: { mode: 'doc', path: 'SPECPIPE-RULES.md' },
  hermes: { mode: 'doc', path: 'SPECPIPE-RULES.md' },
};

export const RULES_BEGIN = '<!-- specpipe:rules:begin -->';
export const RULES_END = '<!-- specpipe:rules:end -->';

/** How an agent carries its rules: 'merge' (marked section in a shared file) | 'file' | 'doc' | null. */
export function agentRulesMode(agentId) {
  return RULES[agentId]?.mode || null;
}

/**
 * Emit an agent's rules artifact from the canonical rules body. 'merge' agents
 * (Claude → CLAUDE.md, Codex → AGENTS.md) get a marked section to merge into a shared
 * file; the rest get an owned file (Cursor .mdc, Antigravity/OpenClaw/Hermes doc).
 * @returns {{ mode, path, content } | null}
 */
export function emitRules(agentId, body) {
  const r = RULES[agentId];
  if (!r) return null;
  if (r.mode === 'file') return { mode: 'file', path: r.path, content: `---\n${r.frontmatter}\n---\n${body}` };
  if (r.mode === 'doc') return { mode: 'doc', path: r.path, content: `# specpipe — operating rules\n\n${body}` };
  // merge: a marked section merged into a shared CLAUDE.md / AGENTS.md. Force a
  // newline before the END marker so it always sits on its own line — otherwise a
  // rules source that doesn't end in \n would glue the body to the marker and break
  // stripRulesSection's line-based match.
  return { mode: 'merge', path: r.path, content: `${RULES_BEGIN}\n## specpipe — operating rules\n\n${body.replace(/\n*$/, '\n')}${RULES_END}\n` };
}

// ── Enforced hooks ──────────────────────────────────────────────────────────
// The hook registry (which agents block which tool calls + each agent's verified
// config shape, including Claude and Antigravity) lives in hooks.js. Re-exported
// here so callers keep importing from agents.js. HOOKS_SRC_DIR stays as an alias.
export { emitHooks, agentHasHooks, HOOKS_DIR as HOOKS_SRC_DIR } from './hooks.js';
