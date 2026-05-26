---
description: |
  TDD delivery loop — write failing tests from spec, implement story by story,
  drive to GREEN. One story → red → green → next story.
  Use when asked to "build this", "implement the spec", "code the feature",
  "triển khai", "làm tính năng", "code theo spec", or "TDD this".
  Proactively invoke this skill (do NOT write code directly) when the user has
  a spec ready in docs/specs/ and wants it implemented, or asks to start coding
  a planned feature.
  Requires a spec from /mf-plan or equivalent — if no spec exists, run /mf-plan
  first instead of jumping into code.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion, mcp__graphatlas__*
---
TDD delivery loop — write failing tests from spec AS, implement story by story, drive to GREEN.

## Phase 0a — Graphatlas probe (run once)

Before Phase 0:

1. Call `mcp__graphatlas__ga_architecture` with `max_modules: 1`.
2. Interpret:
   - Returns `modules` → **GA available.** Use `ga_*` for locate / call-graph / impact below. Grep is fallback.
   - Error `STALE_INDEX` → call `mcp__graphatlas__ga_reindex` (mode `"full"`), retry once, then treat as available.
   - Tool not found / connection error / any other failure → **GA unavailable.** Use grep/glob throughout. Do not re-probe.
3. After each story's GREEN passes and before moving to the next story, call `ga_reindex` so callers/impact queries for subsequent stories reflect the new code. Cheap insurance — skip only if no further `ga_*` queries are planned.

---

## Phase 0: Build Context

1. **Find what changed:**
   ```
   BASE=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||') || BASE="main"
   git diff --name-only "$BASE"...HEAD
   ```
   If `$ARGUMENTS` provided → scope to that file or feature only.
   If no changes → "No source changes found. Specify a file or feature."

   **Regression auto-detect:** List lines removed or modified from existing code (not pure additions):
   ```
   git diff "$BASE"...HEAD -- <src> | grep -E "^-[^-]" | head -50
   ```
   For each modified function identified, evaluate whether behavior changed. Classify each change:
   - **Behavior changed** → regression test REQUIRED covering the old behavior path (see REGRESSION RULE in Phase 1.5).
   - **Pure refactor** (rename, format, extract helper, comment, type-only) → no new test required; add 1-line note in summary `REFACTOR_ONLY: <file:line> — <why no behavior change>`.

   Do not skip this classification silently. If unsure whether a change is behavior-changing, treat it as behavior-changing.

2. **Read the spec** at `docs/specs/<feature>/<feature>.md` — the `## Stories` section with acceptance scenarios is your roadmap. The `## Overview` and `## Constraints` sections tell you the INTENT behind the code.

3. **Check build progress:** Look for `docs/specs/<feature>/.build-progress`.
   - If found → read it, find the first line marked `pending` → resume from that story.
     Log: "Resuming from S-00X (previous session progress found)."
   - If not found → start from S-001 as normal.

   File format:
   ```
   S-001 done
   S-002 done
   S-003 pending
   ```

4. **Locate related code.** **If GA available (per Phase 0a):** `ga_symbols` on the main function/type names from the spec → definitions; `ga_callers`/`ga_callees` → dependency chain; `ga_impact(symbol=...)` → blast radius + affected tests; `ga_architecture` → confirm module/layer (auth, payment, core); `ga_file_summary` before reading a file in full. **If GA unavailable:** grep for the main function/type names in the changed files.

5. **Read existing tests** for the changed files — find patterns, fixtures, naming conventions. Don't duplicate.

---

## Phase 0.5: Implementation Risk Check

Run after Phase 0. Takes 2 minutes. Checks only what is visible at implementation time
(mf-challenge already reviewed the spec adversarially — this catches code-level issues only).

- **N+1:** For each story involving a list/loop — will implementation query DB inside the loop? Flag before writing the test.
- **DRY:** Grep for similar logic in existing code. If found, reuse — don't duplicate.
- **Error paths:** For each story — what can go wrong? (null, empty, network fail, invalid input) Note these upfront so they land in the Coverage Map, not as afterthoughts.
- **Pattern:** What's the existing pattern for this type of operation in the codebase? Follow it unless there's a reason not to.

