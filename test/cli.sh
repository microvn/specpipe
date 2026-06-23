#!/usr/bin/env bash
# test/cli.sh — Integration tests for agentpipe CLI
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
  local manifest="$1/.agentpipe/manifest.json" key="$2"
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
assert_exists "skills: ap-explore/SKILL.md"    "$PROJECT_DIR/.claude/skills/ap-explore/SKILL.md"
assert_exists "skills: ap-plan/SKILL.md"       "$PROJECT_DIR/.claude/skills/ap-plan/SKILL.md"
assert_exists "skills: ap-build/SKILL.md"      "$PROJECT_DIR/.claude/skills/ap-build/SKILL.md"
assert_exists "skills: ap-challenge/SKILL.md"  "$PROJECT_DIR/.claude/skills/ap-challenge/SKILL.md"
assert_exists "skills: ap-investigate/SKILL.md" "$PROJECT_DIR/.claude/skills/ap-investigate/SKILL.md"
assert_exists "skills: ap-fix/SKILL.md"        "$PROJECT_DIR/.claude/skills/ap-fix/SKILL.md"
assert_exists "skills: ap-review/SKILL.md"     "$PROJECT_DIR/.claude/skills/ap-review/SKILL.md"
assert_exists "skills: ap-commit/SKILL.md"     "$PROJECT_DIR/.claude/skills/ap-commit/SKILL.md"
assert_exists "skills: ap-voices/SKILL.md"     "$PROJECT_DIR/.claude/skills/ap-voices/SKILL.md"
assert_exists "skills: ap-spec-render/SKILL.md"       "$PROJECT_DIR/.claude/skills/ap-spec-render/SKILL.md"
assert_exists "skills: ap-spec-render/template.html"  "$PROJECT_DIR/.claude/skills/ap-spec-render/template.html"
assert_exists "skills: ap-spec-render/components.md"  "$PROJECT_DIR/.claude/skills/ap-spec-render/components.md"
assert_exists "skills: ap-md-render/SKILL.md"         "$PROJECT_DIR/.claude/skills/ap-md-render/SKILL.md"
assert_exists "skills: ap-md-render/template.html"    "$PROJECT_DIR/.claude/skills/ap-md-render/template.html"
assert_exists "skills: ap-md-render/components.md"     "$PROJECT_DIR/.claude/skills/ap-md-render/components.md"
assert_exists "skills: ap-humanize/SKILL.md"          "$PROJECT_DIR/.claude/skills/ap-humanize/SKILL.md"

# Hooks
assert_exists "hooks: path-guard.sh"      "$PROJECT_DIR/.claude/hooks/path-guard.sh"
assert_exists "hooks: sensitive-guard.sh" "$PROJECT_DIR/.claude/hooks/sensitive-guard.sh"
assert_exists "hooks: comment-guard.js"   "$PROJECT_DIR/.claude/hooks/comment-guard.js"
assert_exists "hooks: glob-guard.js"      "$PROJECT_DIR/.claude/hooks/glob-guard.js"
assert_exists "hooks: file-guard.js"      "$PROJECT_DIR/.claude/hooks/file-guard.js"
assert_exists "hooks: self-review.sh"     "$PROJECT_DIR/.claude/hooks/self-review.sh"

# Config, docs
assert_exists "config: settings.json"  "$PROJECT_DIR/.claude/settings.json"
assert_exists "config: CLAUDE.md"      "$PROJECT_DIR/.claude/CLAUDE.md"
assert_exists "docs: WORKFLOW.md"      "$PROJECT_DIR/docs/WORKFLOW.md"

# Placeholder dirs
assert_exists "placeholder: docs/specs/.gitkeep"      "$PROJECT_DIR/docs/specs/.gitkeep"
assert_exists "placeholder: docs/test-plans/.gitkeep" "$PROJECT_DIR/docs/test-plans/.gitkeep"

# Manifest
assert_exists "manifest: created" "$PROJECT_DIR/.agentpipe/manifest.json"
assert_json_valid "manifest: valid JSON" "$PROJECT_DIR/.agentpipe/manifest.json"
MANIFEST=$(cat "$PROJECT_DIR/.agentpipe/manifest.json")
assert_contains "manifest: has version key" '"version"' "$MANIFEST"
assert_contains "manifest: has files key"   '"files"'   "$MANIFEST"
assert_contains "manifest: tracks a hook"   'path-guard.sh' "$MANIFEST"

