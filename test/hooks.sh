#!/usr/bin/env bash
# test/hooks.sh — Integration tests for kit/.claude/hooks/*
#
# Tests actual I/O behavior: pipe JSON to each hook, assert exit code + output.
# Run from repo root: bash test/hooks.sh
#
# Exit 0 = all passed. Exit 1 = failures.

set -euo pipefail

HOOKS_DIR="$(cd "$(dirname "$0")/../kit/.claude/hooks" && pwd)"
PASSED=0
FAILED=0

# ─── Output helpers ───────────────────────────────────────────────────────────

green() { printf '\033[32m%s\033[0m\n' "$1"; }
red()   { printf '\033[31m%s\033[0m\n' "$1"; }

pass() { PASSED=$((PASSED+1)); green "  ✓ $1"; }
fail() { FAILED=$((FAILED+1)); red   "  ✗ $1"; }

section() { printf '\n── %s ──\n' "$1"; }

# ─── Hook runners ─────────────────────────────────────────────────────────────

# Run a bash hook, capture exit code. Extra args become env vars (KEY=val).
bash_exit() {
  local hook="$1" input="$2"; shift 2
  local _exit
  env "$@" bash "$hook" >/dev/null 2>/dev/null <<< "$input" || true
  # Can't use $? after || true — run again just for exit code
  env "$@" bash "$hook" >/dev/null 2>/dev/null <<< "$input"
  echo $?
}

# Simpler: capture exit code correctly
run_bash() {
  local hook="$1" input="$2"; shift 2
  env "$@" bash "$hook" >/dev/null 2>/dev/null <<< "$input"
}

run_node() {
  local hook="$1" input="$2"; shift 2
  env "$@" node "$hook" >/dev/null 2>/dev/null <<< "$input"
}

exit_bash() {
  local hook="$1" input="$2"; shift 2
  run_bash "$hook" "$input" "$@" && echo 0 || echo $?
}

exit_node() {
  local hook="$1" input="$2"; shift 2
  run_node "$hook" "$input" "$@" && echo 0 || echo $?
}

stdout_bash() {
  local hook="$1" input="$2"; shift 2
  env "$@" bash "$hook" 2>/dev/null <<< "$input" || true
}

stdout_node() {
  local hook="$1" input="$2"; shift 2
  env "$@" node "$hook" 2>/dev/null <<< "$input" || true
}

stderr_bash() {
  local hook="$1" input="$2"; shift 2
  env "$@" bash "$hook" 2>&1 >/dev/null <<< "$input" || true
}

stderr_node() {
  local hook="$1" input="$2"; shift 2
  env "$@" node "$hook" 2>&1 >/dev/null <<< "$input" || true
}

# ─── Assertions ───────────────────────────────────────────────────────────────

assert_exit() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    pass "$desc"
  else
    fail "$desc  [expected exit $expected, got $actual]"
  fi
}

assert_contains() {
  local desc="$1" needle="$2" haystack="$3"
  if [[ "$haystack" == *"$needle"* ]]; then
    pass "$desc"
  else
    fail "$desc  [expected to contain: $needle]"
  fi
}

assert_not_contains() {
  local desc="$1" needle="$2" haystack="$3"
  if [[ "$haystack" != *"$needle"* ]]; then
    pass "$desc"
  else
    fail "$desc  [expected NOT to contain: $needle]"
  fi
}

# ══════════════════════════════════════════════════════════════════════════════
# path-guard.sh
# ══════════════════════════════════════════════════════════════════════════════
section "path-guard.sh"

PG="$HOOKS_DIR/path-guard.sh"

# Allow: normal commands
assert_exit "allow: ls src/"               0 "$(exit_bash "$PG" '{"tool_input":{"command":"ls src/"}}')"
assert_exit "allow: grep -r foo lib/"      0 "$(exit_bash "$PG" '{"tool_input":{"command":"grep -r foo lib/"}}')"
assert_exit "allow: empty input"           0 "$(exit_bash "$PG" '')"
assert_exit "allow: no command key"        0 "$(exit_bash "$PG" '{"tool_input":{}}')"
assert_exit "allow: git log"               0 "$(exit_bash "$PG" '{"tool_input":{"command":"git log --oneline"}}')"

# Block: known large dirs — forward slash
assert_exit "block: node_modules/"         2 "$(exit_bash "$PG" '{"tool_input":{"command":"cat node_modules/lodash/index.js"}}')"
assert_exit "block: dist/"                 2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls dist/bundle.js"}}')"
assert_exit "block: build/"                2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls build/output"}}')"
assert_exit "block: .next/"                2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls .next/cache"}}')"
assert_exit "block: .gradle/"              2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls .gradle/wrapper"}}')"
assert_exit "block: __pycache__"           2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls __pycache__/"}}')"
assert_exit "block: .venv/"                2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls .venv/lib"}}')"
assert_exit "block: vendor/"               2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls vendor/package"}}')"
assert_exit "block: .git/objects"          2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls .git/objects/pack"}}')"

# Block: Windows-style backslash separators
assert_exit "block: node_modules\\\\ (backslash)" 2 "$(exit_bash "$PG" '{"tool_input":{"command":"cat node_modules\\\\lodash\\\\index.js"}}')"
assert_exit "block: dist\\\\ (backslash)"          2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls dist\\\\bundle.js"}}')"

# Block message is useful
MSG=$(stderr_bash "$PG" '{"tool_input":{"command":"ls node_modules/react"}}')
assert_contains "block: message mentions what was blocked" "node_modules" "$MSG"

# False positive guard: "build" alone should not block (only "build/")
assert_exit "allow: docker build ."        0 "$(exit_bash "$PG" '{"tool_input":{"command":"docker build ."}}')"
assert_exit "allow: cargo build"           0 "$(exit_bash "$PG" '{"tool_input":{"command":"cargo build"}}')"