Output: 2-3 line summary. Feeds into Phase 1.5 Coverage Map.

---

## Phase 0.6: Spec Checklist

Derive a checklist from the spec — each "promise" in this build's scope becomes one line. The checklist mirrors the spec; it does not invent new requirements.

**Sources (all in `docs/specs/<feature>/<feature>.md`):**
- Each noun/field/behavior in the Then clause of each AS → 1 line
- Each item in Constraints → 1 line
- Each Not-in-Scope row (to prevent accidental ticking) → 1 line marked `[N/A]`

**Granularity rule (so two devs produce the same checklist):**
- 1 line per **observable output field** (appears in Then result, independently assertable)
- 1 line per **side effect** (write to DB, emit event, external call)
- 1 line per **error path** declared in a Then clause
- Do NOT split adjectives (sorted/deduped/trimmed) into separate lines — roll them into the field line

Example: Then "returns sorted list of {file, confidence, edges}" → 3 lines (one per field), not 4.

**Stored at:** `docs/specs/<feature>/.build-checklist` (alongside `.build-progress`)

**Format** (owner column resolves multi-story AS):
```
[ ] AS-012.T1 — affected_tests includes convention-matched files     | owner: S-003
[ ] AS-012.T2 — affected_tests includes TESTED_BY edges              | owner: S-003
[ ] AS-012.T3 — output sorted by confidence                          | owner: S-004
[ ] C-003     — query completes under 50ms                           | owner: S-005
[N/A] AS-015  — out of scope (M3)                                    | owner: —
```

Owner = the story in this build planned to cover that line. If an AS spans multiple stories, each line gets its own owner. Use `owner: ?` when unknown upfront, resolve when reaching that story.

**Three checkbox states:**
- `[x]` — done: there is a test assertion AND production code emitting the behavior
- `[~]` — partial: carve-out with a concrete destination (story ID that exists in the plan, OR Known-Gap row in the spec). References like "future work", "later", "TODO.md", "Phase X (does not exist)" are NOT accepted
- `[ ]` — untouched: will be covered by a later story in this build, or out-of-scope already declared

**If checklist already exists** (resume build):
- Re-derive from the current spec. Diff against the old checklist.
- New line in spec, missing from checklist → append `[ ]`
- Line in checklist, no longer in spec → mark `[STALE]` (do not delete — keep audit trail)
- Line present in both BUT Then clause text has changed → reset to `[ ]` with note `RESET: spec text changed <date>`, re-verify. The old `[x]` may be stale — the previous assertion may no longer match.

---

## Phase 1: Decide What to Test

Test behavior, not implementation. If the internals change but behavior stays the same, tests should still pass.

**What NOT to test:**
- Private/internal methods (test through public API)
- Framework behavior (test YOUR handler, not that Express routes work)
- Trivial getters/setters (unless they have validation)
- Implementation details (HOW it works — test WHAT it does)

**Edge cases you MUST test:**
1. **Null/Undefined** input
2. **Empty** arrays/strings
3. **Invalid types** passed
4. **Boundary values** (min/max)
5. **Error paths** (network failures, DB errors)
6. **Race conditions** (concurrent operations)
7. **Large data** (performance with 10k+ items)
8. **Special characters** (Unicode, SQL chars)

**Quality check for each test:**
- Does it test one concept? If it fails, do you know exactly what broke?
- Is it independent? No test depends on another running first.
- Is it deterministic? No random, no time-dependent, no external service calls.
- Does the name describe the scenario? (`returns_error_when_input_is_empty`)

**Completeness Principle:**

AI writes tests significantly faster than humans. When deciding test scope:

| Task type | Human | CC | Compression |
|-----------|-------|----|-------------|
| Boilerplate tests | 2 days | 15 min | ~100x |
| Edge case + error paths | 1 day | 15 min | ~50x |
| Feature | 1 week | 30 min | ~30x |
| Bug fix | 4 hours | 15 min | ~20x |

