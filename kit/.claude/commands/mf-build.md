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
4. **Read existing tests** for the changed files — find patterns, fixtures, naming conventions. Don't duplicate.

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

---

## Phase 2: Write Tests

Follow the project's existing test patterns. If using `$ARGUMENTS` as a filter, use `--filter` when running:
```
bash scripts/build-test.sh --filter "$ARGUMENTS"
```

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
        {"label": "Fix production code — the test is correct"},
        {"label": "Adjust the test — the code behavior is intentional"}
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
```

If behavior changed: "Consider updating the spec in docs/specs/<feature>/<feature>.md."

### Spec Gap Detection

If a test fails due to an edge case, error path, or boundary condition that is NOT covered by any existing AS in the spec:

1. State explicitly: **"This failure suggests a missing acceptance scenario."**
2. Describe the gap: what behavior was tested, which story it belongs to, why no AS covers it.
3. Prompt: **"Run `/mf-plan <spec-path> 'Add AS for <description>'` to add the missing scenario, then re-run `/mf-build`."**

Do not silently fix the test and move on. A test that has no corresponding AS means the spec is incomplete — the spec must be updated first.

## Rules
1. **Behavior over implementation.** Test what code DOES, not how.
2. **Independent tests.** Each test sets up its own state, cleans up after.
3. **Spec stays upstream.** If a test reveals a spec gap, update the spec before adding the test.