# PATH_GUARD_EXTRA extends blocked patterns
# Use double-quotes so \\ → \ in the value, making ERE \.terraform = literal dot + terraform
assert_exit "allow: .terraform/ without extra" 0 "$(exit_bash "$PG" '{"tool_input":{"command":"ls .terraform/providers"}}')"
assert_exit "block: .terraform/ with PATH_GUARD_EXTRA" 2 \
  "$(exit_bash "$PG" '{"tool_input":{"command":"ls .terraform/providers"}}' "PATH_GUARD_EXTRA=\\.terraform")"
assert_exit "block: PATH_GUARD_EXTRA with pipe-separated patterns" 2 \
  "$(exit_bash "$PG" '{"tool_input":{"command":"ls .vagrant/machines"}}' "PATH_GUARD_EXTRA=\\.terraform|\\.vagrant")"

# ── Remaining blocked dirs (all patterns need coverage) ──────────────────────
section "path-guard.sh — full pattern coverage"

assert_exit "block: .git/refs"                2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls .git/refs/heads"}}')"
assert_exit "block: bin/Debug (C#)"           2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls bin/Debug/net7.0"}}')"
assert_exit "block: bin/Release (C#)"         2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls bin/Release/net7.0"}}')"
assert_exit "block: obj/Debug (C#)"           2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls obj/Debug/net7.0"}}')"
assert_exit "block: obj/Release (C#)"         2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls obj/Release"}}')"
assert_exit "block: .nuget"                   2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls .nuget/packages"}}')"
assert_exit "block: DerivedData"              2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls DerivedData/Build"}}')"
assert_exit "block: Pods/"                    2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls Pods/Headers"}}')"
assert_exit "block: .build/ (Swift)"          2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls .build/debug"}}')"
assert_exit "block: target/ (Rust/Maven)"     2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls target/debug"}}')"
assert_exit "block: .bundle/ (Ruby)"          2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls .bundle/gems"}}')"
assert_exit "block: .mypy_cache/"             2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls .mypy_cache/3.11"}}')"
assert_exit "block: .pytest_cache/"           2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls .pytest_cache/v"}}')"
assert_exit "block: .ruff_cache/"             2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls .ruff_cache/0.1"}}')"
assert_exit "block: .egg-info"                2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls mypackage.egg-info/"}}')"
assert_exit "block: .turbo/"                  2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls .turbo/cache"}}')"
assert_exit "block: .svelte-kit/"             2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls .svelte-kit/output"}}')"
assert_exit "block: .nuxt/"                   2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls .nuxt/dist"}}')"
assert_exit "block: .parcel-cache/"           2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls .parcel-cache/abc"}}')"
assert_exit "block: out/server (Next.js)"     2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls out/server/chunks"}}')"
assert_exit "block: out/static (Next.js)"     2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls out/static/media"}}')"
assert_exit "block: out/_next"                2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls out/_next/static"}}')"
assert_exit "block: .cache/"                  2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls .cache/babel-loader"}}')"
assert_exit "block: venv/"                    2 "$(exit_bash "$PG" '{"tool_input":{"command":"ls venv/lib"}}')"

# ── False positive prevention (important: must NOT block these) ───────────────
assert_exit "allow: npm run build (no trailing sep)" 0 "$(exit_bash "$PG" '{"tool_input":{"command":"npm run build"}}')"
assert_exit "allow: cmake --build ."           0 "$(exit_bash "$PG" '{"tool_input":{"command":"cmake --build ."}}')"
assert_exit "allow: cargo build"               0 "$(exit_bash "$PG" '{"tool_input":{"command":"cargo build"}}')"  # rebuild is not build/
assert_exit "allow: rebuild/clean (no match)"  0 "$(exit_bash "$PG" '{"tool_input":{"command":"make rebuild"}}')"
assert_exit "allow: bin/bash (not C# subdir)"  0 "$(exit_bash "$PG" '{"tool_input":{"command":"ls /usr/bin/bash"}}')"

# ── Binary existence checks through blocked dirs (must NOT block) ─────────────
# Regression: dist/ as intermediate path component in existence check was incorrectly blocked
assert_exit "allow: -x check through dist/"   0 \
  "$(exit_bash "$PG" '{"tool_input":{"command":"B=~/.claude/skills/gstack/browse/dist/browse\nif [ -x \"$B\" ]; then echo READY; fi"}}')"
assert_exit "allow: -f check through dist/"   0 \
  "$(exit_bash "$PG" '{"tool_input":{"command":"[ -f /usr/local/dist/bin/tool ] && echo ok"}}')"
assert_exit "allow: path assign through dist/" 0 \
  "$(exit_bash "$PG" '{"tool_input":{"command":"TOOL=~/.local/dist/mytool; \"$TOOL\" --version"}}')"
assert_exit "allow: -x check through node_modules/.bin" 0 \
  "$(exit_bash "$PG" '{"tool_input":{"command":"[ -x node_modules/.bin/webpack ] && echo ok"}}')"
assert_exit "allow: executing node_modules/.bin binary with piped head" 0 \
  "$(exit_bash "$PG" '{"tool_input":{"command":"node_modules/.bin/playwright test --list 2>&1 | head -20"}}')"
assert_exit "allow: npx-style .bin binary piped to tail" 0 \
  "$(exit_bash "$PG" '{"tool_input":{"command":"node_modules/.bin/jest --listTests 2>&1 | tail -10"}}')"

# ── Absolute path containing blocked dir ─────────────────────────────────────
assert_exit "block: absolute path with node_modules" 2 \
  "$(exit_bash "$PG" '{"tool_input":{"command":"cat /home/user/project/node_modules/lodash/index.js"}}')"

# ── Malformed/unexpected input ────────────────────────────────────────────────
assert_exit "allow: malformed JSON"            0 "$(exit_bash "$PG" 'not json at all')"
assert_exit "allow: JSON with no tool_input"   0 "$(exit_bash "$PG" '{"event":"PreToolUse"}')"
assert_exit "allow: null command value"        0 "$(exit_bash "$PG" '{"tool_input":{"command":null}}')"