Rule: Default to writing the complete test set. AskUserQuestion only when the gap genuinely affects design choice (not effort). Do NOT use self-estimated effort as a justification to skip — LLMs under-estimate when motivated to move on.

**Edge Case Compliance Table (MANDATORY per story):**

For each story, fill this table in the Phase 5 summary. Every row must be `✓` or `N/A + reason`. Blank rows are not allowed.

| Edge case | Status | Test name / Reason if N/A |
|-----------|--------|---------------------------|
| Null/Undefined input | | |
| Empty array/string | | |
| Invalid types | | |
| Boundary values | | |
| Error paths | | |
| Race conditions | | |
| Large data | | |
| Special characters | | |

`N/A` is valid only with a 1-line reason (e.g., "N/A — function takes enum, invalid type impossible at type layer"). `N/A — not applicable` with no reason is not accepted.

**Engineering instincts — apply when deciding test scope:**
- **Systems over heroes:** Design tests for a tired dev at 3am, not your best engineer. If a test requires knowing internals to understand, it will fail the wrong person at the worst time.
- **Blast radius instinct:** For each Coverage Map GAP — if this path breaks in prod, how many users/systems are affected? High blast radius → mandatory test, no deferral.
- **Make the change easy, then make the easy change:** If writing a test is hard, the production code is tangled. Refactor structure first (separate commit), then add the test.
- **Reversibility preference:** When two approaches have equal coverage, pick the one easier to delete when behavior changes. Brittle tests are technical debt disguised as coverage.

---

## Phase 1.5: Coverage Map

Before writing tests, trace all paths and draw a diagram to see gaps upfront — not after.

**Step 1 — Trace code paths:** For each changed function/component, follow data through every branch: if/else, switch, guard clause, early return, try/catch, error boundary. Trace into helper functions if they have untested branches.

**Step 2 — Trace user flows:** For multi-step features, trace the user journey. Edge cases: double-click/rapid resubmit, navigate away mid-op, submit stale data (session expired), slow connection, concurrent actions (2 tabs open).

**Step 3 — Draw the diagram:**

```
CODE PATH COVERAGE
===========================
[+] src/services/example.ts
    │
    ├── processX()
    │   ├── [★★★ TESTED] Happy path + error — example.test.ts:42
    │   ├── [GAP]         Network timeout — NO TEST
    │   └── [GAP]         Invalid input — NO TEST
    │
    └── helperY()
        ├── [★★  TESTED] Normal case — example.test.ts:89
        └── [★   TESTED] Smoke check only — example.test.ts:101

USER FLOW COVERAGE
===========================
[+] Checkout flow
    │
    ├── [★★★ TESTED] Complete purchase — checkout.e2e.ts:15
    ├── [GAP] [→E2E] Double-click submit — needs E2E, not unit
    ├── [GAP]         Navigate away mid-op — unit sufficient
    └── [GAP] [→EVAL] Prompt template change — needs eval

─────────────────────────────────
COVERAGE: 3/7 paths tested (43%)
  Code paths: 2/4 (50%)
  User flows: 1/3 (33%)
QUALITY:  ★★★: 1  ★★: 1  ★: 1
GAPS: 4 paths need tests (1 need E2E, 1 need eval)
─────────────────────────────────
```

**Legend:**
- `[★★★ TESTED]` = test covers edge cases AND error paths; include `file:line`
- `[★★  TESTED]` = test covers happy path only; include `file:line`
- `[★   TESTED]` = smoke test / trivial assertion; include `file:line`
- `[GAP]` = no test — **MUST write in Phase 2**
- `[GAP] [→E2E]` = needs E2E test: flow spans 3+ components, auth/payment/data-destruction
- `[→MANUAL]` = Non-testable layer (view, template, styling). Note the visual check needed (e.g., "confirm error banner appears on invalid input"). Always test the logic backing it.
- `[GAP] [→EVAL]` = needs eval: prompt template or LLM output changed. When flagged: define capability + regression evals before implementing, run baseline and capture failure signatures, implement minimum passing change, re-run and report pass@1 and pass@3. Release-critical paths should target pass@3 stability before merge.