# settings.json valid JSON
assert_json_valid "settings.json: valid JSON" "$PROJECT_DIR/.claude/settings.json"

# Executable permissions
assert_executable "path-guard.sh is executable"      "$PROJECT_DIR/.claude/hooks/path-guard.sh"
assert_executable "sensitive-guard.sh is executable" "$PROJECT_DIR/.claude/hooks/sensitive-guard.sh"
assert_executable "self-review.sh is executable"     "$PROJECT_DIR/.claude/hooks/self-review.sh"

teardown

# ── init: --only skills ───────────────────────────────────────────────────────
section "init --only skills"
setup

cli init "$PROJECT_DIR" --only skills

assert_exists "skills present with --only skills"  "$PROJECT_DIR/.claude/skills/ap-plan/SKILL.md"
assert_absent "hooks absent with --only skills"    "$PROJECT_DIR/.claude/hooks/path-guard.sh"
assert_absent "docs absent with --only skills"     "$PROJECT_DIR/docs/WORKFLOW.md"

teardown

# ── init: --dry-run ───────────────────────────────────────────────────────────
section "init --dry-run"
setup

cli init "$PROJECT_DIR" --dry-run

assert_absent "no skills with --dry-run"   "$PROJECT_DIR/.claude/skills/ap-plan/SKILL.md"
assert_absent "no hooks with --dry-run"    "$PROJECT_DIR/.claude/hooks/path-guard.sh"
assert_absent "no manifest with --dry-run" "$PROJECT_DIR/.agentpipe/manifest.json"

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
for skill in ap-explore ap-plan ap-build ap-challenge ap-investigate ap-fix ap-review ap-commit ap-voices ap-humanize; do
  CONTENT=$(head -1 "$PROJECT_DIR/.claude/skills/$skill/SKILL.md")
  assert_contains "$skill/SKILL.md starts with ---" "---" "$CONTENT"
done
PLAN_FM=$(awk '/^---$/{c++; if(c==2) exit} {print}' "$PROJECT_DIR/.claude/skills/ap-plan/SKILL.md")
assert_contains "ap-plan: has description frontmatter" "description:" "$PLAN_FM"
assert_contains "ap-plan: has allowed-tools frontmatter" "allowed-tools:" "$PLAN_FM"

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
const p = process.env.PROJ + '/.agentpipe/manifest.json';
const m = JSON.parse(readFileSync(p, 'utf-8'));
m.version = '0.0.1';
writeFileSync(p, JSON.stringify(m, null, 2) + '\n');
EOF
cli upgrade "$PROJECT_DIR"
MANIFEST=$(cat "$PROJECT_DIR/.agentpipe/manifest.json")
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
assert_absent "skills removed"    "$PROJECT_DIR/.claude/skills/ap-plan/SKILL.md"
assert_absent "manifest removed"  "$PROJECT_DIR/.agentpipe/manifest.json"

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

assert_absent "devkit skill removed"   "$PROJECT_DIR/.claude/skills/ap-plan/SKILL.md"
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

# Core SKILL.md skills
assert_exists "global skills: ap-explore"   "$TEST_HOME/.claude/skills/ap-explore/SKILL.md"
assert_exists "global skills: ap-plan"      "$TEST_HOME/.claude/skills/ap-plan/SKILL.md"
assert_exists "global skills: ap-build"     "$TEST_HOME/.claude/skills/ap-build/SKILL.md"
assert_exists "global skills: ap-challenge" "$TEST_HOME/.claude/skills/ap-challenge/SKILL.md"
assert_exists "global skills: ap-investigate" "$TEST_HOME/.claude/skills/ap-investigate/SKILL.md"
assert_exists "global skills: ap-fix"       "$TEST_HOME/.claude/skills/ap-fix/SKILL.md"
assert_exists "global skills: ap-review"    "$TEST_HOME/.claude/skills/ap-review/SKILL.md"
assert_exists "global skills: ap-commit"    "$TEST_HOME/.claude/skills/ap-commit/SKILL.md"
assert_exists "global skills: ap-voices"    "$TEST_HOME/.claude/skills/ap-voices/SKILL.md"
assert_exists "global skills: ap-humanize"  "$TEST_HOME/.claude/skills/ap-humanize/SKILL.md"

