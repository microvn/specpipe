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

4. **Locate related code:** If `codebase-memory-mcp` is available, use `search_code` to find all files touching this feature, and `trace_call_path` to understand dependency chain before writing tests — faster and more accurate than manual grep. Fallback: Grep for the main function/type names in the changed files.

5. **Read existing tests** for the changed files — find patterns, fixtures, naming conventions. Don't duplicate.

---

## Phase 1: Decide What to Test

Test behavior, not implementation. If the internals change but behavior stays the same, tests should still pass.

**What NOT to test:**
- Private/internal methods (test through public API)
- Framework behavior (test YOUR handler, not that Express routes work)
- Trivial getters/setters (unless they have validation)
- Implementation details (HOW it works — test WHAT it does)

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
- `[GAP] [→EVAL]` = needs eval: prompt template or LLM output changed

**E2E Decision Matrix:**

| Use E2E `[→E2E]` when | Use unit test when |
|---|---|
| Flow spans 3+ components/services | Pure function, clear inputs/outputs |
| Mocking hides real failures (API→queue→worker→DB) | Internal helper, no side effects |
| Auth / payment / data destruction | Single-function edge case (null, empty) |

**Fast path:** All paths already covered → "Coverage Map: All paths covered ✓" → proceed to Phase 2.

**REGRESSION RULE:** If the diff changes existing behavior AND no test covers that path → a regression test is a **CRITICAL requirement. No asking. No skipping.**

---

## Phase 2: Write Tests

Follow the project's existing test patterns. If using `$ARGUMENTS` as a filter, use `--filter` when running:
```
bash scripts/build-test.sh --filter "$ARGUMENTS"
```

---

**After each story's tests pass:** update `.build-progress` — mark that story `done`, next story `pending`:
```bash
# Example after S-002 passes:
# S-001 done
# S-002 done
# S-003 pending
```
Write the full file each time (overwrite, not append) to keep state clean.

---

## Phase 3: Build and Run

Compile/typecheck first (tsc --noEmit, cargo check, go vet, swift build, etc.).

Then run tests:
```
bash scripts/build-test.sh
```

If `scripts/build-test.sh` doesn't exist, detect and run directly:
| Marker | Command |
|--------|---------|
| vitest config / vitest in package.json | `npx vitest run` |
| jest config / jest in package.json | `npx jest --no-cache` |
| pyproject.toml / pytest.ini | `python3 -m pytest -x` |
| Cargo.toml | `cargo test` |
| go.mod | `go test ./...` |
| build.gradle | `./gradlew test` |
| *.sln | `dotnet test` |
| Package.swift | `swift test` |
| Gemfile | `bundle exec rspec` |

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

```
Tests: X added, Y modified, Z unchanged
Result: All passing ✓ / N failing ✗
Coverage: [critical uncovered paths if any]
Files: [test files touched]
Stories: [AS-001 ✓, AS-002 ✓, AS-005 new]
E2E needed: [→E2E gaps from Coverage Map, or "none"]
Eval needed: [→EVAL gaps from Coverage Map, or "none"]
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
