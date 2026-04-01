#!/usr/bin/env bash
# path-guard.sh — PreToolUse hook for Claude Code
#
# Blocks Bash commands that target directories known to be large and wasteful
# to explore (node_modules, build artifacts, .git internals, etc.).
#
# Exit codes:
#   0 — command allowed
#   2 — command blocked (policy)
#
# Environment:
#   PATH_GUARD_EXTRA — additional pipe-separated patterns to block
#                      e.g. "\.terraform|\.vagrant"

set -euo pipefail

# ─── Read hook payload from stdin ───────────────────────────────────

INPUT=$(cat)
[[ -z "$INPUT" ]] && exit 0

# Check Node.js availability
if ! command -v node &>/dev/null; then
    echo "WARNING: path-guard disabled — Node.js not found." >&2
    exit 0
fi

# Parse JSON with inline Node.js (avoids jq dependency)
COMMAND=$(printf '%s' "$INPUT" | node -e "
  try {
    const d = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
    const cmd = d.tool_input?.command;
    if (typeof cmd === 'string') process.stdout.write(cmd);
    else process.exit(0);
  } catch { process.exit(0); }
" 2>/dev/null) || exit 0

[[ -z "$COMMAND" ]] && exit 0

# ─── Blocked directory patterns ─────────────────────────────────────

BLOCKED="node_modules"
BLOCKED+="|__pycache__"
BLOCKED+="|\.git/objects"
BLOCKED+="|\.git/refs"
BLOCKED+="|dist/"
BLOCKED+="|build/"
BLOCKED+="|\.next/"
BLOCKED+="|vendor/"
BLOCKED+="|Pods/"
BLOCKED+="|\.build/"
BLOCKED+="|DerivedData"
BLOCKED+="|\.gradle/"
BLOCKED+="|target/debug"
BLOCKED+="|target/release"
BLOCKED+="|\.nuget"
BLOCKED+="|\.cache"

# Append project-specific patterns from env
if [[ -n "${PATH_GUARD_EXTRA:-}" ]]; then
    BLOCKED+="|$PATH_GUARD_EXTRA"
fi

# ─── Match and block ────────────────────────────────────────────────

if printf '%s\n' "$COMMAND" | grep -qE "$BLOCKED"; then
    # Extract which pattern matched for a useful error message
    MATCHED=$(printf '%s\n' "$COMMAND" | grep -oE "$BLOCKED" | head -1)
    echo "Blocked: command references '$MATCHED' — this directory is typically large and exploring it wastes tokens. Use Glob or Grep tools instead." >&2
    exit 2
fi

exit 0