# All 6 hooks
assert_exists "global hooks: path-guard.sh"      "$TEST_HOME/.claude/hooks/path-guard.sh"
assert_exists "global hooks: sensitive-guard.sh"  "$TEST_HOME/.claude/hooks/sensitive-guard.sh"
assert_exists "global hooks: comment-guard.js"    "$TEST_HOME/.claude/hooks/comment-guard.js"
assert_exists "global hooks: glob-guard.js"       "$TEST_HOME/.claude/hooks/glob-guard.js"
assert_exists "global hooks: file-guard.js"       "$TEST_HOME/.claude/hooks/file-guard.js"
assert_exists "global hooks: self-review.sh"      "$TEST_HOME/.claude/hooks/self-review.sh"

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

for skill in ap-explore ap-plan ap-build ap-challenge ap-investigate ap-fix ap-review ap-commit ap-voices ap-humanize; do
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
printf '\n# CUSTOM\n' >> "$TEST_HOME/.claude/skills/ap-plan/SKILL.md"
OUT_UGSSK=$(cli_out upgrade --global)
assert_contains "global upgrade: skips customized skill" "customized" "$OUT_UGSSK"
CONTENT=$(cat "$TEST_HOME/.claude/skills/ap-plan/SKILL.md")
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
# Simulate a legacy install that still has the old global build-test.sh
mkdir -p "$TEST_HOME/.claude/scripts"
echo "#!/usr/bin/env bash" > "$TEST_HOME/.claude/scripts/build-test.sh"
cli remove --global

assert_absent "global skills dir removed"    "$TEST_HOME/.claude/skills"
assert_absent "global hooks dir removed"     "$TEST_HOME/.claude/hooks"
assert_absent "legacy build-test.sh removed" "$TEST_HOME/.claude/scripts/build-test.sh"
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
assert_exists "per-project skills untouched after global remove" "$PROJECT_DIR/.claude/skills/ap-plan/SKILL.md"

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
assert_exists   "auto-upgrade: global skills still present" "$TEST_HOME/.claude/skills/ap-plan/SKILL.md"

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

# ── multi-agent: --agents emits per-agent skills ────────────────────────────
section "init --agents (non-claude) emits native paths, no .claude"
setup

cli init "$PROJECT_DIR" --agents cursor,antigravity
assert_exists "cursor native skill emitted" "$PROJECT_DIR/.cursor/skills/ap-plan/SKILL.md"
assert_exists "antigravity SKILL.md emitted" "$PROJECT_DIR/.agents/skills/ap-plan/SKILL.md"
# Manifest still lives at .claude/.devkit-manifest.json (neutral location is future work),
# but no Claude *content* is installed when Claude isn't selected.
assert_absent "no claude settings.json when claude not selected" "$PROJECT_DIR/.claude/settings.json"
assert_absent "no claude skills when claude not selected" "$PROJECT_DIR/.claude/skills"

AG=$(cat "$PROJECT_DIR/.agents/skills/ap-plan/SKILL.md")
assert_contains "antigravity adds name from dir" "name: ap-plan" "$AG"
if printf '%s' "$AG" | grep -q "allowed-tools"; then
  fail "antigravity drops allowed-tools"
else pass "antigravity drops allowed-tools"; fi

CU=$(cat "$PROJECT_DIR/.cursor/skills/ap-plan/SKILL.md")
assert_contains "cursor native skill adds name" "name: ap-plan" "$CU"

teardown

# ── multi-agent: --agents all installs Claude base too ───────────────────────
section "init --agents all installs Claude base (settings.json) + every agent"
setup

cli init "$PROJECT_DIR" --agents all
assert_exists "claude settings.json present" "$PROJECT_DIR/.claude/settings.json"
assert_exists "claude skill present" "$PROJECT_DIR/.claude/skills/ap-plan/SKILL.md"
assert_exists "openclaw skill present" "$PROJECT_DIR/skills/ap-plan/SKILL.md"
assert_exists "hermes skill present" "$PROJECT_DIR/optional-skills/agentpipe/ap-plan/SKILL.md"
assert_exists "codex skill present" "$PROJECT_DIR/.agents/skills/ap-plan/SKILL.md"

teardown

# ── multi-agent: unknown agent fails ─────────────────────────────────────────
section "init --agents bogus exits non-zero"
setup

CODE=$(cli_exit init "$PROJECT_DIR" --agents bogus)
[[ "$CODE" != "0" ]] && pass "unknown agent rejected (exit $CODE)" || fail "unknown agent should fail"

