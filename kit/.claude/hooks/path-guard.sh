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

# Extract command from JSON — try node first, fall back to grep/sed
extract_command() {
    if command -v node &>/dev/null; then
        printf '%s' "$1" | node -e "
          try {
            const d = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
            const cmd = d.tool_input?.command;
            if (typeof cmd === 'string') process.stdout.write(cmd);
          } catch {}
        " 2>/dev/null
    else
        # Lightweight fallback: extract "command":"..." from JSON
        printf '%s' "$1" | grep -o '"command":"[^"]*"' | head -1 | sed 's/^"command":"//;s/"$//' 2>/dev/null
    fi
}

COMMAND=$(extract_command "$INPUT") || exit 0

[[ -z "$COMMAND" ]] && exit 0

# ─── Blocked directory patterns ─────────────────────────────────────

# Use word boundaries (\b) and explicit path separators to avoid substring false positives
# e.g. "build/" should not match "rebuild/src" or "my-build-tool"
BLOCKED="(^|[ /])node_modules(/|$| )"
BLOCKED+="|(__pycache__)"
BLOCKED+="|\.git/(objects|refs)"
BLOCKED+="|(^|[ /])dist(/|$| )"
BLOCKED+="|(^|[ /])build(/|$| )"
BLOCKED+="|\.next/"
BLOCKED+="|(^|[ /])vendor(/|$| )"
BLOCKED+="|(^|[ /])Pods(/|$| )"
BLOCKED+="|\.build/"
BLOCKED+="|DerivedData"
BLOCKED+="|\.gradle/"
BLOCKED+="|target/(debug|release)(/|$| )"
BLOCKED+="|\.nuget"
BLOCKED+="|\.cache(/|$| )"

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
