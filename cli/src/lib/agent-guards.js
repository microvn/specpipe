// Guardrails (advisory rules) + enforced (blocking) hooks per agent.
// Claude enforces guards via its native .claude/hooks; every other agent gets the
// same intent as an always-on RULE. Codex/Cursor additionally support blocking
// hooks (verified payloads), so they also get enforced guard scripts.

const RULES = {
  cursor: {
    mode: 'file',
    path: '.cursor/rules/agentpipe-guards.mdc',
    frontmatter: 'description: agentpipe operating rules — spec-first cycle, guardrails, testing, conventions\nglobs:\nalwaysApply: true',
  },
  // Antigravity rules are plain markdown (no documented trigger/glob frontmatter);
  // official Google DevRel uses the singular `.agent/rules/` path.
  antigravity: { mode: 'doc', path: '.agent/rules/agentpipe-guards.md' },
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
  if (r.mode === 'doc') return { mode: 'doc', path: r.path, content: `# agentpipe — operating rules\n\n${body}` };
  // agents-md: a marked section merged into a shared AGENTS.md
  return { mode: 'agents-md', path: r.path, content: `${GUARDS_BEGIN}\n## agentpipe — operating rules\n\n${body}${GUARDS_END}\n` };
}

// ── Enforced hooks (block tool calls, not just advise) ──────────────────────
// Agents whose hook payloads + block primitive (exit 2) are verified compatible
// with the shared guard scripts (kit/hooks/agentpipe-*.sh). Claude has its own
// .claude/hooks; Antigravity/Hermes lack a usable blocking-hook surface → omitted.
const SHELL_GUARD = 'agentpipe-shell-guard.sh';
const READ_GUARD = 'agentpipe-read-guard.sh';

const EHOOKS = {
  // Codex PreToolUse payload == Claude's (.tool_input.command); exit 2 blocks.
  // Verified matcher: "Bash". Read/Edit tool names unverified → shell guard only.
  codex: {
    dir: '.codex/hooks',
    scripts: [SHELL_GUARD],
    configPath: '.codex/hooks.json',
    config: {
      hooks: {
        PreToolUse: [
          { matcher: 'Bash', hooks: [{ type: 'command', command: `bash .codex/hooks/${SHELL_GUARD}` }] },
        ],
      },
    },
  },
  // Cursor: beforeShellExecution (.command) + beforeReadFile (.file_path) verified;
  // fail-open by default, so failClosed: true to actually enforce.
  cursor: {
    dir: '.cursor/hooks',
    scripts: [SHELL_GUARD, READ_GUARD],
    configPath: '.cursor/hooks.json',
    config: {
      version: 1,
      hooks: {
        beforeShellExecution: [{ command: `./.cursor/hooks/${SHELL_GUARD}`, failClosed: true }],
        beforeReadFile: [{ command: `./.cursor/hooks/${READ_GUARD}`, failClosed: true }],
      },
    },
  },
};

/** Kit-relative source path for a guard script. */
export const HOOKS_SRC_DIR = 'hooks';

/** Whether an agent gets enforced (blocking) hooks beyond advisory rules. */
export function agentHasHooks(agentId) {
  return !!EHOOKS[agentId];
}

/**
 * Emit an agent's enforced-hook artifacts (Codex/Cursor). Returns the scripts to
 * copy (kit-relative src + on-disk dst) and the hook config file to write, or null.
 */
export function emitHooks(agentId) {
  const h = EHOOKS[agentId];
  if (!h) return null;
  return {
    hooksDir: h.dir,
    scripts: h.scripts.map((name) => ({ src: `${HOOKS_SRC_DIR}/${name}`, dst: `${h.dir}/${name}` })),
    configPath: h.configPath,
    configContent: JSON.stringify(h.config, null, 2) + '\n',
  };
}
