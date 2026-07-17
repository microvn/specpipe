#!/usr/bin/env bash
# test/coverage-gate.sh — Regression tests for sp-build's Spec Coverage Gate (Phase 3.5)
#
# The gate is the one DETERMINISTIC part of sp-build: it counts coverage with a
# command, not LLM judgement, so it can be tested like code. This guards both the
# gate's behaviour and the exact grep flags in the skill — two real bugs were
# caught here: `\b` (GNU-ism → phantom "AS-01" on BSD/ugrep) and a missing `-h`
# (grep -r prefixes "file:" → set-difference never matches → always falsely BLOCKED).
#
# Run from repo root: bash test/coverage-gate.sh
# Exit 0 = all passed. Exit 1 = failures.

set -euo pipefail

# The Spec Coverage Gate lives in gates.md (sp-build was split into navigator +
# core-loop/gates/orchestration/port). The drift-guards below assert against it.
GATES="$(cd "$(dirname "$0")/.." && pwd)/kit/skills/sp-build/gates.md"
PASSED=0
FAILED=0

green() { printf '\033[32m%s\033[0m\n' "$1"; }
red()   { printf '\033[31m%s\033[0m\n' "$1"; }
pass() { PASSED=$((PASSED+1)); green "  ✓ $1"; }
fail() { FAILED=$((FAILED+1)); red   "  ✗ $1"; }
section() { printf '\n── %s ──\n' "$1"; }

assert_eq() { # name, got, want
  if [ "$2" = "$3" ]; then pass "$1"; else fail "$1"; printf '      got:  [%s]\n      want: [%s]\n' "$2" "$3"; fi
}

# ─── The gate, exactly as sp-build Phase 3.5 defines it ────────────────────────
# Keep these two commands in sync with the skill. The skill-text guards below
# assert the skill still uses these flags.
gate_uncovered() { # spec_file, test_dir → prints uncovered ids, space-separated
  local spec="$1" testdir="$2"
  # Mirror production: strip **Execution:** metadata first so verify-hint substrings
  # (e.g. -t "AS-0") don't become phantom obligations.
  grep -vE '\*\*Execution:\*\*' "$spec" | grep -owE '(AS|C)-[0-9]+' | sort -u > "$WORK/sp.txt"
  grep -rowhE '(AS|C)-[0-9]+' "$testdir" 2>/dev/null | sort -u > "$WORK/cv.txt"
  comm -23 "$WORK/sp.txt" "$WORK/cv.txt" | tr '\n' ' '
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/tests"
cat > "$WORK/spec.md" <<'EOF'
## Stories
### S-001 (P0)
AS-001: happy path
AS-002: refuse when unauthorized
### S-002 (P0)
AS-003: list
AS-010: export
AS-011: report
AS-012: close
## Constraints & Invariants
- C-001: balance never negative
- C-002: one grant per pair
EOF

ALL_IDS="AS-001 AS-002 AS-003 AS-010 AS-011 AS-012 C-001 C-002 "

section "Spec ID extraction (no phantom from leading-zero IDs)"
SP="$(grep -owE '(AS|C)-[0-9]+' "$WORK/spec.md" | sort -u | tr '\n' ' ')"
assert_eq "spec yields exactly its 8 ids, no phantom AS-01" "$SP" "$ALL_IDS"

# Bug guard: **Execution:** verify hints carry AS-id-shaped substrings (e.g. -t "AS-0")
# that are NOT acceptance scenarios — stripping the metadata line prevents a phantom
# obligation that would false-BLOCK a complete build.
cat > "$WORK/spec-exec.md" <<'EOF'
## Stories
### S-001 (P0)
**Execution:** depends_on: none · verify: npx vitest run -t "AS-0"
AS-001: happy path
## Constraints
- C-001: x
EOF
SP_EXEC="$(grep -vE '\*\*Execution:\*\*' "$WORK/spec-exec.md" | grep -owE '(AS|C)-[0-9]+' | sort -u | tr '\n' ' ')"
assert_eq "Execution/verify metadata does not create a phantom AS-0" "$SP_EXEC" "AS-001 C-001 "

section "Coverage gate behaviour"

rm -f "$WORK"/tests/*
assert_eq "empty test dir → every id uncovered (BLOCKED)" "$(gate_uncovered "$WORK/spec.md" "$WORK/tests")" "$ALL_IDS"

printf 'test("AS-001: ok"){}\ntest("AS-003: ok"){}\n' > "$WORK/tests/a.test.ts"
assert_eq "partial coverage → reports only the missing ids" \
  "$(gate_uncovered "$WORK/spec.md" "$WORK/tests")" "AS-002 AS-010 AS-011 AS-012 C-001 C-002 "

printf 'test("AS-010: export"){}\n' > "$WORK/tests/b.test.ts"
UNC="$(gate_uncovered "$WORK/spec.md" "$WORK/tests")"
assert_eq "covering AS-010 does NOT leave a phantom AS-01 uncovered" \
  "$(printf '%s' "$UNC" | grep -owE 'AS-01' || echo NONE)" "NONE"

cat > "$WORK/tests/all.test.ts" <<'EOF'
test("AS-001"){} test("AS-002"){} test("AS-003"){} test("AS-010"){}
test("AS-011"){} test("AS-012"){} test("C-001"){} test("C-002"){}
EOF
assert_eq "full coverage → gate passes (no uncovered ids)" "$(gate_uncovered "$WORK/spec.md" "$WORK/tests")" ""

rm -f "$WORK"/tests/*
printf 'test("returns 403 when role missing"){}\n' > "$WORK/tests/untagged.test.ts"
UNC="$(gate_uncovered "$WORK/spec.md" "$WORK/tests")"
assert_eq "untagged test (no AS id in name) → ids still reported uncovered (fail-safe)" \
  "$(printf '%s' "$UNC" | grep -owE 'AS-001' | head -1)" "AS-001"

section "Skill-text guards (the exact flags that broke before)"
grep -q "grep -vE '\\\\\*\\\\\*Execution:\\\\\*\\\\\*' \"\$SPEC\"" "$GATES" \
  && pass "spec grep strips **Execution:** metadata first (no phantom-id false-block)" \
  || fail "spec grep Execution filter drifted in gates.md"
grep -q "grep -owE '(AS|C)-\[0-9\]+'" "$GATES" \
  && pass "spec grep uses -owE (portable, no \\b)" || fail "spec grep flags drifted in gates.md"
grep -q "grep -rowhE '(AS|C)-\[0-9\]+' \"\$TESTDIR\"" "$GATES" \
  && pass "covered grep uses -rowhE (has -h, no \\b)" || fail "covered grep flags drifted in gates.md"
if grep -nE "grep .*\\\\b\(AS\|C\)" "$GATES" >/dev/null 2>&1; then
  fail "gates.md still uses \\b in a coverage grep (GNU-ism → phantom ids on BSD)"
else
  pass "no \\b in coverage greps"
fi

# ─── Summary ───────────────────────────────────────────────────────────────────
printf '\n'
if [ "$FAILED" -eq 0 ]; then
  green "coverage-gate: $PASSED passed, 0 failed"
  exit 0
else
  red "coverage-gate: $PASSED passed, $FAILED failed"
  exit 1
fi