# ══════════════════════════════════════════════════════════════════════════════
# sensitive-guard.sh
# ══════════════════════════════════════════════════════════════════════════════
section "sensitive-guard.sh"

SG="$HOOKS_DIR/sensitive-guard.sh"

# Block: direct file access (Read/Write/Edit)
assert_exit "block: .env"                       2 "$(exit_bash "$SG" '{"tool_input":{"file_path":".env"}}')"
assert_exit "block: .env.production"            2 "$(exit_bash "$SG" '{"tool_input":{"file_path":".env.production"}}')"
assert_exit "block: .env.local"                 2 "$(exit_bash "$SG" '{"tool_input":{"file_path":".env.local"}}')"
assert_exit "block: id_rsa"                     2 "$(exit_bash "$SG" '{"tool_input":{"file_path":"id_rsa"}}')"
assert_exit "block: cert.pem"                   2 "$(exit_bash "$SG" '{"tool_input":{"file_path":"cert.pem"}}')"
assert_exit "block: private.key"                2 "$(exit_bash "$SG" '{"tool_input":{"file_path":"private.key"}}')"
assert_exit "block: serviceAccountKey.json"     2 "$(exit_bash "$SG" '{"tool_input":{"file_path":"serviceAccountKey.json"}}')"
assert_exit "block: credentials.json"           2 "$(exit_bash "$SG" '{"tool_input":{"file_path":"credentials.json"}}')"
assert_exit "block: .npmrc"                     2 "$(exit_bash "$SG" '{"tool_input":{"file_path":".npmrc"}}')"

# Allow: safe variants
assert_exit "allow: .env.example"               0 "$(exit_bash "$SG" '{"tool_input":{"file_path":".env.example"}}')"
assert_exit "allow: .env.sample"                0 "$(exit_bash "$SG" '{"tool_input":{"file_path":".env.sample"}}')"
assert_exit "allow: .env.template"              0 "$(exit_bash "$SG" '{"tool_input":{"file_path":".env.template"}}')"
assert_exit "allow: src/index.ts"               0 "$(exit_bash "$SG" '{"tool_input":{"file_path":"src/index.ts"}}')"
assert_exit "allow: package.json"               0 "$(exit_bash "$SG" '{"tool_input":{"file_path":"package.json"}}')"
assert_exit "allow: empty input"                0 "$(exit_bash "$SG" '')"

# Warn only (exit 0): bash command referencing .env
assert_exit "warn exit 0: bash cat .env"        0 "$(exit_bash "$SG" '{"tool_input":{"command":"cat .env"}}')"
WARN=$(stderr_bash "$SG" '{"tool_input":{"command":"cat .env"}}')
assert_contains "warn: message says Warning"    "Warning" "$WARN"

# Allow: bash with .env.example is fine
assert_exit "allow: bash cat .env.example"      0 "$(exit_bash "$SG" '{"tool_input":{"command":"cat .env.example"}}')"

# SENSITIVE_GUARD_EXTRA extends blocked patterns
# Use .conf extension — yaml/yml are in fast_path_safe so is_sensitive() would be skipped for them
assert_exit "block: .conf file with EXTRA" 2 \
  "$(exit_bash "$SG" '{"tool_input":{"file_path":"firebase.conf"}}' "SENSITIVE_GUARD_EXTRA=firebase\\.conf")"

# ── More key/cert types ───────────────────────────────────────────────────────
section "sensitive-guard.sh — extended file type coverage"

assert_exit "block: .pypirc"                     2 "$(exit_bash "$SG" '{"tool_input":{"file_path":".pypirc"}}')"
assert_exit "block: .netrc"                      2 "$(exit_bash "$SG" '{"tool_input":{"file_path":".netrc"}}')"
assert_exit "block: id_ecdsa"                    2 "$(exit_bash "$SG" '{"tool_input":{"file_path":"id_ecdsa"}}')"
assert_exit "block: id_ed25519"                  2 "$(exit_bash "$SG" '{"tool_input":{"file_path":"id_ed25519"}}')"
assert_exit "block: id_dsa"                      2 "$(exit_bash "$SG" '{"tool_input":{"file_path":"id_dsa"}}')"
assert_exit "block: server.p12"                  2 "$(exit_bash "$SG" '{"tool_input":{"file_path":"server.p12"}}')"
assert_exit "block: keystore.jks"                2 "$(exit_bash "$SG" '{"tool_input":{"file_path":"keystore.jks"}}')"
assert_exit "block: app.keystore"                2 "$(exit_bash "$SG" '{"tool_input":{"file_path":"app.keystore"}}')"
assert_exit "block: deploy.pfx"                  2 "$(exit_bash "$SG" '{"tool_input":{"file_path":"deploy.pfx"}}')"
assert_exit "block: server.truststore"           2 "$(exit_bash "$SG" '{"tool_input":{"file_path":"server.truststore"}}')"
assert_exit "block: github_rsa (*_rsa suffix)"   2 "$(exit_bash "$SG" '{"tool_input":{"file_path":"github_rsa"}}')"
assert_exit "block: deploy_ed25519"              2 "$(exit_bash "$SG" '{"tool_input":{"file_path":"deploy_ed25519"}}')"

# ── Substring patterns (case-insensitive) ────────────────────────────────────
assert_exit "block: *credential* — my_credentials.dat" 2 "$(exit_bash "$SG" '{"tool_input":{"file_path":"my_credentials.dat"}}')"
assert_exit "block: *secret* — app_secret.dat"         2 "$(exit_bash "$SG" '{"tool_input":{"file_path":"app_secret.dat"}}')"
assert_exit "block: *private_key* — private_key.dat"   2 "$(exit_bash "$SG" '{"tool_input":{"file_path":"private_key.dat"}}')"
assert_exit "block: *privatekey* — myPrivateKey.dat"   2 "$(exit_bash "$SG" '{"tool_input":{"file_path":"myPrivateKey.dat"}}')"