**E2E Decision Matrix:**

| Use E2E `[→E2E]` when | Use unit test when |
|---|---|
| Flow spans 3+ components/services | Pure function, clear inputs/outputs |
| Mocking hides real failures (API→queue→worker→DB) | Internal helper, no side effects |
| Auth / payment / data destruction | Single-function edge case (null, empty) |

**Testability Classification — classify by what the code does, not what framework it uses:**

| Code category | Examples | Strategy | Tag |
|---|---|---|---|
| Logic | Service, ViewModel, Presenter, Utils, Parser, Validator | Unit test directly — inputs, outputs, state transitions | (default) |
| View / Template | UI render, layout, data binding, template markup | Extract logic to testable layer; mark view code `[→MANUAL]` | `[→MANUAL]` |
| Pure presentation | Styling, spacing, animation, theming | Visual verification only | `[→MANUAL]` |
| Glue / Wiring | Dependency injection, route registration, config binding | Test through integration or E2E | `[→E2E]` or skip |

Rule: If a view/template contains conditional logic (if/else, loops with filtering, computed display values) — extract that logic into the testable layer (ViewModel, Presenter, helper) and unit test there. The view becomes a thin binding with no logic to test.

**Diagram is mandatory.** Even when all paths are covered, you must still produce the diagram with `[★★★ TESTED]` / `[★★ TESTED]` / `[★ TESTED]` entries including `file:line` references for each. Do not replace it with "All paths covered ✓". The diagram is the evidence — a one-line claim is not.

If every path is already covered, the diagram will have zero `[GAP]` rows — that is fine. Write it anyway and proceed to Phase 2.

**REGRESSION RULE:** If the diff changes existing behavior AND no test covers that path → a regression test is a **CRITICAL requirement. No asking. No skipping.**

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

**Filter pattern verification (MANDATORY before trusting a filtered run):**

A filtered run that matches zero tests will exit 0 on many frameworks — that is a false green. Before trusting any `TEST_CMD --filter "<pattern>"` result, confirm the pattern matched ≥1 test case:

- vitest: `npx vitest list -t "<pattern>"` → output must list ≥1 test
- jest: add `--passWithNoTests=false` → exits 1 if no tests match
- pytest: `-k "<pattern>" --collect-only -q` → output must list ≥1 test
- cargo: `cargo test "<pattern>" -- --list` → output must list ≥1 test
- go: `go test -run "<pattern>" -list ".*" ./...` → output must list ≥1 test
- gradle / dotnet / swift / rspec / other: if no equivalent listing command is known, fall back to verifying by `grep -r "<test name>" <test-dir>` — the test string must exist in source. Log `FILTER_VERIFY: fallback-grep` in the summary.

If the verification shows 0 matches → the test you just wrote did not register (wrong name, wrong file location, framework did not pick it up). Fix before proceeding. Do NOT interpret 0-match as "PASSES". **Max 3 retry attempts** on filter-match failure; if still 0 after 3, stop and report BLOCKED (test infrastructure issue, not a TDD issue).

---

## Phase 2: Story Loop (RED → GREEN → REFACTOR)

Work through stories one at a time from the spec's `## Stories` section.
Follow the project's existing test patterns.

**For each story:**

### Step 1 — RED: Write test, verify it fails

Write tests for the story's acceptance scenarios.

First, verify the filter pattern matches the new test (see "Filter pattern verification" in the Test Command section). Then run:
```
TEST_CMD --filter "<story test name>"
```

**Capture and paste the raw failure output** (stack trace / assertion diff / first 20 lines) into your notes — this is the evidence for the `RED → GREEN` claim in Phase 5. A summary like "3 fails" without the raw text is not sufficient evidence.

