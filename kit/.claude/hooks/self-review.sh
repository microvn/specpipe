#!/usr/bin/env bash
# self-review.sh — Stop hook for Claude Code
#
# Injects a self-review checklist when Claude is about to finish.
# Non-blocking: always exits 0, just adds context for Claude to consider.
#
# Environment:
#   SELF_REVIEW_ENABLED — set to "false" to disable (default: true)

# No set -euo pipefail — this hook must NEVER fail

# Check if disabled
if [[ "${SELF_REVIEW_ENABLED:-true}" == "false" ]]; then
    exit 0
fi

# Read stdin (Stop event payload — may be empty or minimal)
cat > /dev/null 2>&1 || true

# Inject self-review checklist as context
cat <<'REVIEW_JSON'
{
  "continue": true,
  "systemMessage": "Self-review before finishing:\n1. Did you leave any TODO/FIXME comments that should be resolved now?\n2. Did you create mock or fake implementations just to pass tests?\n3. Did you replace real code with placeholder comments like '// ... existing code'?\n4. Do all changed files compile and typecheck cleanly?\n5. Did you run the full test suite, not just the new tests?\n6. Are there any files you modified but forgot to include in the summary?"
}
REVIEW_JSON
