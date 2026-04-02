Write tests from test plan, compile, run, fix until green.

## Phase 0: Build Context

1. **Find what changed:**
   ```
   BASE=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||') || BASE="main"
   git diff --name-only "$BASE"...HEAD
   ```
   If `$ARGUMENTS` provided → scope to that file or feature only.
   If no changes → "No source changes found. Specify a file or feature."

2. **Read the test plan** in `docs/test-plans/` if it exists — this is your roadmap.
3. **Read the spec** in `docs/specs/` if it exists — understand the INTENT behind the code.
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
2. If production code seems wrong → **ASK the user:** "Test expects X but code does Y. Fix production code or adjust test?"
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
Result: All passing ✓
Coverage: [critical uncovered paths if any]
Files: [test files touched]
Plan: [TC-001 ✓, TC-002 ✓, TC-005 new]
```

If behavior changed: "Consider updating the spec in docs/specs/."

## Rules
1. **Behavior over implementation.** Test what code DOES, not how.
2. **Independent tests.** Each test sets up its own state, cleans up after.
