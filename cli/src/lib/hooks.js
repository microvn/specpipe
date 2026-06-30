// Hook registry — the single source of truth for guard hooks and how each agent
// declares them. Scripts live in kit/hooks/ and are emitted into each agent's hook
// dir; each agent's native config file is generated from this map. Formats verified
// 2026-06-28 against each agent's docs (see docs/multi-agent.md § Sources).
//
// Enforced (blocking) agents and their config shapes differ:
//   claude      .claude/settings.json   {hooks:{Event:[{matcher,hooks:[{type,command}]}]}}
//   codex       .codex/hooks.json       (same nested shape)              matcher "Bash"
//   cursor      .cursor/hooks.json      {version:1,hooks:{beforeX:[{command,failClosed}]}}
//   antigravity .agents/hooks.json      {enabled:true,Event:[{matcher,command,timeout}]}  matcher "run_command"
//
// Command payloads the guard scripts read (multi-payload in specpipe-shell-guard.sh):
//   .tool_input.command (Claude/Codex) · .command (Cursor) · .tool_args.CommandLine (Antigravity)

export const HOOKS_DIR = 'hooks'; // kit-relative source dir for every script

// Each guard hook: its script + which agents wire it, and where.
//   shell/read run on bash; the JS guards are Claude-only (no equivalent event elsewhere).
export const HOOKS = {
  'shell-guard': {
    script: 'specpipe-shell-guard.sh', run: 'bash',
    desc: 'block wasteful-dir exploration + secret access in shell commands',
    wiring: {
      claude:      { event: 'PreToolUse', matcher: 'Bash', env: { SECRET_POLICY: 'warn' } },
      codex:       { event: 'PreToolUse', matcher: 'Bash' },
      cursor:      { event: 'beforeShellExecution' },
      antigravity: { event: 'PreToolUse', matcher: 'run_command' },
    },
  },
  'read-guard': {
    script: 'specpipe-read-guard.sh', run: 'bash',
    desc: 'block reads of secret files',
    wiring: {
      claude: { event: 'PreToolUse', matcher: 'Read|Write|Edit|MultiEdit|Grep' },
      cursor: { event: 'beforeReadFile' },
    },
  },
  'comment-guard': {
    script: 'comment-guard.js', run: 'node',
    desc: 'block placeholder-comment replacements',
    wiring: { claude: { event: 'PreToolUse', matcher: 'Edit|MultiEdit' } },
  },
  'glob-guard': {
    script: 'glob-guard.js', run: 'node',
    desc: 'block overly broad globs',
    wiring: { claude: { event: 'PreToolUse', matcher: 'Glob' } },
  },
  'file-guard': {
    script: 'file-guard.js', run: 'node',
    desc: 'warn on large source files',
    wiring: {
      claude: { event: 'PostToolUse', matcher: 'Write|Edit|MultiEdit' },
      // Cursor: generic postToolUse fires for every tool (no matcher) — the guard
      // self-filters to writes by tool_name and injects its warning via
      // `additional_context`. Advisory (never blocks), so no failClosed. Verified
      // live on Cursor 2026.06: postToolUse payload carries tool_name + tool_input.file_path.
      cursor: { event: 'postToolUse', advisory: true },
    },
  },
};

export const HOOK_IDS = Object.keys(HOOKS);
export const ALL_HOOK_NAMES = HOOK_IDS;

/** Agents with a droppable, verified blocking-hook config. */
export const HOOK_AGENTS = ['claude', 'codex', 'cursor', 'antigravity'];

/**
 * Resolve a `--hooks` value into a Set of selected hook ids, or null = all.
 * 'none' → empty Set (option A: install no guard hooks). Accepts ids with or
 * without the `-guard` suffix (e.g. `shell` or `shell-guard`).
 */
export function resolveHooks(spec) {
  if (spec === undefined || spec === null || spec === 'all') return null;
  if (spec === 'none') return new Set();
  const norm = (n) => (HOOKS[n] ? n : (HOOKS[`${n}-guard`] ? `${n}-guard` : n));
  const names = spec.split(',').map((s) => s.trim()).filter(Boolean).map(norm);
  const unknown = names.filter((n) => !HOOKS[n]);
  if (unknown.length) {
    throw new Error(`Unknown hook(s): ${unknown.join(', ')}. Valid: ${HOOK_IDS.join(', ')}, all, none`);
  }
  return new Set(names);
}

/** Whether a hook id is selected (null = all). */
export function hookSelected(id, hooksSet) {
  return !hooksSet || hooksSet.has(id);
}

/** The hook ids an agent wires, filtered by selection. */
function wiredHookIds(agentId, hooksSet) {
  return HOOK_IDS.filter((id) => HOOKS[id].wiring[agentId] && hookSelected(id, hooksSet));
}