# ── Glob patterns in case statement ──────────────────────────────────────────
assert_exit "block: service-account-prod.json"   2 "$(exit_bash "$SG" '{"tool_input":{"file_path":"service-account-prod.json"}}')"
assert_exit "block: service-account-dev.json"    2 "$(exit_bash "$SG" '{"tool_input":{"file_path":"service-account-dev.json"}}')"
assert_exit "block: firebase-adminsdk-abc.json"  2 "$(exit_bash "$SG" '{"tool_input":{"file_path":"firebase-adminsdk-abc.json"}}')"

# ── Context-sensitive: config.json ───────────────────────────────────────────
assert_exit "allow: config.json alone"                    0 "$(exit_bash "$SG" '{"tool_input":{"file_path":"config.json"}}')"
assert_exit "block: .docker/config.json"                  2 "$(exit_bash "$SG" '{"tool_input":{"file_path":".docker/config.json"}}')"
assert_exit "block: /home/user/.docker/config.json"       2 "$(exit_bash "$SG" '{"tool_input":{"file_path":"/home/user/.docker/config.json"}}')"

# ── .env variants ────────────────────────────────────────────────────────────
assert_exit "block: .env.staging"    2 "$(exit_bash "$SG" '{"tool_input":{"file_path":".env.staging"}}')"
assert_exit "block: .env.test"       2 "$(exit_bash "$SG" '{"tool_input":{"file_path":".env.test"}}')"
assert_exit "block: .env.ci"         2 "$(exit_bash "$SG" '{"tool_input":{"file_path":".env.ci"}}')"

# ── tool_input.path field (used by Grep tool) ─────────────────────────────────
assert_exit "block: tool_input.path = id_rsa"    2 "$(exit_bash "$SG" '{"tool_input":{"path":"id_rsa"}}')"
assert_exit "allow: tool_input.path = src/index" 0 "$(exit_bash "$SG" '{"tool_input":{"path":"src/index.ts"}}')"

# ── Bash command warn cases ───────────────────────────────────────────────────
assert_exit "warn exit 0: command references id_rsa"             0 "$(exit_bash "$SG" '{"tool_input":{"command":"ssh -i id_rsa user@host"}}')"
assert_exit "warn exit 0: command references cert.pem"           0 "$(exit_bash "$SG" '{"tool_input":{"command":"openssl x509 -in cert.pem -text"}}')"
assert_exit "warn exit 0: command references serviceAccountKey"  0 "$(exit_bash "$SG" '{"tool_input":{"command":"gcloud auth activate-service-account --key-file=serviceAccountKey.json"}}')"
assert_exit "warn exit 0: command references credentials.json"   0 "$(exit_bash "$SG" '{"tool_input":{"command":"cat mycredentials.json"}}')"
WARN_KEY=$(stderr_bash "$SG" '{"tool_input":{"command":"ssh -i id_rsa user@host"}}')
assert_contains "warn message for id_rsa in command" "Warning" "$WARN_KEY"
assert_exit "allow: command no sensitive references" 0 "$(exit_bash "$SG" '{"tool_input":{"command":"git status"}}')"

# ── .agentignore integration ──────────────────────────────────────────────────
section "sensitive-guard.sh — .agentignore"

AGENTDIR=$(mktemp -d "$PWD/.test-agentignore-XXXXXXXX")
printf 'internal-config.dat\nreports/\n# comment line\n\nsecrets.bin\n' > "$AGENTDIR/.agentignore"

# Run hook FROM the dir that has .agentignore so the hook finds it at cwd
SG_ABS="$HOOKS_DIR/sensitive-guard.sh"
assert_exit "block: file listed in .agentignore (exact basename)" 2 \
  "$(cd "$AGENTDIR" && bash "$SG_ABS" <<< '{"tool_input":{"file_path":"internal-config.dat"}}' && echo 0 || echo $?)"
assert_exit "block: file listed in .agentignore (another entry)" 2 \
  "$(cd "$AGENTDIR" && bash "$SG_ABS" <<< '{"tool_input":{"file_path":"secrets.bin"}}' && echo 0 || echo $?)"
assert_exit "allow: file NOT in .agentignore" 0 \
  "$(cd "$AGENTDIR" && bash "$SG_ABS" <<< '{"tool_input":{"file_path":"other.dat"}}' && echo 0 || echo $?)"
assert_exit "allow: comment line in .agentignore is ignored" 0 \
  "$(cd "$AGENTDIR" && bash "$SG_ABS" <<< '{"tool_input":{"file_path":"# comment line"}}' && echo 0 || echo $?)"

# .aiignore fallback — remove .agentignore so .aiignore is found first
rm -f "$AGENTDIR/.agentignore"
printf 'hidden.dat\n' > "$AGENTDIR/.aiignore"
assert_exit "block: file in .aiignore (second candidate)" 2 \
  "$(cd "$AGENTDIR" && bash "$SG_ABS" <<< '{"tool_input":{"file_path":"hidden.dat"}}' && echo 0 || echo $?)"

# ── Edge cases ────────────────────────────────────────────────────────────────
assert_exit "allow: malformed JSON"                    0 "$(exit_bash "$SG" 'bad json')"
assert_exit "allow: JSON with missing tool_input"      0 "$(exit_bash "$SG" '{"event":"test"}')"

# ══════════════════════════════════════════════════════════════════════════════
# comment-guard.js
# ══════════════════════════════════════════════════════════════════════════════
section "comment-guard.js"

CG="$HOOKS_DIR/comment-guard.js"

# Block: code → placeholder comment
assert_exit "block: code replaced with '// ... existing code ...'" 2 \
  "$(exit_node "$CG" '{"tool_input":{"file_path":"src/a.ts","old_string":"function x() { return 1; }","new_string":"// ... existing code ..."}}')"

assert_exit "block: code replaced with '// ... remaining code'" 2 \
  "$(exit_node "$CG" '{"tool_input":{"file_path":"src/a.ts","old_string":"const x = compute();","new_string":"// ... remaining implementation"}}')"