teardown

# ── multi-agent lifecycle: upgrade is idempotent, then re-applies kit changes ──
section "multi-agent upgrade — idempotent then re-emits on kit change"
setup

cli init "$PROJECT_DIR" --agents cursor,antigravity
assert_exists "multi-agent manifest at neutral location" "$PROJECT_DIR/.agentpipe/manifest.json"
MA=$(cat "$PROJECT_DIR/.agentpipe/manifest.json")
assert_contains "manifest records agents" '"agents"' "$MA"
assert_contains "entry carries templateRel" 'templateRel' "$MA"

OUT=$(cli_out upgrade "$PROJECT_DIR")
assert_contains "upgrade idempotent (0 updated)" "Updated 0" "$OUT"

# Simulate a genuine kit change (not a user edit): roll the emitted file + its
# manifest kitHash back to old content in lockstep, so it's NOT seen as customized.
node --input-type=module <<EOF 2>/dev/null
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const f = '$PROJECT_DIR/.cursor/skills/ap-plan/SKILL.md';
const mp = '$PROJECT_DIR/.agentpipe/manifest.json';
const old = '--- OLD EMITTED CONTENT ---\n';
writeFileSync(f, old);
const h = createHash('sha256').update(old).digest('hex');
const m = JSON.parse(readFileSync(mp, 'utf-8'));
m.files['.cursor/skills/ap-plan/SKILL.md'].kitHash = h;
m.files['.cursor/skills/ap-plan/SKILL.md'].installedHash = h;
writeFileSync(mp, JSON.stringify(m, null, 2) + '\n');
EOF
OUT=$(cli_out upgrade "$PROJECT_DIR")
assert_contains "upgrade re-emits changed cursor rule" "Updated 1" "$OUT"
NEW=$(cat "$PROJECT_DIR/.cursor/skills/ap-plan/SKILL.md")
assert_contains "re-emitted content is the real skill" "name: ap-plan" "$NEW"

teardown

# ── multi-agent remove: cleans every agent's dirs + neutral manifest ─────────
section "multi-agent remove — clears all agent layouts"
setup

cli init "$PROJECT_DIR" --agents cursor,antigravity,openclaw
cli remove "$PROJECT_DIR"
assert_absent "cursor rules removed"      "$PROJECT_DIR/.cursor"
assert_absent "antigravity skills removed" "$PROJECT_DIR/.agents"
assert_absent "openclaw skills removed"    "$PROJECT_DIR/skills"
assert_absent "neutral manifest removed"   "$PROJECT_DIR/.agentpipe"

teardown

# ── Phase 2: guardrails per agent ────────────────────────────────────────────
section "guards — owned rules files per agent"
setup

cli init "$PROJECT_DIR" --agents cursor,antigravity,openclaw
assert_exists "cursor guards .mdc"        "$PROJECT_DIR/.cursor/rules/agentpipe-guards.mdc"
assert_exists "antigravity guards rule"   "$PROJECT_DIR/.agent/rules/agentpipe-guards.md"
assert_exists "openclaw advisory doc"     "$PROJECT_DIR/AGENTPIPE-GUARDS.md"
CR=$(cat "$PROJECT_DIR/.cursor/rules/agentpipe-guards.mdc")
assert_contains "cursor guards alwaysApply" "alwaysApply: true" "$CR"
assert_contains "guards body present"       "Never touch secrets" "$CR"

teardown

# ── guards: Codex merges into shared AGENTS.md, preserving user content ───────
section "guards — Codex AGENTS.md merge + clean strip on remove"
setup

printf '# My Project\n\nUser instructions.\n' > "$PROJECT_DIR/AGENTS.md"
cli init "$PROJECT_DIR" --agents codex
AM=$(cat "$PROJECT_DIR/AGENTS.md")
assert_contains "AGENTS.md keeps user content" "User instructions." "$AM"
assert_contains "AGENTS.md gains guards section" "operating rules" "$AM"

# Idempotent: re-init --force must not duplicate the section
cli init "$PROJECT_DIR" --agents codex --force
COUNT=$(grep -c "agentpipe:guards:begin" "$PROJECT_DIR/AGENTS.md" || true)
assert_contains "no duplicate guards section" "1" "$COUNT"

cli remove "$PROJECT_DIR"
AM2=$(cat "$PROJECT_DIR/AGENTS.md")
assert_contains "remove keeps user content" "User instructions." "$AM2"
assert_not_contains "remove strips guards section" "operating rules" "$AM2"