/** Scripts an agent installs (kit-relative src + on-disk dst), filtered by selection. */
export function hookScriptsFor(agentId, hooksDir, hooksSet = null) {
  return wiredHookIds(agentId, hooksSet).map((id) => ({
    src: `${HOOKS_DIR}/${HOOKS[id].script}`,
    dst: `${hooksDir}/${HOOKS[id].script}`,
    run: HOOKS[id].run,
  }));
}

// Build the command string an agent's config runs for a hook.
// `ref` is how the agent references the script path (e.g. "$CLAUDE_PROJECT_DIR"/.claude/hooks).
function commandFor(id, agentId, ref) {
  const h = HOOKS[id];
  const env = h.wiring[agentId].env
    ? Object.entries(h.wiring[agentId].env).map(([k, v]) => `${k}=${v} `).join('')
    : '';
  return `${env}${h.run} ${ref}/${h.script}`;
}

// Where each agent's scripts + config live, and how its config references the
// scripts. `ref` is per-project; the global Claude install passes an absolute ref.
export const HOOK_TARGETS = {
  claude:      { dir: '.claude/hooks', configPath: '.claude/settings.json', ref: '"$CLAUDE_PROJECT_DIR"/.claude/hooks' },
  codex:       { dir: '.codex/hooks',  configPath: '.codex/hooks.json',     ref: '.codex/hooks' },
  cursor:      { dir: '.cursor/hooks', configPath: '.cursor/hooks.json',    ref: '.cursor/hooks' },
  // Antigravity runs hook commands with cwd = <project>/.agents (verified live on 1.0.13),
  // so the command path is relative to .agents → `hooks/<script>`, NOT `.agents/hooks/<script>`.
  antigravity: { dir: '.agents/hooks', configPath: '.agents/hooks.json',    ref: 'hooks' },
};

/**
 * Generate an agent's native hook-config object from the registry, honoring the
 * hook selection. `ref` is the path prefix the agent uses to reach the installed
 * scripts. Returns null when the agent wires no hooks (or selection is empty).
 * Shapes are per-agent and verified; see the table at the top of the file.
 */
export function buildHookConfig(agentId, ref, hooksSet = null) {
  const ids = wiredHookIds(agentId, hooksSet);
  if (!ids.length) return null;

  if (agentId === 'claude' || agentId === 'codex') {
    // { hooks: { Event: [ { matcher, hooks: [ { type:'command', command } ] } ] } }
    const events = {};
    for (const id of ids) {
      const w = HOOKS[id].wiring[agentId];
      (events[w.event] ??= []).push({
        matcher: w.matcher,
        hooks: [{ type: 'command', command: commandFor(id, agentId, ref) }],
      });
    }
    return { hooks: events };
  }

  if (agentId === 'cursor') {
    // { version:1, hooks: { beforeShellExecution:[{command,failClosed}], postToolUse:[{command}] } }
    // Blocking before-hooks use failClosed (deny if the hook errors); advisory post-hooks
    // (file-guard, which only injects a warning) must NOT — failClosed there would block writes.
    const events = {};
    for (const id of ids) {
      const w = HOOKS[id].wiring.cursor;
      const entry = { command: `${ref}/${HOOKS[id].script}` };
      if (!w.advisory) entry.failClosed = true;
      (events[w.event] ??= []).push(entry);
    }
    return { version: 1, hooks: events };
  }

  if (agentId === 'antigravity') {
    // { "<hook-name>": { Event: [ { matcher, hooks: [ { type:'command', command, timeout } ] } ] } }
    // Top level is a MAP of hook-NAME → spec; events nest inside, each an ARRAY of matcher
    // groups with a nested `hooks` array. NO top-level `enabled` (a bool there makes
    // Antigravity's Go parser reject the whole file → no hooks load). Verified live against
    // Antigravity CLI 1.0.13 (jsonhook schema).
    const events = {};
    for (const id of ids) {
      const w = HOOKS[id].wiring.antigravity;
      (events[w.event] ??= []).push({
        matcher: w.matcher,
        hooks: [{ type: 'command', command: commandFor(id, agentId, ref), timeout: 15 }],
      });
    }
    return { 'specpipe-guards': events };
  }

  return null;
}

/** Whether an agent has a droppable, verified enforced-hook config. */
export function agentHasHooks(agentId) {
  return !!HOOK_TARGETS[agentId];
}

/**
 * Emit an agent's enforced-hook artifacts: the scripts to copy (kit-relative src +
 * on-disk dst) and the generated config file. Honors the hook selection (null=all,
 * empty Set=none). Returns null when the agent wires no hooks for this selection.
 */
export function emitHooks(agentId, hooksSet = null) {
  const t = HOOK_TARGETS[agentId];
  if (!t) return null;
  const cfg = buildHookConfig(agentId, t.ref, hooksSet);
  if (!cfg) return null;
  return {
    hooksDir: t.dir,
    scripts: hookScriptsFor(agentId, t.dir, hooksSet),
    configPath: t.configPath,
    configContent: JSON.stringify(cfg, null, 2) + '\n',
  };
}
