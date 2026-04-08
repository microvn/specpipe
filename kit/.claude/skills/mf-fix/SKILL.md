---
description: Test-first bug fix — write failing test, fix code, verify green
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
---
Test-first bug fix — write failing test, fix code, verify green.

Bug: $ARGUMENTS

---

## Iron Law

**NEVER fix without finding the root cause first.**

Fixing symptoms creates whack-a-mole debugging. Every fix that doesn't address the root cause makes the next bug harder to find.

---

## Phase 0: Investigate

Don't jump to code. Understand the bug first:

1. **Parse the report.** Symptom? Expected vs actual? Repro steps? If context is missing → ask ONE question via AskUserQuestion before proceeding.
2. **Locate the code.** If `codebase-memory-mcp` is connected, prefer `search_code("<error message or function name>")` to find related files and `trace_call_path` to map callers and impact radius — indexed search and call graph visibility that grep cannot match. Fallback: Grep for keywords from the bug (error messages, function names).
3. **Check history.** `git log --oneline -20 -- <affected-files>` — was this working before? What changed? Regression = root cause is in the diff.
4. **Pattern check.** Match the symptom against known bug patterns:

| Pattern | Signature | Where to look |
|---------|-----------|---------------|
| Race condition | Intermittent, timing-dependent | Concurrent access to shared state |
| Nil/null propagation | NoMethodError, TypeError, NullPointerException | Missing guards on optional values |
| State corruption | Inconsistent data, partial updates | Transactions, callbacks, hooks |
| Integration failure | Timeout, unexpected response | External API calls, service boundaries |
| Config drift | Works locally, fails in staging/prod | Env vars, feature flags, DB state |
| Stale cache | Shows old data, fixes on cache clear | Redis, CDN, browser cache |

5. **Reproduce deterministically.** If you can't trigger the bug reliably → gather more evidence. Do NOT guess.

> If `codebase-memory-mcp` is connected, prefer it for steps 2 and 4 — `search_code` for finding affected files, `trace_call_path` for blast radius, `get_architecture` to check if the bug lives in a sensitive layer (auth, payment, core). These are more reliable than ad-hoc grep.

**Required output:** `Root cause hypothesis: ...` — a specific, testable claim about what is wrong and why.

**Required output 2: Bug Path Diagram**

Draw a coverage diagram for the buggy function using the same format as mf-build:

```
CODE PATH COVERAGE
===========================
[+] src/services/affected.ts
    │
    └── affectedFn()
        ├── [★★  TESTED] Normal path — affected.test.ts:12
        ├── [GAP]         Edge case X (← bug lives here) — NO TEST
        │   └── [GAP]     Downstream effect — NO TEST
        └── [★★  TESTED] Other branch — affected.test.ts:20
```

If the bug is in a view/template layer (UI render, layout, data binding, styling) — mark the view path `[→MANUAL]` and test the logic layer backing it (ViewModel, Presenter, helper) instead. If there is no logic layer to test, the fix is `[→MANUAL]` only — note what to visually verify.

If you cannot identify a specific `[GAP]` path → the hypothesis is not specific enough. Investigate further.

If the bug is in a dependency/config/data (not project code), say so before proceeding.

---

## Test Command

Resolve once before running tests. Check in order:
1. `scripts/build-test.sh` exists in project root → `bash scripts/build-test.sh`
2. `~/.claude/scripts/build-test.sh` exists (global install) → `bash ~/.claude/scripts/build-test.sh`
3. Auto-detect from project markers:

| Marker | Run all | Run filtered |
|--------|---------|-------------|
| vitest config / vitest in package.json | `npx vitest run` | `npx vitest run -t "<pattern>"` |
| jest config / jest in package.json | `npx jest --no-cache` | `npx jest --no-cache -t "<pattern>"` |
| pyproject.toml / pytest.ini | `python3 -m pytest -x` | `python3 -m pytest -x -k "<pattern>"` |
| Cargo.toml | `cargo test` | `cargo test "<pattern>"` |
| go.mod | `go test ./...` | `go test ./... -run "<pattern>"` |
| build.gradle | `./gradlew test` | `./gradlew test --tests "<pattern>"` |
| *.sln | `dotnet test` | `dotnet test --filter "<pattern>"` |
| Package.swift | `swift test` | `swift test --filter "<pattern>"` |
| Gemfile | `bundle exec rspec` | `bundle exec rspec -e "<pattern>"` |

All test commands below use `TEST_CMD` to mean the resolved command. For filtered runs, append `--filter "<pattern>"` (build-test.sh) or use the framework's native filter flag from the table above.

---

## Phase 1: Write a Failing Test