teardown

# ── M-1: re-init accumulates agents (no orphaning) ───────────────────────────
section "init --agents accumulates across runs"
setup

cli init "$PROJECT_DIR" --agents codex
cli init "$PROJECT_DIR" --agents cursor
assert_exists "first agent (codex) still installed" "$PROJECT_DIR/.agents/skills/ap-plan/SKILL.md"
assert_exists "second agent (cursor) installed"     "$PROJECT_DIR/.cursor/skills/ap-plan/SKILL.md"
MA=$(cat "$PROJECT_DIR/.agentpipe/manifest.json")
assert_contains "manifest tracks codex still" 'codex' "$MA"
assert_contains "manifest tracks cursor"      'cursor' "$MA"
# remove now cleans BOTH agents (codex would be orphaned without accumulation)
cli remove "$PROJECT_DIR"
assert_absent "remove cleans codex (.agents)" "$PROJECT_DIR/.agents"
assert_absent "remove cleans cursor"          "$PROJECT_DIR/.cursor"

teardown

# ── M-2: upgrade refreshes the Codex AGENTS.md guards section ────────────────
section "upgrade re-merges AGENTS.md guards (Codex)"
setup

cli init "$PROJECT_DIR" --agents codex
# Simulate a stale guards section: gut its body but keep the markers.
node --input-type=module <<EOF 2>/dev/null
import { readFileSync, writeFileSync } from 'node:fs';
const p = '$PROJECT_DIR/AGENTS.md';
let s = readFileSync(p, 'utf-8');
s = s.replace(/<!-- agentpipe:guards:begin -->[\s\S]*?<!-- agentpipe:guards:end -->/,
  '<!-- agentpipe:guards:begin -->\nSTALE\n<!-- agentpipe:guards:end -->');
writeFileSync(p, s);
EOF
cli upgrade "$PROJECT_DIR"
AM=$(cat "$PROJECT_DIR/AGENTS.md")
assert_contains "upgrade restored guards body" "Never touch secrets" "$AM"
assert_not_contains "stale marker content gone" "STALE" "$AM"

teardown

# ── Enforced hooks (Codex/Cursor) — install, block, remove ───────────────────
section "enforced hooks install + actually block + remove"
setup

cli init "$PROJECT_DIR" --agents codex,cursor
assert_exists  "codex hooks.json"        "$PROJECT_DIR/.codex/hooks.json"
assert_json_valid "codex hooks.json valid" "$PROJECT_DIR/.codex/hooks.json"
assert_executable "codex shell-guard +x"  "$PROJECT_DIR/.codex/hooks/agentpipe-shell-guard.sh"
assert_exists  "cursor hooks.json"       "$PROJECT_DIR/.cursor/hooks.json"
assert_json_valid "cursor hooks.json valid" "$PROJECT_DIR/.cursor/hooks.json"
assert_executable "cursor read-guard +x" "$PROJECT_DIR/.cursor/hooks/agentpipe-read-guard.sh"

# The installed guard actually blocks (exit 2) — real enforcement, not advisory.
C=$(printf '{"tool_input":{"command":"ls node_modules"}}' | bash "$PROJECT_DIR/.codex/hooks/agentpipe-shell-guard.sh" >/dev/null 2>&1; echo $?)
[[ "$C" == "2" ]] && pass "shell-guard blocks node_modules (exit 2)" || fail "shell-guard should block (got $C)"
C=$(printf '{"command":"ls src"}' | bash "$PROJECT_DIR/.cursor/hooks/agentpipe-shell-guard.sh" >/dev/null 2>&1; echo $?)
[[ "$C" == "0" ]] && pass "shell-guard allows safe command (exit 0)" || fail "shell-guard should allow (got $C)"
C=$(printf '{"file_path":"app/.env"}' | bash "$PROJECT_DIR/.cursor/hooks/agentpipe-read-guard.sh" >/dev/null 2>&1; echo $?)
[[ "$C" == "2" ]] && pass "read-guard blocks .env (exit 2)" || fail "read-guard should block (got $C)"

cli remove "$PROJECT_DIR"
assert_absent "codex hooks removed"  "$PROJECT_DIR/.codex/hooks"
assert_absent "cursor hooks removed" "$PROJECT_DIR/.cursor/hooks"

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