assert_exit "block: code replaced with '/* ... */'" 2 \
  "$(exit_node "$CG" '{"tool_input":{"file_path":"src/a.ts","old_string":"function a(){} function b(){} function c(){}","new_string":"/* ... */"}}')"

# Block: code replaced with suspiciously short comment (< 30% of original length)
# Use \n literals inside the JSON string (not real newlines) so JSON.parse succeeds
# Must have 3+ comment lines to be "truncation" — single-line deletion notes are allowed
# old=20 lines, new=4 comment lines: 4 < 20*0.3=6 AND 4 > 2 → blocked
TRUNCATED_PAYLOAD='{"tool_input":{"file_path":"src/a.ts","old_string":"const a=1;\nconst b=2;\nconst c=3;\nconst d=4;\nconst e=5;\nconst f=6;\nconst g=7;\nconst h=8;\nconst i=9;\nconst j=10;\nconst k=11;\nconst l=12;\nconst m=13;\nconst n=14;\nconst o=15;\nconst p=16;\nconst q=17;\nconst r=18;\nconst s=19;\nconst t=20;","new_string":"// section removed\n// see refactor notes\n// check git history\n// for full context"}}'
assert_exit "block: code truncated to multi-line comment block" 2 \
  "$(exit_node "$CG" "$TRUNCATED_PAYLOAD")"

# Allow: single-line deletion note replacing large block — intentional removal, not truncation
# Regression: false positive — "// Removed" replacing 10 lines was blocked by 30% ratio check
assert_exit "allow: single-line deletion note (intentional removal)" 0 \
  "$(exit_node "$CG" '{"tool_input":{"file_path":"src/a.ts","old_string":"const a=1;\nconst b=2;\nconst c=3;\nconst d=4;\nconst e=5;\nconst f=6;\nconst g=7;\nconst h=8;\nconst i=9;\nconst j=10;","new_string":"// Removed in v2 refactor"}}')"

# Allow: two-line deletion note replacing large block
assert_exit "allow: two-line deletion note (intentional removal)" 0 \
  "$(exit_node "$CG" '{"tool_input":{"file_path":"src/a.ts","old_string":"const a=1;\nconst b=2;\nconst c=3;\nconst d=4;\nconst e=5;\nconst f=6;\nconst g=7;\nconst h=8;\nconst i=9;\nconst j=10;","new_string":"// Removed: deprecated API\n// Use newHelper() instead"}}')"

# Allow: old_string is already all comments
assert_exit "allow: editing comments" 0 \
  "$(exit_node "$CG" '{"tool_input":{"file_path":"src/a.ts","old_string":"// old comment","new_string":"// new comment"}}')"

# Allow: new_string has real code (even with comments)
assert_exit "allow: new string has real code" 0 \
  "$(exit_node "$CG" '{"tool_input":{"file_path":"src/a.ts","old_string":"const x = 1;","new_string":"// Updated\nconst x = getValue();\nreturn x;"}}')"

# Allow: Write (no old_string — creating new file)
assert_exit "allow: no old_string (Write)" 0 \
  "$(exit_node "$CG" '{"tool_input":{"file_path":"src/new.ts","new_string":"// placeholder"}}')"

# Allow: empty input
assert_exit "allow: empty input" 0 \
  "$(exit_node "$CG" '')"

# Block message is useful
CMSG=$(stderr_node "$CG" '{"tool_input":{"file_path":"src/a.ts","old_string":"function x() { return 1; }","new_string":"// ... existing code ..."}}')
assert_contains "block message mentions placeholder" "placeholder" "$CMSG"

# ── All PLACEHOLDER_PATTERNS from the source ──────────────────────────────────
section "comment-guard.js — full placeholder pattern coverage"

# // ... remaining code
assert_exit "block: '// ... remaining implementation'" 2 \
  "$(exit_node "$CG" '{"tool_input":{"file_path":"src/a.ts","old_string":"function go() { return doWork(); }","new_string":"// ... remaining implementation"}}')"
# // [omitted]
assert_exit "block: '// [omitted]'" 2 \
  "$(exit_node "$CG" '{"tool_input":{"file_path":"src/a.ts","old_string":"const x = 1;","new_string":"// [omitted]"}}')"
# // [unchanged]
assert_exit "block: '// [remains unchanged]'" 2 \
  "$(exit_node "$CG" '{"tool_input":{"file_path":"src/a.ts","old_string":"const x = 1;","new_string":"// [remains unchanged]"}}')"
# // unchanged as is
assert_exit "block: '// unchanged as is'" 2 \
  "$(exit_node "$CG" '{"tool_input":{"file_path":"src/a.ts","old_string":"const x = 1;","new_string":"// unchanged as is"}}')"
# /* ... */
assert_exit "block: '/* ... */'" 2 \
  "$(exit_node "$CG" '{"tool_input":{"file_path":"src/a.ts","old_string":"function f() { return 1; }","new_string":"/* ... */"}}')"
# Python: # ... existing
assert_exit "block: '# ... existing code' (Python)" 2 \
  "$(exit_node "$CG" '{"tool_input":{"file_path":"app.py","old_string":"def process(): return True","new_string":"# ... existing code"}}')"
# Python: pass # TODO
assert_exit "block: 'pass # TODO implement' (Python)" 2 \
  "$(exit_node "$CG" '{"tool_input":{"file_path":"app.py","old_string":"def process(): return True","new_string":"pass # TODO implement"}}')"
# // TODO: implement
assert_exit "block: '// TODO: implement'" 2 \
  "$(exit_node "$CG" '{"tool_input":{"file_path":"src/a.ts","old_string":"function calc() { return x * 2; }","new_string":"// TODO: implement"}}')"
# // add code here
assert_exit "block: '// add your code here'" 2 \
  "$(exit_node "$CG" '{"tool_input":{"file_path":"src/a.ts","old_string":"const x = compute();","new_string":"// add your code here"}}')"
