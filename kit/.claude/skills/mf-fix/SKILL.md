---
description: |
  Test-first bug fix — write failing test, fix code, verify green.
  Iron Law: never fix without finding root cause first.
  Use when asked to "fix this bug", "fix bug", "sửa lỗi", "sửa bug",
  "this is broken", "cái này hỏng", or when user reports a reproducible
  bug with repro steps or a stack trace.
  Proactively invoke this skill (do NOT patch directly) when the user
  describes a bug they want fixed.
  For complex/ambiguous bugs (outage, regression, "it was working yesterday",
  data corruption), start with /mf-investigate first, then hand the report to /mf-fix.
  Skip for typos or one-line obvious fixes.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion, mcp__graphatlas__*
---
Test-first bug fix — write failing test, fix code, verify green.

Bug: $ARGUMENTS

---

## Iron Law

**NEVER fix without finding the root cause first.**

Fixing symptoms creates whack-a-mole debugging. Every fix that doesn't address the root cause makes the next bug harder to find.

---

## Phase 0a — Graphatlas probe (run once)

Before locating code, probe whether graphatlas (GA) is connected:

1. Call `mcp__graphatlas__ga_architecture` with `max_modules: 1`.
2. Interpret:
   - Returns `modules` → **GA available.** Use `ga_*` for code discovery, blast-radius, and risk. Grep is fallback only.
   - Error `STALE_INDEX` → call `mcp__graphatlas__ga_reindex` (mode `"full"`), retry once, then treat as available.
   - Tool not found / connection error / any other failure → **GA unavailable.** Use grep/glob throughout this run. Do not re-probe.
3. After edits the graph goes stale. Reindex on demand: when a later `ga_*` call returns `STALE_INDEX`, call `mcp__graphatlas__ga_reindex` (mode `"full"`) once then retry. Don't reindex preemptively after every edit.

---

## Phase 0: Investigate

Don't jump to code. Understand the bug first:

0. **Investigation handoff check.** If `$ARGUMENTS` references a file under `docs/investigate/`, read it first — it contains pre-built root cause hypothesis, blast radius, and recommended actions from `/mf-investigate`. Skip redundant discovery; jump to Phase 1 using its findings. If no such file and the bug is complex/ambiguous/production-critical → suggest the user run `/mf-investigate "<bug>"` first; otherwise proceed.

1. **Parse the report.** Symptom? Expected vs actual? Repro steps? If context is missing → ask ONE question via AskUserQuestion before proceeding.
2. **Locate the code.** **If GA available (per Phase 0a):** `ga_symbols("<function or type>")` → definitions; `ga_callers` + `ga_callees` on the resolved symbol → call graph; `ga_impact(symbol=...)` → blast radius + affected tests + risk in one shot; `ga_file_summary` before reading a file in full. **If GA unavailable or the query is free text** (error strings inside literals, log lines): grep.
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

> **If GA available, lean on it for steps 2 and 4.** `ga_symbols` resolves names, `ga_callers`/`ga_callees` map the call graph, `ga_impact` returns blast radius + test gaps + risk, `ga_architecture` reveals which module/layer (auth, payment, core) the bug sits in, `ga_risk` scores whether a change here is safe. If GA is unavailable, fall back to grep + `git log` + manual reading.

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

Resolve once before running tests. Auto-detect from project markers:

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

All test commands below use `TEST_CMD` to mean the resolved command. For filtered runs, use the framework's native filter flag from the table above.

**Filter pattern verification (MANDATORY):** A filter matching 0 tests exits 0 on many frameworks — false green. Before trusting any filtered run, confirm match count ≥1:

- vitest: `npx vitest list -t "<pattern>"`
- jest: add `--passWithNoTests=false`
- pytest: `-k "<pattern>" --collect-only -q`
- cargo: `cargo test "<pattern>" -- --list`
- go: `go test -run "<pattern>" -list ".*" ./...`
- gradle / dotnet / swift / rspec / other: if no equivalent listing command is known, fall back to `grep -r "<test name>" <test-dir>` — string must exist. Log `FILTER_VERIFY: fallback-grep` in Phase 5 report.

0 matches → test name / file location wrong. Fix before proceeding. Never interpret 0-match as PASS. **Max 3 retry attempts** on filter-match failure; if still 0 after 3, stop and report BLOCKED.

---

## Phase 1: Write a Failing Test

**REGRESSION RULE:** If the bug exists because the diff changed existing behavior AND no test covered that path → this is a regression. A regression test is a **CRITICAL requirement.** Add the comment: `// Regression: <bug> — <file:line> broke this path`

Write a test that reproduces the bug. It **MUST fail** with current code.

Verify filter match first (see "Filter pattern verification" in the Test Command section). Then run:
```
TEST_CMD --filter "<test name>"
```

**Capture the raw failure output** (stack trace / assertion diff). Paste it into the Phase 5 DEBUG REPORT `Evidence:` field verbatim — a summary like "test fails" is not evidence.

- **FAILS** → reproduced. Continue.
- **0 TESTS MATCHED** → filter/test name issue, not reproduction. Fix before proceeding.
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
        {"label": "Stop and report BLOCKED — cannot reproduce, need human investigation (Completeness: N/A — no fix applied)"}
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

**Similar-risk scan (MANDATORY after fix, before Phase 3):** Grep for the same pattern that caused this bug, scoped to:
1. The same file as the fix (all sibling functions in the fixed file).
2. Direct callers of the fixed function (one level up — if GA available, `ga_callers`; otherwise grep or IDE refs).

Do NOT auto-fix findings — the minimal-fix rule stands. Record each under Phase 5 `SIMILAR_RISK:` as `<file:line> — same pattern, unguarded`.

**Timebox:** 5 minutes max. If the pattern is too generic to grep cleanly (e.g., fix is a common idiom), record `SIMILAR_RISK: scan skipped — pattern too generic, reason: <why>` and move on. Do NOT let this phase block the fix from landing. Silent skipping without a reason note is not acceptable.

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
Evidence:        <paste raw failing-then-passing test output, verbatim>
Regression test: <file:test name>
Full suite:      All passing ✓
Similar risk:    [SIMILAR_RISK findings from Phase 2 scan, or "none"]
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