- **FAILS** → correct. The test describes behavior that doesn't exist yet. Continue to Step 2.
- **PASSES** → the behavior already exists. Either the test is wrong (assertions too weak) or the code already handles this case. Investigate before continuing. If already covered, mark story `done` and move to the next story.
- **0 TESTS MATCHED** → filter pattern did not register. Fix test name / file location. Do NOT proceed.

### Step 2 — GREEN: Implement minimal production code

Write the minimum production code needed to make the failing tests pass. No more, no less.

> **TDD GREEN vs "NEVER fix production code" (Phase 4) — disambiguation:**
> - Writing NEW production code to satisfy a NEW failing TDD test: **REQUIRED** (this is GREEN).
> - Modifying EXISTING production code because an EXISTING test started failing in Phase 3/4: **requires AskUserQuestion first** (this is the "NEVER" rule).
> The difference is: TDD writes code toward a test written moments ago. Fix Loop touches code that was already green. Don't confuse the two.

Run (filtered):
```
TEST_CMD --filter "<story test name>"
```

- **PASSES** → continue to Step 3.
- **FAILS** → fix production code (not the test). Max 3 attempts, then stop and report per Phase 4.

### Step 3 — REFACTOR (optional)

If the implementation introduced duplication, unclear naming, or violated existing patterns — refactor now while tests are green. Run tests after refactoring to confirm nothing broke.

### Step 4 — Update progress

Mark the story `done` in `.build-progress`:
```bash
# Example after S-002 passes:
# S-001 done
# S-002 done
# S-003 pending
```
Write the full file each time (overwrite, not append) to keep state clean.

**Test count assertion (MANDATORY):** Confirm tests were actually added by diff-counting:
```
git diff --stat <test-dir>
```
Record for the Phase 5 summary: `S-00X added N tests: <list exact test names>`. Test names must be grep-able in the test file.

- **N ≥ 1** → normal case. Story is `done`.
- **N = 0** → only acceptable if the story is a pure refactor AND existing tests already cover the changed path. Record: `S-00X added 0 tests: REFACTOR_ONLY — covered by existing <file:test name>`. Otherwise, story is NOT `done` — add tests first.

**Checklist update (MANDATORY):** Open `.build-checklist` and tick the lines this story covers:

```
[x] AS-012.T1 — covered by affected_tests_test.rs:test_convention_match
[~] AS-012.T2 — PARTIAL: query wired, emit deferred → M3 S-008
```
For `[x]`, record `file:test-name`. For `[~]`, record the destination.

**Carve-out scan on the story diff:**
```
git diff <story-files> | grep -nE "TODO|FIXME|XXX|HACK"
```
Each match not already in the checklist → add a new `[~]` line with destination. Matches without a concrete destination → the story is NOT `done`; either (a) create a new story in the plan, or (b) add a Known-Gap row to the spec, before closing.

**Concrete destination** = one of these grep-able sources (priority order):
1. Story ID in `docs/specs/<feature>/<feature>.md` (section `## Stories` — grep `S-NNN` or `M<X> S-NNN`)
2. Row in `<feature>.md` Known-Gaps / Not-in-Scope section
3. Issue tracker ID if the project declares one (GitHub `#NNN`, JIRA `ABC-NNN`) — verify with `gh issue view` or URL regex; no online check required if the author confirms
4. External plan file if the project declares `plan_file: <path>` in CLAUDE.md

Not accepted: TODO.md, free-form code comments, "future work", "later", "Phase X" without a corresponding row.

**If the project does not use a formal spec/plan** (bug fix single story, no /mf-plan): skip the destination rule for this build, replace with a lighter rule "each TODO in diff must have a 1-line justification in the summary" — log in Phase 5 output as `CARVE_OUT_RELAXED: no spec context`.

**Reverse-map check (catch orphans — code exists, spec does not):**

For each "artifact" newly appearing in the story diff (not only TODOs):
- New file under `src/` production (not tests)
- New publicly exported function/class/type
- New DDL/schema object (table/index/enum) — detect in a language-agnostic way by grepping the declarative keywords this project uses
- New public API endpoint / CLI command
- New config key / feature flag