# // <your code>
assert_exit "block: '// <your implementation>'" 2 \
  "$(exit_node "$CG" '{"tool_input":{"file_path":"src/a.ts","old_string":"const x = 1;","new_string":"// <your implementation>"}}')"

# ── Allow cases that look suspicious but are legitimate ───────────────────────
section "comment-guard.js — legitimate allow cases"

# old_string all blank lines → no real code → should allow any replacement
assert_exit "allow: old_string is blank lines only" 0 \
  "$(exit_node "$CG" '{"tool_input":{"file_path":"src/a.ts","old_string":"\n\n\n","new_string":"// section removed"}}')"

# New string has real code (even if also has comments)
assert_exit "allow: replacement has real code + comments" 0 \
  "$(exit_node "$CG" '{"tool_input":{"file_path":"src/a.ts","old_string":"const x = 1;","new_string":"// Updated per spec\nconst x = getValue();\nreturn x + offset;"}}')"

# Large old string → large comment replacement (> 30% ratio) — intentional docblock
assert_exit "allow: large-to-large comment (intentional docblock)" 0 \
  "$(exit_node "$CG" '{"tool_input":{"file_path":"src/a.ts","old_string":"// A\n// B\n// C\n// D\n// E\n// F\n// G\n// H\n// I\n// J","new_string":"// Updated doc A\n// Updated doc B\n// Updated doc C\n// Updated doc D\n// Updated doc E\n// Updated doc F\n// Updated doc G"}}')"

# File path outside project dir → hook skips (exits 0)
assert_exit "allow: file_path outside project dir" 0 \
  "$(exit_node "$CG" '{"tool_input":{"file_path":"/tmp/somefile.ts","old_string":"const x = 1;","new_string":"// ... existing code ..."}}')"

# ══════════════════════════════════════════════════════════════════════════════
# glob-guard.js
# ══════════════════════════════════════════════════════════════════════════════
section "glob-guard.js"

GG="$HOOKS_DIR/glob-guard.js"

# Block: broad patterns at project root
assert_exit "block: **/*.ts at root"          2 "$(exit_node "$GG" '{"tool_input":{"pattern":"**/*.ts"}}')"
assert_exit "block: **/* at root"             2 "$(exit_node "$GG" '{"tool_input":{"pattern":"**/*"}}')"
assert_exit "block: * at root"                2 "$(exit_node "$GG" '{"tool_input":{"pattern":"*"}}')"
assert_exit "block: *.js at root"             2 "$(exit_node "$GG" '{"tool_input":{"pattern":"*.js"}}')"
assert_exit "block: **/*.{ts,tsx} at root"    2 "$(exit_node "$GG" '{"tool_input":{"pattern":"**/*.{ts,tsx}"}}')"

# Allow: pattern starts with a known scoped dir
assert_exit "allow: src/**/*.ts"              0 "$(exit_node "$GG" '{"tool_input":{"pattern":"src/**/*.ts"}}')"
assert_exit "allow: lib/**/*.js"              0 "$(exit_node "$GG" '{"tool_input":{"pattern":"lib/**/*.js"}}')"
assert_exit "allow: tests/**/*"              0 "$(exit_node "$GG" '{"tool_input":{"pattern":"tests/**/*"}}')"
assert_exit "allow: Sources/**/*.swift"       0 "$(exit_node "$GG" '{"tool_input":{"pattern":"Sources/**/*.swift"}}')"

# Allow: basePath is a scoped dir
assert_exit "allow: **/*.ts with path=src"    0 "$(exit_node "$GG" '{"tool_input":{"pattern":"**/*.ts","path":"src"}}')"
assert_exit "allow: **/*.ts with path=lib/x"  0 "$(exit_node "$GG" '{"tool_input":{"pattern":"**/*.ts","path":"lib/utils"}}')"

# Allow: specific file (not a broad pattern)
assert_exit "allow: package.json"             0 "$(exit_node "$GG" '{"tool_input":{"pattern":"package.json"}}')"
assert_exit "allow: CLAUDE.md"                0 "$(exit_node "$GG" '{"tool_input":{"pattern":"CLAUDE.md"}}')"

# Allow: empty input / no pattern
assert_exit "allow: empty input"              0 "$(exit_node "$GG" '')"
assert_exit "allow: no pattern key"          0 "$(exit_node "$GG" '{"tool_input":{}}')"

# GLOB_GUARD_SCOPED_DIRS extends allowed dirs (iOS Clean Architecture)
assert_exit "block: **/*.swift with path=Feature (without env)" 2 \
  "$(exit_node "$GG" '{"tool_input":{"pattern":"**/*.swift","path":"Feature"}}')"
assert_exit "allow: **/*.swift with path=Feature (GLOB_GUARD_SCOPED_DIRS=Feature)" 0 \
  "$(exit_node "$GG" '{"tool_input":{"pattern":"**/*.swift","path":"Feature"}}' GLOB_GUARD_SCOPED_DIRS=Feature)"
assert_exit "allow: multiple dirs via GLOB_GUARD_SCOPED_DIRS" 0 \
  "$(exit_node "$GG" '{"tool_input":{"pattern":"**/*.kt","path":"Domain"}}' GLOB_GUARD_SCOPED_DIRS=Feature,Domain,Presentation)"

# Block message suggests alternatives
GMSG=$(stderr_node "$GG" '{"tool_input":{"pattern":"**/*.ts"}}')
assert_contains "block message suggests scoped alternative" "src/" "$GMSG"

# ── isRootLevel edge cases ────────────────────────────────────────────────────
section "glob-guard.js — isRootLevel and path edge cases"

# basePath = "." → root-level → block
assert_exit "block: **/*.ts with path='.'" 2 \
  "$(exit_node "$GG" '{"tool_input":{"pattern":"**/*.ts","path":"."}}')"
# basePath = "./" → root-level → block
assert_exit "block: **/*.ts with path='./'" 2 \
  "$(exit_node "$GG" '{"tool_input":{"pattern":"**/*.ts","path":"./"}}')"
