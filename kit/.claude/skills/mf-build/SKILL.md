---
description: TDD delivery loop — write failing tests from spec, implement story by story, drive to GREEN
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
---
TDD delivery loop — write failing tests from spec AS, implement story by story, drive to GREEN.

## Phase 0: Build Context

1. **Find what changed:**
   ```
   BASE=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||') || BASE="main"
   git diff --name-only "$BASE"...HEAD
   ```
   If `$ARGUMENTS` provided → scope to that file or feature only.
   If no changes → "No source changes found. Specify a file or feature."

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

4. **Locate related code:** If `codebase-memory-mcp` is connected, prefer `search_code` to find all files touching this feature, `trace_call_path` to understand the dependency chain, and `get_architecture` to check if the feature belongs to a sensitive layer — indexed search and call graph visibility more reliable than ad-hoc grep. Fallback: Grep for the main function/type names in the changed files.

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

Rule: If writing additional tests costs `CC: ≤15m` — write them fully without asking. Only use AskUserQuestion when the gap affects design or costs `CC: >30m`.

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

**Fast path:** All paths already covered → "Coverage Map: All paths covered ✓" → proceed to Phase 2.

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

---

## Phase 2: Story Loop (RED → GREEN → REFACTOR)

Work through stories one at a time from the spec's `## Stories` section.
Follow the project's existing test patterns.

**For each story:**

### Step 1 — RED: Write test, verify it fails

Write tests for the story's acceptance scenarios.

Run the new tests (filtered):
```
TEST_CMD --filter "<story test name>"
```

- **FAILS** → correct. The test describes behavior that doesn't exist yet. Continue to Step 2.
- **PASSES** → the behavior already exists. Either the test is wrong (assertions too weak) or the code already handles this case. Investigate before continuing. If already covered, mark story `done` and move to the next story.

### Step 2 — GREEN: Implement minimal production code

Write the minimum production code needed to make the failing tests pass. No more, no less.

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

**NEVER:**
- Fix production code without asking
- Delete or weaken existing tests
- Add `skip`/`xit`/`@disabled` to hide failures
- Use mocks solely to avoid a real failure

---

## Phase 5: Summary

Start with one of:
- **DONE** — All stories green, implementation risks addressed, no signal needed.
- **DONE_WITH_CONCERNS** — Green but: [P2 risks from Phase 0.5 / coverage gaps / spec signal]
- **BLOCKED** — Cannot proceed: [what's blocking, what was tried, 3-attempt limit hit]
- **NEEDS_CONTEXT** — Missing info to continue: [what's needed and why]

```
Tests: X added, Y modified, Z unchanged
Result: All passing ✓ / N failing ✗
Coverage: [critical uncovered paths if any]
Files changed: [production files touched]
Files tested: [test files touched]
Stories: [AS-001 ✓, AS-002 ✓, AS-005 new]
TDD evidence: [S-001: RED(3 fails) → GREEN ✓, S-002: RED(2 fails) → GREEN ✓]
E2E needed: [→E2E gaps from Coverage Map, or "none"]
Eval needed: [→EVAL gaps from Coverage Map, or "none"]
Manual needed: [→MANUAL gaps from Coverage Map, or "none"]
```

**Progress file cleanup:**
- All stories done → delete `docs/specs/<feature>/.build-progress`
- Stories still remaining → leave file in place. Log: "Progress saved — resume with `/mf-build`"

### Spec Update Signal

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