For each artifact → ask: "which checklist line (AS/Constraint) requires this artifact to exist?"

- Maps to ≥1 checklist line → OK
- No mapping → FLAG ORPHAN. Three ways to handle:
  (a) Artifact is genuinely required → add a checklist line sourced from the AS/Constraint that requires it. If no AS requires it → the spec is missing coverage; add a Known-Gap or run `/mf-plan` to add an AS
  (b) Artifact is infrastructure for a later story → convert to `[~] <artifact> — deferred use → <future story/gap>`
  (c) Orphan (legacy/experiment) → remove or justify in the spec

This rule is **language-agnostic**: the dev decides what counts as an "artifact" based on the diff. The skill does not grep DDL or parse ASTs. It only requires "everything new has a documented reason".

**Ordering gate:** tick the checklist BEFORE marking the story `done` in `.build-progress`. If a checklist line with `owner: <this-story>` is not yet ticked or converted to `[~]`/`[N/A]` → story is NOT `done`. One-way sync: progress = f(checklist).

**Then proceed to the next story.**

---

**Before moving to Phase 3, verify:**
- [ ] All public functions have unit tests
- [ ] All API endpoints have integration tests
- [ ] Edge cases covered (null, empty, invalid, boundary)
- [ ] Error paths tested (not just happy path)
- [ ] Tests are independent (no shared state)
- [ ] Assertions are specific and meaningful

---

## Phase 3: Build and Run

This runs the full test suite after all stories are complete. Individual story tests were already verified in Phase 2.

Compile/typecheck first (tsc --noEmit, cargo check, go vet, swift build, etc.).

Then run all tests:
```
TEST_CMD
```

---

## Phase 4: Fix Loop

If tests fail:
1. Read error output. Is the test wrong or the production code wrong?
2. If production code seems wrong → use `AskUserQuestion`:

```json
{
  "questions": [
    {
      "question": "Test expects <X> but code does <Y>. Which is correct?",
      "header": "Test vs Code Mismatch",
      "multiSelect": false,
      "options": [
        {"label": "Fix production code — the test is correct (human: ~30m / CC: ~10m) | Completeness: 10/10"},
        {"label": "Adjust the test — the code behavior is intentional (human: ~10m / CC: ~5m) | Completeness: 7/10"}
      ]
    }
  ]
}
```
3. Fix test code only. Re-run. Max 3 attempts, then stop and report.

**NEVER (applies to Fix Loop — existing tests that regressed; does NOT apply to TDD GREEN in Phase 2):**
- Fix existing production code without asking
- Delete or weaken existing tests
- Add `skip`/`xit`/`@disabled` to hide failures
- Use mocks solely to avoid a real failure

---

## Phase 4.5: Pre-Summary Review

Walk `.build-checklist` before writing the summary. This is in-place verification — it prevents the user from having to re-run the skill just to audit.

**For each line not marked `[x]`:**

1. **`[~]` partial:** verify the destination still exists.
   - Story ID → `grep "<story-id>"` in the plan/spec → must match
   - Known-Gap row → grep in `<feature>.md` → must match
   - No match → FAIL: destination has vanished (moved/deleted), must re-bind before closing the build.

2. **`[ ]` untouched but this build was supposed to cover it** (lines with `owner: S-NNN` belonging to closed stories):
   - This is NOT vague "self-investigation". Concrete evidence is required:
     - Grep the owner story's test file → any assertion matching the Then clause?
     - Grep the owner story's production diff → any code emitting this output?
   - Both absent → the owner story shipped incomplete. **Reopen the story** (revert to `pending` in `.build-progress`), add test+code, OR convert to `[~]` with a concrete destination.
   - A dev may NOT convert `[ ]` → `[~] scope drift` without commit SHA / diff evidence showing the requirement changed mid-build. "scope drift" without evidence = miss.

