#!/usr/bin/env bash
# test/cli.sh — Integration tests for claude-devkit CLI
#
# Covers: init, upgrade, remove — per-project AND global.
# Real ~/.claude/ is NEVER touched — each section uses an isolated $TEST_HOME.
#
# Run from repo root: bash test/cli.sh
# Requires: node, git

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$REPO_ROOT/cli/bin/devkit.js"
PASSED=0
FAILED=0

# ─── Output helpers ───────────────────────────────────────────────────────────

green() { printf '\033[32m%s\033[0m\n' "$1"; }
red()   { printf '\033[31m%s\033[0m\n' "$1"; }
pass()  { PASSED=$((PASSED+1)); green "  ✓ $1"; }
fail()  { FAILED=$((FAILED+1)); red   "  ✗ $1"; }
section() { printf '\n── %s ──\n' "$1"; }

assert_exists() {
  local desc="$1" path="$2"
  if [[ -e "$path" ]]; then pass "$desc"; else fail "$desc  [missing: $path]"; fi
}
assert_absent() {
  local desc="$1" path="$2"
  if [[ ! -e "$path" ]]; then pass "$desc"; else fail "$desc  [should not exist: $path]"; fi
}
assert_contains() {
  local desc="$1" needle="$2" haystack="$3"
  if [[ "$haystack" == *"$needle"* ]]; then pass "$desc"; else fail "$desc  [expected: $needle]"; fi
}
assert_not_contains() {
  local desc="$1" needle="$2" haystack="$3"
  if [[ "$haystack" != *"$needle"* ]]; then pass "$desc"; else fail "$desc  [should not contain: $needle]"; fi
}
assert_exit_code() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then pass "$desc"; else fail "$desc  [expected exit $expected, got $actual]"; fi
}
assert_executable() {
  local desc="$1" path="$2"
  if [[ -x "$path" ]]; then pass "$desc"; else fail "$desc  [not executable: $path]"; fi
}
assert_json_valid() {
  local desc="$1" file="$2"
  local result
  result=$(node -e "
    try { JSON.parse(require('fs').readFileSync('$file', 'utf-8')); process.stdout.write('ok'); }
    catch(e) { process.stdout.write('fail'); }
  " 2>/dev/null)
  if [[ "$result" == "ok" ]]; then pass "$desc"; else fail "$desc  [invalid JSON: $file]"; fi
}

# ─── Test environment ─────────────────────────────────────────────────────────

TEST_HOME=""
PROJECT_DIR=""

setup() {
  TEST_HOME=$(mktemp -d)
  PROJECT_DIR=$(mktemp -d)
  mkdir -p "$TEST_HOME/.claude"
  # Pre-seed global manifest: globalInstalled=false skips the interactive prompt
  printf '{"globalInstalled":false,"updatedAt":"2025-01-01T00:00:00.000Z"}\n' \
    > "$TEST_HOME/.claude/.devkit-manifest.json"
  git init -q "$PROJECT_DIR"
}

teardown() {
  [[ -n "$TEST_HOME" ]] && rm -rf "$TEST_HOME"
  [[ -n "$PROJECT_DIR" ]] && rm -rf "$PROJECT_DIR"
  TEST_HOME=""; PROJECT_DIR=""
}

# Invoke CLI with isolated HOME; suppress output
cli() { HOME="$TEST_HOME" node "$CLI" "$@" >/dev/null 2>/dev/null; }

# Invoke CLI and capture all output (stdout + stderr merged)
cli_out() { HOME="$TEST_HOME" node "$CLI" "$@" 2>&1 || true; }

# Return exit code as string
cli_exit() { HOME="$TEST_HOME" node "$CLI" "$@" >/dev/null 2>/dev/null && echo 0 || echo $?; }

# Patch manifest: set kitHash to fake value for one file → simulates a kit update
# This makes upgrade think the kit file changed vs what was originally installed.
fake_kit_hash() {
  local manifest="$1/.claude/.devkit-manifest.json" key="$2"
  node --input-type=module <<EOF 2>/dev/null
import { readFileSync, writeFileSync } from 'node:fs';
const p = '${manifest}';
const m = JSON.parse(readFileSync(p, 'utf-8'));
if (m.files['${key}']) m.files['${key}'].kitHash = 'fake-old-hash-simulate-kit-update';
writeFileSync(p, JSON.stringify(m, null, 2) + '\n');
EOF
}

# ══════════════════════════════════════════════════════════════════════════════
# INIT — Per-project
# ══════════════════════════════════════════════════════════════════════════════
section "init (per-project) — all files installed"
setup

cli init "$PROJECT_DIR"

# Skills
assert_exists "skills: mf-explore/SKILL.md"    "$PROJECT_DIR/.claude/skills/mf-explore/SKILL.md"
assert_exists "skills: mf-plan/SKILL.md"       "$PROJECT_DIR/.claude/skills/mf-plan/SKILL.md"
assert_exists "skills: mf-build/SKILL.md"      "$PROJECT_DIR/.claude/skills/mf-build/SKILL.md"
assert_exists "skills: mf-challenge/SKILL.md"  "$PROJECT_DIR/.claude/skills/mf-challenge/SKILL.md"
assert_exists "skills: mf-investigate/SKILL.md" "$PROJECT_DIR/.claude/skills/mf-investigate/SKILL.md"
assert_exists "skills: mf-fix/SKILL.md"        "$PROJECT_DIR/.claude/skills/mf-fix/SKILL.md"
assert_exists "skills: mf-review/SKILL.md"     "$PROJECT_DIR/.claude/skills/mf-review/SKILL.md"
assert_exists "skills: mf-commit/SKILL.md"     "$PROJECT_DIR/.claude/skills/mf-commit/SKILL.md"
assert_exists "skills: mf-voices/SKILL.md"     "$PROJECT_DIR/.claude/skills/mf-voices/SKILL.md"

# Hooks
assert_exists "hooks: path-guard.sh"      "$PROJECT_DIR/.claude/hooks/path-guard.sh"
assert_exists "hooks: sensitive-guard.sh" "$PROJECT_DIR/.claude/hooks/sensitive-guard.sh"
assert_exists "hooks: comment-guard.js"   "$PROJECT_DIR/.claude/hooks/comment-guard.js"
assert_exists "hooks: glob-guard.js"      "$PROJECT_DIR/.claude/hooks/glob-guard.js"
assert_exists "hooks: file-guard.js"      "$PROJECT_DIR/.claude/hooks/file-guard.js"
assert_exists "hooks: self-review.sh"     "$PROJECT_DIR/.claude/hooks/self-review.sh"

# Config, scripts, docs
assert_exists "config: settings.json"  "$PROJECT_DIR/.claude/settings.json"
assert_exists "config: CLAUDE.md"      "$PROJECT_DIR/.claude/CLAUDE.md"
assert_exists "scripts: build-test.sh" "$PROJECT_DIR/scripts/build-test.sh"
assert_exists "docs: WORKFLOW.md"      "$PROJECT_DIR/docs/WORKFLOW.md"

# Placeholder dirs
assert_exists "placeholder: docs/specs/.gitkeep"      "$PROJECT_DIR/docs/specs/.gitkeep"
assert_exists "placeholder: docs/test-plans/.gitkeep" "$PROJECT_DIR/docs/test-plans/.gitkeep"

# Manifest
assert_exists "manifest: created" "$PROJECT_DIR/.claude/.devkit-manifest.json"
assert_json_valid "manifest: valid JSON" "$PROJECT_DIR/.claude/.devkit-manifest.json"
MANIFEST=$(cat "$PROJECT_DIR/.claude/.devkit-manifest.json")
assert_contains "manifest: has version key" '"version"' "$MANIFEST"
assert_contains "manifest: has files key"   '"files"'   "$MANIFEST"
assert_contains "manifest: tracks a hook"   'path-guard.sh' "$MANIFEST"

# settings.json valid JSON
assert_json_valid "settings.json: valid JSON" "$PROJECT_DIR/.claude/settings.json"

# Executable permissions
assert_executable "path-guard.sh is executable"      "$PROJECT_DIR/.claude/hooks/path-guard.sh"
assert_executable "sensitive-guard.sh is executable" "$PROJECT_DIR/.claude/hooks/sensitive-guard.sh"
assert_executable "self-review.sh is executable"     "$PROJECT_DIR/.claude/hooks/self-review.sh"
assert_executable "build-test.sh is executable"      "$PROJECT_DIR/scripts/build-test.sh"

teardown

# ── init: --only skills ───────────────────────────────────────────────────────
section "init --only skills"
setup

cli init "$PROJECT_DIR" --only skills

assert_exists "skills present with --only skills"  "$PROJECT_DIR/.claude/skills/mf-plan/SKILL.md"
assert_absent "hooks absent with --only skills"    "$PROJECT_DIR/.claude/hooks/path-guard.sh"
assert_absent "scripts absent with --only skills"  "$PROJECT_DIR/scripts/build-test.sh"
assert_absent "docs absent with --only skills"     "$PROJECT_DIR/docs/WORKFLOW.md"

teardown

# ── init: --dry-run ───────────────────────────────────────────────────────────
section "init --dry-run"
setup

cli init "$PROJECT_DIR" --dry-run

assert_absent "no skills with --dry-run"   "$PROJECT_DIR/.claude/skills/mf-plan/SKILL.md"
assert_absent "no hooks with --dry-run"    "$PROJECT_DIR/.claude/hooks/path-guard.sh"
assert_absent "no manifest with --dry-run" "$PROJECT_DIR/.claude/.devkit-manifest.json"

teardown

# ── init: second run reports identical ───────────────────────────────────────
section "init (idempotent — second run)"
setup

cli init "$PROJECT_DIR"
OUT2=$(cli_out init "$PROJECT_DIR")
assert_contains "second run: reports identical"      "identical" "$OUT2"
assert_not_contains "second run: no failure reported" "FAIL"     "$OUT2"

teardown

# ── init: --force overwrites existing files ───────────────────────────────────
section "init --force"
setup

cli init "$PROJECT_DIR"
printf '# CUSTOM CONTENT\n' > "$PROJECT_DIR/.claude/hooks/path-guard.sh"
cli init "$PROJECT_DIR" --force
CONTENT=$(cat "$PROJECT_DIR/.claude/hooks/path-guard.sh")
assert_not_contains "force: custom content overwritten" "CUSTOM CONTENT" "$CONTENT"

teardown

# ── init: SKILL.md has YAML frontmatter ──────────────────────────────────────
section "init — skill files have YAML frontmatter"
setup

cli init "$PROJECT_DIR"
for skill in mf-explore mf-plan mf-build mf-challenge mf-investigate mf-fix mf-review mf-commit mf-voices; do
  CONTENT=$(head -1 "$PROJECT_DIR/.claude/skills/$skill/SKILL.md")
  assert_contains "$skill/SKILL.md starts with ---" "---" "$CONTENT"
done
PLAN_FM=$(head -5 "$PROJECT_DIR/.claude/skills/mf-plan/SKILL.md")
assert_contains "mf-plan: has description frontmatter" "description:" "$PLAN_FM"
assert_contains "mf-plan: has allowed-tools frontmatter" "allowed-tools:" "$PLAN_FM"

teardown

# ══════════════════════════════════════════════════════════════════════════════
# UPGRADE — Per-project
# ══════════════════════════════════════════════════════════════════════════════
section "upgrade (per-project — no changes)"
setup

cli init "$PROJECT_DIR"
OUT_UPG=$(cli_out upgrade "$PROJECT_DIR")
assert_contains "upgrade no changes: reports unchanged" "unchanged" "$OUT_UPG"

teardown

# ── upgrade: customized file is skipped ───────────────────────────────────────
section "upgrade (customized file — skip)"
setup

cli init "$PROJECT_DIR"
# Patch manifest kitHash → upgrade thinks kit changed; file content also differs → customized
fake_kit_hash "$PROJECT_DIR" ".claude/hooks/path-guard.sh"
printf '# CUSTOM CONTENT\n' >> "$PROJECT_DIR/.claude/hooks/path-guard.sh"

OUT_SKIP=$(cli_out upgrade "$PROJECT_DIR")
assert_contains "upgrade: skips customized file" "customized" "$OUT_SKIP"
CONTENT=$(cat "$PROJECT_DIR/.claude/hooks/path-guard.sh")
assert_contains "upgrade: custom content preserved" "CUSTOM CONTENT" "$CONTENT"

teardown

# ── upgrade --force overwrites customized ────────────────────────────────────
section "upgrade --force (overwrites customized)"
setup

cli init "$PROJECT_DIR"
fake_kit_hash "$PROJECT_DIR" ".claude/hooks/path-guard.sh"
printf '# CUSTOM CONTENT\n' >> "$PROJECT_DIR/.claude/hooks/path-guard.sh"

cli upgrade "$PROJECT_DIR" --force
CONTENT=$(cat "$PROJECT_DIR/.claude/hooks/path-guard.sh")
assert_not_contains "force upgrade: custom content gone" "CUSTOM CONTENT" "$CONTENT"

teardown

# ── upgrade: manifest version updated ────────────────────────────────────────
section "upgrade — manifest updatedAt refreshed"
setup

cli init "$PROJECT_DIR"
# Mangle manifest version to something old so upgrade sees a diff
node --input-type=module <<'EOF' 2>/dev/null || true
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.env.PROJ + '/.claude/.devkit-manifest.json';
const m = JSON.parse(readFileSync(p, 'utf-8'));
m.version = '0.0.1';
writeFileSync(p, JSON.stringify(m, null, 2) + '\n');
EOF
cli upgrade "$PROJECT_DIR"
MANIFEST=$(cat "$PROJECT_DIR/.claude/.devkit-manifest.json")
assert_not_contains "manifest version updated after upgrade" '"version": "0.0.1"' "$MANIFEST"

teardown

# ══════════════════════════════════════════════════════════════════════════════
# REMOVE — Per-project
# ══════════════════════════════════════════════════════════════════════════════
section "remove (per-project)"
setup

cli init "$PROJECT_DIR"
cli remove "$PROJECT_DIR"

assert_absent "hooks removed"     "$PROJECT_DIR/.claude/hooks/path-guard.sh"
assert_absent "skills removed"    "$PROJECT_DIR/.claude/skills/mf-plan/SKILL.md"
assert_absent "scripts removed"   "$PROJECT_DIR/scripts/build-test.sh"
assert_absent "manifest removed"  "$PROJECT_DIR/.claude/.devkit-manifest.json"

# Preserved items
assert_exists "CLAUDE.md preserved"   "$PROJECT_DIR/.claude/CLAUDE.md"
assert_exists "docs/ preserved"       "$PROJECT_DIR/docs/WORKFLOW.md"
assert_exists "docs/specs preserved"  "$PROJECT_DIR/docs/specs/.gitkeep"

teardown

# ── remove: custom skills are preserved ───────────────────────────────────────
section "remove (per-project — custom skills preserved)"
setup

cli init "$PROJECT_DIR"
# Simulate a user-added custom skill (not tracked in manifest)
mkdir -p "$PROJECT_DIR/.claude/skills/my-custom-skill"
echo "# custom" > "$PROJECT_DIR/.claude/skills/my-custom-skill/SKILL.md"

cli remove "$PROJECT_DIR"

assert_absent "devkit skill removed"   "$PROJECT_DIR/.claude/skills/mf-plan/SKILL.md"
assert_exists "custom skill preserved" "$PROJECT_DIR/.claude/skills/my-custom-skill/SKILL.md"

teardown

# ── remove: no manifest → exit 1 ─────────────────────────────────────────────
section "remove (no manifest — exits 1)"
setup

EXIT=$(cli_exit remove "$PROJECT_DIR")
assert_exit_code "remove with no manifest exits 1" 1 "$EXIT"

teardown

# ══════════════════════════════════════════════════════════════════════════════
# INIT — Global
# ══════════════════════════════════════════════════════════════════════════════
section "init --global — files installed"
setup

cli init --global

# All 8 skills
assert_exists "global skills: mf-explore"   "$TEST_HOME/.claude/skills/mf-explore/SKILL.md"
assert_exists "global skills: mf-plan"      "$TEST_HOME/.claude/skills/mf-plan/SKILL.md"
assert_exists "global skills: mf-build"     "$TEST_HOME/.claude/skills/mf-build/SKILL.md"
assert_exists "global skills: mf-challenge" "$TEST_HOME/.claude/skills/mf-challenge/SKILL.md"
assert_exists "global skills: mf-investigate" "$TEST_HOME/.claude/skills/mf-investigate/SKILL.md"
assert_exists "global skills: mf-fix"       "$TEST_HOME/.claude/skills/mf-fix/SKILL.md"
assert_exists "global skills: mf-review"    "$TEST_HOME/.claude/skills/mf-review/SKILL.md"
assert_exists "global skills: mf-commit"    "$TEST_HOME/.claude/skills/mf-commit/SKILL.md"
assert_exists "global skills: mf-voices"    "$TEST_HOME/.claude/skills/mf-voices/SKILL.md"

# All 6 hooks
assert_exists "global hooks: path-guard.sh"      "$TEST_HOME/.claude/hooks/path-guard.sh"
assert_exists "global hooks: sensitive-guard.sh"  "$TEST_HOME/.claude/hooks/sensitive-guard.sh"
assert_exists "global hooks: comment-guard.js"    "$TEST_HOME/.claude/hooks/comment-guard.js"
assert_exists "global hooks: glob-guard.js"       "$TEST_HOME/.claude/hooks/glob-guard.js"
assert_exists "global hooks: file-guard.js"       "$TEST_HOME/.claude/hooks/file-guard.js"
assert_exists "global hooks: self-review.sh"      "$TEST_HOME/.claude/hooks/self-review.sh"

# Scripts
assert_exists     "global scripts: build-test.sh"          "$TEST_HOME/.claude/scripts/build-test.sh"
assert_executable "global: build-test.sh executable"       "$TEST_HOME/.claude/scripts/build-test.sh"

# Executable permissions
assert_executable "global: path-guard.sh executable"      "$TEST_HOME/.claude/hooks/path-guard.sh"
assert_executable "global: sensitive-guard.sh executable"  "$TEST_HOME/.claude/hooks/sensitive-guard.sh"
assert_executable "global: self-review.sh executable"      "$TEST_HOME/.claude/hooks/self-review.sh"

teardown

# ── init --global: settings.json hook registration ───────────────────────────
section "init --global — settings.json hook registration"
setup

cli init --global

SETTINGS="$TEST_HOME/.claude/settings.json"
assert_exists       "global: settings.json created" "$SETTINGS"
assert_json_valid   "global: settings.json valid JSON" "$SETTINGS"
S=$(cat "$SETTINGS")
assert_contains "settings: PreToolUse section"       '"PreToolUse"'       "$S"
assert_contains "settings: PostToolUse section"      '"PostToolUse"'      "$S"
assert_contains "settings: Stop section"             '"Stop"'             "$S"
assert_contains "settings: path-guard.sh registered"      "path-guard.sh"      "$S"
assert_contains "settings: sensitive-guard.sh registered" "sensitive-guard.sh" "$S"
assert_contains "settings: comment-guard.js registered"   "comment-guard.js"   "$S"
assert_contains "settings: glob-guard.js registered"      "glob-guard.js"      "$S"
assert_contains "settings: file-guard.js registered"      "file-guard.js"      "$S"
assert_contains "settings: self-review.sh registered"     "self-review.sh"     "$S"

teardown

# ── init --global: global manifest ───────────────────────────────────────────
section "init --global — global manifest"
setup

cli init --global

GMETA=$(cat "$TEST_HOME/.claude/.devkit-manifest.json")
assert_contains "global manifest: globalInstalled=true"      '"globalInstalled": true'      "$GMETA"
assert_contains "global manifest: globalHooksInstalled=true" '"globalHooksInstalled": true' "$GMETA"

teardown

# ── init --global: idempotent (no duplicate settings entries) ─────────────────
section "init --global (idempotent — no duplicate hook entries)"
setup

cli init --global
cli init --global

S=$(cat "$TEST_HOME/.claude/settings.json")
# sensitive-guard.sh appears in 2 matcher groups (Bash + Read|Write|...)
# Running init twice must not double it to 4
COUNT=$(printf '%s' "$S" | grep -c "sensitive-guard.sh" || true)
[[ "$COUNT" -le 2 ]] \
  && pass "no duplicate sensitive-guard entries after 2x init (count=$COUNT)" \
  || fail "duplicate sensitive-guard entries after 2x init (count=$COUNT, expected ≤2)"

teardown

# ── init --global: preserves existing user hooks ──────────────────────────────
section "init --global (preserves user hooks in settings.json)"
setup

mkdir -p "$TEST_HOME/.claude"
printf '{"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"bash /my/custom-hook.sh"}]}]}}\n' \
  > "$TEST_HOME/.claude/settings.json"

cli init --global

S=$(cat "$TEST_HOME/.claude/settings.json")
assert_contains "user hook preserved after global init" "custom-hook.sh" "$S"
assert_contains "devkit hooks added alongside user hook" "path-guard.sh"  "$S"

teardown

# ── init --global: skills have YAML frontmatter ───────────────────────────────
section "init --global — global skills have YAML frontmatter"
setup

cli init --global

for skill in mf-explore mf-plan mf-build mf-challenge mf-investigate mf-fix mf-review mf-commit mf-voices; do
  FIRST=$(head -1 "$TEST_HOME/.claude/skills/$skill/SKILL.md")
  assert_contains "global $skill starts with ---" "---" "$FIRST"
done

teardown

# ══════════════════════════════════════════════════════════════════════════════
# UPGRADE — Global
# ══════════════════════════════════════════════════════════════════════════════
section "upgrade --global (no changes)"
setup

cli init --global
OUT_UG=$(cli_out upgrade --global)
assert_contains "global upgrade no changes: skills unchanged"  "unchanged" "$OUT_UG"
assert_contains "global upgrade no changes: hooks unchanged"   "unchanged" "$OUT_UG"
assert_contains "global upgrade no changes: scripts unchanged" "scripts"   "$OUT_UG"

teardown

# ── upgrade --global: customized hook is skipped ─────────────────────────────
section "upgrade --global (customized hook — skip)"
setup

cli init --global
printf '# CUSTOM\n' >> "$TEST_HOME/.claude/hooks/path-guard.sh"
OUT_UGSKIP=$(cli_out upgrade --global)
assert_contains "global upgrade: skips customized hook" "customized" "$OUT_UGSKIP"
CONTENT=$(cat "$TEST_HOME/.claude/hooks/path-guard.sh")
assert_contains "global upgrade: custom content preserved" "CUSTOM" "$CONTENT"

teardown

# ── upgrade --global --force: overwrites customized ──────────────────────────
section "upgrade --global --force (overwrites customized)"
setup

cli init --global
printf '# CUSTOM\n' >> "$TEST_HOME/.claude/hooks/path-guard.sh"
cli upgrade --global --force
CONTENT=$(cat "$TEST_HOME/.claude/hooks/path-guard.sh")
assert_not_contains "global force upgrade: custom content gone" "CUSTOM" "$CONTENT"

teardown

# ── upgrade --global: customized skill is skipped ────────────────────────────
section "upgrade --global (customized skill — skip)"
setup

cli init --global
printf '\n# CUSTOM\n' >> "$TEST_HOME/.claude/skills/mf-plan/SKILL.md"
OUT_UGSSK=$(cli_out upgrade --global)
assert_contains "global upgrade: skips customized skill" "customized" "$OUT_UGSSK"
CONTENT=$(cat "$TEST_HOME/.claude/skills/mf-plan/SKILL.md")
assert_contains "global upgrade: custom skill content preserved" "CUSTOM" "$CONTENT"

teardown

# ── upgrade --global: re-registers hooks in settings.json ─────────────────────
section "upgrade --global (re-registers hooks in settings.json)"
setup

cli init --global
# Corrupt settings.json to remove devkit entries
printf '{"hooks":{}}\n' > "$TEST_HOME/.claude/settings.json"
cli upgrade --global
S=$(cat "$TEST_HOME/.claude/settings.json")
assert_contains "global upgrade re-registers path-guard" "path-guard.sh" "$S"

teardown

# ══════════════════════════════════════════════════════════════════════════════
# REMOVE — Global
# ══════════════════════════════════════════════════════════════════════════════
section "remove --global"
setup

cli init --global
cli remove --global

assert_absent "global skills dir removed"    "$TEST_HOME/.claude/skills"
assert_absent "global hooks dir removed"     "$TEST_HOME/.claude/hooks"
assert_absent "global scripts dir removed"   "$TEST_HOME/.claude/scripts"
assert_absent "global manifest removed"      "$TEST_HOME/.claude/.devkit-manifest.json"
S=$(cat "$TEST_HOME/.claude/settings.json")
assert_not_contains "settings.json: devkit entries removed" "path-guard.sh" "$S"

teardown

# ── remove --global: preserves user hooks ────────────────────────────────────
section "remove --global (preserves user hooks)"
setup

mkdir -p "$TEST_HOME/.claude"
printf '{"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"bash /my/custom-hook.sh"}]}]}}\n' \
  > "$TEST_HOME/.claude/settings.json"
cli init --global
cli remove --global

S=$(cat "$TEST_HOME/.claude/settings.json")
assert_contains     "user hook preserved after global remove" "custom-hook.sh" "$S"
assert_not_contains "devkit entries gone after global remove" "path-guard.sh"  "$S"

teardown

# ── remove --global: idempotent ───────────────────────────────────────────────
section "remove --global (idempotent — second call exits 0)"
setup

cli init --global
cli remove --global
EXIT=$(cli_exit remove --global)
assert_exit_code "second remove --global exits 0" 0 "$EXIT"

teardown

# ── remove --global: per-project install unaffected ──────────────────────────
section "remove --global (per-project install unaffected)"
setup

cli init "$PROJECT_DIR"
cli init --global
cli remove --global

# Per-project files must still be there
assert_exists "per-project hooks untouched after global remove" "$PROJECT_DIR/.claude/hooks/path-guard.sh"
assert_exists "per-project skills untouched after global remove" "$PROJECT_DIR/.claude/skills/mf-plan/SKILL.md"

teardown

# ══════════════════════════════════════════════════════════════════════════════
# AUTO-UPGRADE — global auto-upgrade on per-project init
# ══════════════════════════════════════════════════════════════════════════════
section "auto-upgrade global on per-project init (globalInstalled=true)"
setup

cli init --global
# Global manifest now has globalInstalled=true
# Per-project init should auto-upgrade global
OUT_AUTO=$(cli_out init "$PROJECT_DIR")
assert_contains "auto-upgrade: global skills mentioned" "global" "$OUT_AUTO"
assert_exists   "auto-upgrade: global skills still present" "$TEST_HOME/.claude/skills/mf-plan/SKILL.md"

teardown

# ══════════════════════════════════════════════════════════════════════════════
# mergeGlobalSettings — idempotency and isolation
# ══════════════════════════════════════════════════════════════════════════════
section "mergeGlobalSettings — no duplicate entries after repeated init"
setup

cli init --global
cli init --global
cli init --global

S=$(cat "$TEST_HOME/.claude/settings.json")
PG_COUNT=$(printf '%s' "$S" | grep -c "path-guard.sh" || true)
[[ "$PG_COUNT" -le 2 ]] \
  && pass "no duplicate path-guard entries after 3x init (count=$PG_COUNT)" \
  || fail "duplicate path-guard entries (count=$PG_COUNT, expected ≤2)"

teardown

# ── mergeGlobalSettings: entries point to global hooks dir ───────────────────
section "mergeGlobalSettings — hook commands reference global dir"
setup

cli init --global

S=$(cat "$TEST_HOME/.claude/settings.json")
EXPECTED_DIR=$(printf '%s' "$TEST_HOME" | sed 's|\\|/|g')
assert_contains "settings: commands reference TEST_HOME/.claude/hooks/" \
  "$EXPECTED_DIR/.claude/hooks/" "$S"

teardown

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