# basePath = "" → root-level → block
assert_exit "block: **/*.ts with path=''" 2 \
  "$(exit_node "$GG" '{"tool_input":{"pattern":"**/*.ts","path":""}}')"

# basePath is a non-scoped top-level dir → treated as root-level → block
assert_exit "block: **/*.ts with path=features (not in SCOPED_DIRS)" 2 \
  "$(exit_node "$GG" '{"tool_input":{"pattern":"**/*.ts","path":"features"}}')"

# basePath is two levels deep → not root-level → allow
assert_exit "allow: **/*.ts with path=src/components (deep path)" 0 \
  "$(exit_node "$GG" '{"tool_input":{"pattern":"**/*.ts","path":"src/components"}}')"
assert_exit "allow: **/*.ts with path=apps/web (two segments)" 0 \
  "$(exit_node "$GG" '{"tool_input":{"pattern":"**/*.ts","path":"apps/web"}}')"

# ── startsWithScopedDir: dot-slash prefix ─────────────────────────────────────
assert_exit "allow: ./src/**/*.ts (dot-slash prefix)" 0 \
  "$(exit_node "$GG" '{"tool_input":{"pattern":"./src/**/*.ts"}}')"
assert_exit "allow: ./lib/**/*.js (dot-slash prefix)" 0 \
  "$(exit_node "$GG" '{"tool_input":{"pattern":"./lib/**/*.js"}}')"

# ── **/.* (all dotfiles) pattern — regex /^\*\*\/\.\*$/ matches "**/.*" ───────
assert_exit "block: **/.*  (all dotfiles at root)" 2 \
  "$(exit_node "$GG" '{"tool_input":{"pattern":"**/.*"}}')"

# ── Suggestions in block message ──────────────────────────────────────────────
GMSG_JS=$(stderr_node "$GG" '{"tool_input":{"pattern":"**/*.js"}}')
assert_contains "block message for .js suggests .js scoped" "lib/**/*.js" "$GMSG_JS"

GMSG_NOEXT=$(stderr_node "$GG" '{"tool_input":{"pattern":"**/*"}}')
assert_contains "block message for **/* suggests scoped alternative" "src/**/*" "$GMSG_NOEXT"

# ══════════════════════════════════════════════════════════════════════════════
# file-guard.js
# ══════════════════════════════════════════════════════════════════════════════
section "file-guard.js"

FG="$HOOKS_DIR/file-guard.js"

# Must be inside the repo so file-guard.js doesn't skip it (it skips files outside process.cwd())
TMPTEST=$(mktemp -d "$PWD/.test-hooks-XXXXXXXX")
trap 'rm -rf "$AGENTDIR" "$TMPTEST"' EXIT

# Small file: no warning
SMALL="$TMPTEST/small.ts"
printf 'const x = 1;\nconst y = 2;\n' > "$SMALL"
OUT_SMALL=$(stdout_node "$FG" "{\"tool_input\":{\"file_path\":\"$SMALL\"}}")
assert_not_contains "no warning: small file" "Warning" "$OUT_SMALL"

# Large file: warning injected into JSON output
LARGE="$TMPTEST/large.ts"
seq 1 400 | awk '{print "const x" $1 " = " $1 ";"}' > "$LARGE"
OUT_LARGE=$(stdout_node "$FG" "{\"tool_input\":{\"file_path\":\"$LARGE\"}}")
assert_contains "warning: large file (250 lines)"   "Warning"           "$OUT_LARGE"
assert_contains "warning includes threshold info"    "lines (threshold:" "$OUT_LARGE"
assert_contains "warning output is valid JSON start" '"continue"'        "$OUT_LARGE"

# Always non-blocking (exit 0) even for large files
assert_exit "always exits 0 (non-blocking)" 0 \
  "$(exit_node "$FG" "{\"tool_input\":{\"file_path\":\"$LARGE\"}}")"

# FILE_GUARD_THRESHOLD env var
MEDIUM="$TMPTEST/medium.ts"
seq 1 50 | awk '{print "const x" $1 " = " $1 ";"}' > "$MEDIUM"
OUT_DEFAULT=$(stdout_node "$FG" "{\"tool_input\":{\"file_path\":\"$MEDIUM\"}}")
OUT_LOW=$(stdout_node "$FG"     "{\"tool_input\":{\"file_path\":\"$MEDIUM\"}}" FILE_GUARD_THRESHOLD=30)
assert_not_contains "no warning at default threshold (50 < 350)"  "Warning" "$OUT_DEFAULT"
assert_contains     "warning at low threshold (50 > 30)"          "Warning" "$OUT_LOW"

# Empty input: exits 0
assert_exit "exits 0 on empty input"   0 "$(exit_node "$FG" '')"

# File outside project dir: no warning (skipped)
OUTSIDE=$(mktemp)
seq 1 250 | awk '{print "const x" $1 " = " $1 ";"}' > "$OUTSIDE"
OUT_OUTSIDE=$(stdout_node "$FG" "{\"tool_input\":{\"file_path\":\"$OUTSIDE\"}}")
assert_not_contains "no warning: file outside project dir" "Warning" "$OUT_OUTSIDE"
rm -f "$OUTSIDE"

# ── Threshold boundary conditions ─────────────────────────────────────────────
section "file-guard.js — boundary and exclusion tests"

# Exactly at threshold (350 lines default) → NO warning
# split("\n") counts: file needs to produce exactly 350 elements, so NO trailing newline
AT_THRESHOLD="$TMPTEST/at-threshold.ts"
seq 1 349 | awk '{print "const x" $1 " = " $1 ";"}' > "$AT_THRESHOLD"
printf 'export {}' >> "$AT_THRESHOLD"  # 350th line, no trailing newline → split gives 350 elements
OUT_AT=$(stdout_node "$FG" "{\"tool_input\":{\"file_path\":\"$AT_THRESHOLD\"}}")
assert_not_contains "no warning: at threshold (350 lines)" "Warning" "$OUT_AT"

