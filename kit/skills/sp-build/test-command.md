# test-command.md — resolving TEST_CMD / E2E_CMD (shared)

**Who reads this:** everyone who runs tests — the **controller** (Foundation Gate marker check in `controller-prep.md`, and the gates in `gates.md`), the **dispatched subagent** (to run its story's filtered tests), and the **inline builder**. It is its own file precisely because all three need it; keeping one copy avoids the drift a duplicated command table would cause.

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

All test commands use `TEST_CMD` to mean the resolved command. For filtered runs, use the framework's native filter flag from the table above.

**E2E runner (separate from the unit/integration `TEST_CMD`).** A flow tagged `[→E2E]` runs on the project's E2E harness, NOT the unit runner — resolve it from project markers and call it `E2E_CMD`: Playwright (`playwright.config.*` → `npx playwright test`), Cypress (`cypress.config.*` → `npx cypress run`), Detox / Maestro (mobile), or the e2e package's own script (`pnpm --filter e2e test`). E2E lives in its own package/dir with its own config (per the test-layout rule). If a critical flow needs E2E and no E2E harness exists, that's a scaffold gap → report it (`/sp-scaffold` sets up the e2e package); do NOT silently downgrade a payment/auth/data-destruction flow to a mocked unit test.

**Filter pattern verification (MANDATORY before trusting a filtered run):**

A filtered run that matches zero tests will exit 0 on many frameworks — that is a false green. Before trusting any `TEST_CMD --filter "<pattern>"` result, confirm the pattern matched ≥1 test case:

- vitest: `npx vitest list -t "<pattern>"` → output must list ≥1 test
- jest: add `--passWithNoTests=false` → exits 1 if no tests match
- pytest: `-k "<pattern>" --collect-only -q` → output must list ≥1 test
- cargo: `cargo test "<pattern>" -- --list` → output must list ≥1 test
- go: `go test -run "<pattern>" -list ".*" ./...` → output must list ≥1 test
- gradle / dotnet / swift / rspec / other: if no equivalent listing command is known, fall back to verifying by `grep -r "<test name>" <test-dir>` — the test string must exist in source. Log `FILTER_VERIFY: fallback-grep` in the summary.

If the verification shows 0 matches → the test you just wrote did not register (wrong name, wrong file location, framework did not pick it up). Fix before proceeding. Do NOT interpret 0-match as "PASSES". **Max 3 retry attempts** on filter-match failure; if still 0 after 3, stop and report BLOCKED (test infrastructure issue, not a TDD issue).