3. **`[N/A]`** needs no action (declared out-of-scope upfront).

**The output of this phase flows straight into Phase 5 Summary** (see format below).

---

## Phase 5: Summary

Start with one of:
- **DONE** — All stories green, implementation risks addressed, no signal needed, **AND checklist is 100% `[x]` or `[N/A]`**.
- **DONE_WITH_CONCERNS** — Green but: [P2 risks from Phase 0.5 / coverage gaps / spec signal / **any `[~]` carve-outs in checklist**]
- **BLOCKED** — Cannot proceed: [what's blocking, what was tried, 3-attempt limit hit]
- **NEEDS_CONTEXT** — Missing info to continue: [what's needed and why]

```
Tests: X added, Y modified, Z unchanged
Result: All passing ✓ / N failing ✗
Coverage: [critical uncovered paths if any]
Files changed: [production files touched]
Files tested: [test files touched]
Stories: [AS-001 ✓, AS-002 ✓, AS-005 new]
TDD evidence: [S-001: RED (paste 1st failing assertion raw) → GREEN ✓ | tests added: <names>, S-002: RED (raw output) → GREEN ✓ | tests added: <names>]
Checklist: X/Y [x], A/Y [~] (destinations: <story-id list or Known-Gap refs>), B/Y [ ] (reasons), C/Y [N/A]
Edge Case Compliance: [per-story table from Phase 1 — every row ✓ or N/A+reason]
E2E needed: [→E2E gaps from Coverage Map, or "none"]
Eval needed: [→EVAL gaps from Coverage Map, or "none"]
Manual needed: [→MANUAL gaps from Coverage Map, or "none"]
```

**Progress file cleanup:**
- All stories done AND checklist is 100% `[x]`/`[N/A]` → delete `docs/specs/<feature>/.build-progress` and `.build-checklist`
- Stories remaining OR any `[~]` carve-outs → leave both files. Log: "Progress + checklist saved — resume with `/mf-build`"

### Spec Update Signal

**Relationship with Phase 0.6 Checklist:**
- Checklist is an **evidence artifact** (what got done / deferred).
- S1/S2/S3 are **action signals** (user must run `/mf-plan`).
- Both fire when their conditions are met — they do not suppress each other.

Mapping:
- Checklist `[~]` with destination = new Known-Gap row → also fires **S3** (new constraint not yet documented)
- Checklist `[ ]` on a closed owner story, plus any `[STALE]` lines = code drift from spec → fires **S2**
- A new test with no matching AS in the checklist (caught by reverse-map in Phase 2 Step 4) → fires **S1**

The summary must show both the checklist stats AND the signal block — do not merge them.

After every build, check against these conditions. If ANY is true → **must** signal.

**Signal when (MUST):**

| # | Condition |
|---|-----------|
| S1 | A new test covers behavior, edge case, or error path with no corresponding AS in the spec |
| S2 | Code behavior no longer matches the Given/When/Then of an existing AS (spec is stale) |
| S3 | Implementation adds a new constraint or guard not documented in any AS or Constraints section |

**Do not signal when:**
- Pure refactor — behavior unchanged, all existing AS still map correctly
- Performance fix — same output, just faster
- Fix to match spec — code was wrong, spec was right, no new behavior added

**Signal format:**
```
⚠️ Spec Update Needed — run `/mf-plan docs/specs/<feature>/<feature>.md '<describe change>'`
Reason: [S1 | S2 | S3] — <one line: what is missing or mismatched>
```

If S1 applies to a failing test: state **"This failure suggests a missing acceptance scenario."** Describe the gap and prompt to run `/mf-plan` before re-running `/mf-build`. Do not silently add the test without the AS.

## Rules
1. **Behavior over implementation.** Test what code DOES, not how.
2. **Independent tests.** Each test sets up its own state, cleans up after.
3. **Spec stays upstream.** If a test reveals a spec gap (S1), signal and update the spec before adding the test. If code drifts from spec (S2), signal. If new constraint added (S3), signal.