# One over threshold (351 lines) → SHOULD warn
ONE_OVER="$TMPTEST/one-over.ts"
seq 1 350 | awk '{print "const x" $1 " = " $1 ";"}' > "$ONE_OVER"
printf 'export {};\n' >> "$ONE_OVER"  # 351st line with newline → split gives 352 elements
OUT_OVER=$(stdout_node "$FG" "{\"tool_input\":{\"file_path\":\"$ONE_OVER\"}}")
assert_contains "warning: one over threshold (351 lines)" "Warning" "$OUT_OVER"

# FILE_GUARD_EXCLUDE: excluded file gets no warning even if large
EXCL_FILE="$TMPTEST/schema.generated.ts"
seq 1 250 | awk '{print "const x" $1 " = " $1 ";"}' > "$EXCL_FILE"
OUT_EXCL=$(stdout_node "$FG" "{\"tool_input\":{\"file_path\":\"$EXCL_FILE\"}}" FILE_GUARD_EXCLUDE="*.generated.ts")
assert_not_contains "no warning: excluded by FILE_GUARD_EXCLUDE (*.generated.ts)" "Warning" "$OUT_EXCL"

# Non-excluded file of same size DOES warn (confirm env var is scoped)
OUT_NOT_EXCL=$(stdout_node "$FG" "{\"tool_input\":{\"file_path\":\"$LARGE\"}}" FILE_GUARD_EXCLUDE="*.generated.ts")
assert_contains "warning: non-excluded large file still warned" "Warning" "$OUT_NOT_EXCL"

# Non-existent file → exits 0 silently
assert_exit "exits 0: non-existent file" 0 \
  "$(exit_node "$FG" "{\"tool_input\":{\"file_path\":\"$TMPTEST/does-not-exist.ts\"}}")"

# Binary file → null byte detected, skipped (no warning)
BINARY_FILE="$TMPTEST/binary.bin"
{ printf '\x00'; seq 1 250 | awk '{print "line" $1}'; } > "$BINARY_FILE"
OUT_BIN=$(stdout_node "$FG" "{\"tool_input\":{\"file_path\":\"$BINARY_FILE\"}}")
assert_not_contains "no warning: binary file skipped" "Warning" "$OUT_BIN"

# Large file > 1MB → size-based warning (not line-count path)
BIG_FILE="$TMPTEST/huge.dat"
dd if=/dev/urandom bs=1024 count=1025 2>/dev/null | LC_ALL=C tr -dc 'a-zA-Z \n' 2>/dev/null > "$BIG_FILE" || true
if [[ -f "$BIG_FILE" ]] && [[ $(wc -c < "$BIG_FILE" 2>/dev/null || echo 0) -gt $((1024*1024)) ]]; then
  OUT_BIG=$(stdout_node "$FG" "{\"tool_input\":{\"file_path\":\"$BIG_FILE\"}}")
  assert_contains     "size warning for >1MB file mentions KB"     "KB"            "$OUT_BIG"
  assert_not_contains "size warning does NOT say 'lines'"          "lines (threshold" "$OUT_BIG"
fi

# Malformed JSON → exits 0
assert_exit "exits 0: malformed JSON" 0 "$(exit_node "$FG" 'not json')"

# ══════════════════════════════════════════════════════════════════════════════
# self-review.sh
# ══════════════════════════════════════════════════════════════════════════════
section "self-review.sh"

SR="$HOOKS_DIR/self-review.sh"

# Always exits 0 (non-blocking)
assert_exit "always exits 0" 0 "$(exit_bash "$SR" '')"

# Outputs valid JSON with continue: true
OUT_SR=$(stdout_bash "$SR" '')
assert_contains "outputs JSON with continue:true"  '"continue": true' "$OUT_SR"
assert_contains "output includes checklist content" "TODO" "$OUT_SR"

# SELF_REVIEW_ENABLED=false → exits 0 with no output
OUT_OFF=$(SELF_REVIEW_ENABLED=false bash "$SR" 2>/dev/null <<< '' || true)
assert_not_contains "disabled: no output"  "continue" "$OUT_OFF"
assert_exit "disabled: exits 0" 0 "$(exit_bash "$SR" '' SELF_REVIEW_ENABLED=false)"

# ── Checklist content ─────────────────────────────────────────────────────────
section "self-review.sh — checklist content"

OUT_SR_FULL=$(stdout_bash "$SR" '')
assert_contains "checklist: mentions TODO/FIXME"          "TODO"                   "$OUT_SR_FULL"
assert_contains "checklist: mentions mock/fake"           "mock"                   "$OUT_SR_FULL"
assert_contains "checklist: mentions placeholder comment" "placeholder"            "$OUT_SR_FULL"
assert_contains "checklist: mentions compile/typecheck"   "compile"                "$OUT_SR_FULL"
assert_contains "checklist: mentions test suite"          "test"                   "$OUT_SR_FULL"
assert_contains "checklist: output parseable as JSON"     '"continue": true'       "$OUT_SR_FULL"

# Verify output is valid JSON (pipe to node to avoid quoting issues)
JSON_VALID=$(printf '%s' "$OUT_SR_FULL" | node -e "
const chunks = [];
process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  try { JSON.parse(chunks.join('')); process.stdout.write('ok'); }
  catch(e) { process.stdout.write('fail'); }
});
" 2>/dev/null || echo "fail")
assert_contains "self-review output is valid JSON" "ok" "$JSON_VALID"

# ══════════════════════════════════════════════════════════════════════════════
# Summary
# ══════════════════════════════════════════════════════════════════════════════
printf '\n══════════════════════════════════\n'
TOTAL=$((PASSED + FAILED))
if [[ $FAILED -eq 0 ]]; then
  green "  All $TOTAL tests passed"
else
  red "  $FAILED/$TOTAL tests failed"
fi
printf '══════════════════════════════════\n\n'

[[ $FAILED -eq 0 ]]