**REGRESSION RULE:** If the bug exists because the diff changed existing behavior AND no test covered that path → this is a regression. A regression test is a **CRITICAL requirement.** Add the comment: `// Regression: <bug> — <file:line> broke this path`

Write a test that reproduces the bug. It **MUST fail** with current code.

Run it (filtered):
```
TEST_CMD --filter "<test name>"
```

- **FAILS** → reproduced. Continue.
- **PASSES** → hypothesis may be wrong. Use `AskUserQuestion`:

```json
{
  "questions": [
    {
      "question": "The test passes with current code — the bug isn't reproduced yet. How to proceed?",
      "header": "Test Passes Unexpectedly",
      "multiSelect": false,
      "options": [
        {"label": "Provide different repro steps or environment details (human: ~30m / CC: ~5m) | Completeness: 10/10"},
        {"label": "The bug may be environment-specific — describe the setup (human: ~1h / CC: ~10m) | Completeness: 9/10"},
        {"label": "Skip test-first for this bug — fix directly (human: ~15m / CC: ~5m) | Completeness: 5/10"}
      ]
    }
  ]
}
```

**3-strike rule:** If 3 hypotheses all fail to reproduce the bug → STOP. Use AskUserQuestion:
"3 hypotheses tested, none confirmed. This may be architectural — not a simple bug."
Options: A) New hypothesis (describe new evidence), B) Escalate for human review, C) Instrument the area and catch it next time

---

## Phase 2: Fix

Make the **minimal change** needed.

| Do | Don't |
|----|-------|
| Fix the specific bug | Refactor surrounding code |
| Add a guard for the edge case | Rewrite the function |
| Explain what and why before editing | Silently change code |

**Blast radius check:** If the fix requires touching >5 files → stop and use AskUserQuestion before editing anything:
"This fix touches N files — that's a large blast radius for a bug fix. A) Proceed — root cause genuinely spans these files, B) Split — fix critical path now, defer the rest, C) Rethink — there may be a more targeted approach"

---

## Phase 3: Verify

1. Run the bug test: `TEST_CMD --filter "<test name>"` → must PASS.
2. Run full suite: `TEST_CMD` → no regressions.

If other tests break → the fix caused a regression. Investigate. Do NOT weaken existing tests.

---

## Phase 4: Root Cause Analysis

After fixing, document:

```
Symptom: <what the user saw>
Root cause: <why it happened>
Gap: <why not caught earlier — missing test? wrong assumption? missing spec?>
Prevention: <suggest one: type constraint, validation, lint rule, spec update (including acceptance scenarios)>
```

This is non-optional for serious bugs. For trivial bugs, the fix summary is enough.

---

## Phase 5: Summary

```
DEBUG REPORT
════════════════════════════════════════
Bug:             <description>
Hypothesis:      <what you predicted> → <confirmed or actual cause>
Root cause:      <what was actually wrong>
Files changed:   [all production files touched]
Fix:             <file:line — what changed>
Evidence:        <test output>
Regression test: <file:test name>
Full suite:      All passing ✓
Manual needed:   [→MANUAL gaps, or "none"]
Status:          DONE | DONE_WITH_CONCERNS | BLOCKED
════════════════════════════════════════
```

### Spec Update Signal

After fixing, check these conditions. If ANY is true → **must** signal.

**Signal when (MUST):**

| # | Condition |
|---|-----------|
| S1 | Fix covers an edge case or error path with no corresponding AS in the spec |
| S2 | Bug existed because an AS described wrong behavior — After fix, code and AS now conflict |
| S3 | Fix adds a new constraint or guard (null check, balance guard, validation) not in spec |

**Do not signal when:**
- Fix is a clear typo/off-by-one — code was always wrong relative to spec, no new behavior
- Performance-only fix — output unchanged

**Signal format:**
```
⚠️ Spec Update Needed — run `/mf-plan docs/specs/<feature>/<feature>.md '<describe change>'`
Reason: [S1 | S2 | S3] — <one line: what is missing or mismatched>
```

## Multiple Bugs

If `$ARGUMENTS` describes multiple bugs: triage by severity, fix one at a time, commit each separately.

## Rules
1. **Investigate before coding.** Root cause hypothesis before test. Evidence before fix.
2. **Minimal fix.** One bug, one change. Don't improve the neighborhood.
3. **Never weaken tests.** If existing tests break, the fix is wrong.
4. **Ask before touching production code** if unsure.
5. **One bug, one commit.** Each fix independently revertable.

**Red flags — slow down if you see these:**
- "Quick fix for now" — there is no "for now". Fix it right or escalate.
- Proposing a fix before tracing data flow — you're guessing, not debugging.
- Each fix reveals a new problem elsewhere — wrong layer, not wrong code.
- Never say "this should fix it" — verify and prove it. Run the tests.
