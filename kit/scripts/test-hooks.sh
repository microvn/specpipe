#!/usr/bin/env bash
# test-hooks.sh — Hook unit tests
# Usage: bash scripts/test-hooks.sh [--filter PATTERN]
# Exit: 0 = all pass, 1 = failures

set -uo pipefail

FILTER=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --filter) FILTER="${2:-}"; shift 2 ;;
        *) FILTER="$1"; shift ;;
    esac
done

HOOKS_DIR="$(cd "$(dirname "$0")/../.claude/hooks" && pwd)"
PASS=0; FAIL=0

# Encode a string as a JSON string literal using node
json_str() { node -e "process.stdout.write(JSON.stringify(process.argv[1]))" -- "$1"; }

bash_payload() { printf '{"tool_name":"Bash","tool_input":{"command":%s}}' "$(json_str "$1")"; }

run() {
    local name="$1" hook="$2" payload="$3" expected_exit="$4"
    if [[ -n "$FILTER" && "$name" != *"$FILTER"* ]]; then return 0; fi
    local actual_exit=0
    printf '%s' "$payload" | bash "$HOOKS_DIR/$hook" >/dev/null 2>&1 || actual_exit=$?
    if [[ "$actual_exit" == "$expected_exit" ]]; then
        echo "[PASS] $name"
        PASS=$((PASS + 1))
    else
        echo "[FAIL] $name  (expected exit $expected_exit, got $actual_exit)"
        FAIL=$((FAIL + 1))
    fi
}

# ── path-guard.sh ──────────────────────────────────────────────────────────────

# Should BLOCK: reading/listing blocked dirs
run "pg: ls dist/"         path-guard.sh "$(bash_payload 'ls dist/')"                          2
run "pg: cat dist/file"    path-guard.sh "$(bash_payload 'cat dist/bundle.js')"                2
run "pg: find dist"        path-guard.sh "$(bash_payload 'find dist/ -name "*.js"')"           2
run "pg: head dist file"   path-guard.sh "$(bash_payload 'head -20 dist/server.js')"           2
run "pg: ls node_modules"  path-guard.sh "$(bash_payload 'ls node_modules/')"                  2
run "pg: cat node_modules" path-guard.sh "$(bash_payload 'cat node_modules/lodash/index.js')"  2
run "pg: ls build/"        path-guard.sh "$(bash_payload 'ls build/')"                         2
run "pg: wc dist file"     path-guard.sh "$(bash_payload 'wc -l dist/bundle.js')"              2

# Should ALLOW: existence/permission checks and variable assignments (no file content read)
# Regression: dist/ path as intermediate component in binary check — path-guard.sh:55 blocked this
run "pg: allow -x binary check" \
    path-guard.sh \
    "$(bash_payload 'B=~/.claude/skills/gstack/browse/dist/browse
if [ -x "$B" ]; then echo "READY: $B"; else echo "NEEDS_SETUP"; fi')" \
    0
run "pg: allow -f check"   path-guard.sh "$(bash_payload '[ -f /usr/local/dist/bin/tool ] && echo ok')" 0
run "pg: allow path assign" path-guard.sh "$(bash_payload 'TOOL=~/.claude/dist/mytool; "$TOOL" --version')" 0
run "pg: allow git command" path-guard.sh "$(bash_payload 'git rev-parse --show-toplevel')"    0
run "pg: allow empty"       path-guard.sh '{}'                                                 0

# ── End ───────────────────────────────────────────────────────────────────────

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
