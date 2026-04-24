# Project Rules

## Spec-First Development

Every change follows this cycle: **SPEC (with acceptance scenarios) → CODE + TESTS → BUILD PASS**.

- Business logic specs live in `docs/specs/<feature>/<feature>.md`
- Acceptance scenarios (Given/When/Then) are embedded in the spec under `## Stories`
- Never write code before the spec exists. Never auto-modify specs from code.
- Specs are the source of truth. If code contradicts the spec, the code is wrong.

## Workflow Quick Reference

| Trigger | Commands | Details |
|---------|----------|---------|
| Feature unclear / complex | `/mf-explore` → `/mf-plan` | Clarify requirements before writing spec |
| New feature | `/mf-plan` → `/mf-challenge` (optional) → code in chunks → `/mf-build` each chunk | Start with spec or description |
| Update feature | `/mf-plan <spec-path> "changes"` → code → `/mf-build` | Do NOT manually edit spec before /mf-plan |
| Bug (complex/outage) | `/mf-investigate "description"` → `/mf-fix <investigation-file>` | OPTIONAL: diagnose root cause + blast radius before fixing |
| Bug fix | `/mf-fix "description"` | Test-first: write failing test → fix → green |
| Remove feature | `/mf-plan <spec-path> "remove stories"` → delete code + tests → build pass | /mf-plan handles snapshot before removal |
| Pre-merge check | `/mf-review` | Diff-based quality gate |
| Commit changes | `/mf-commit` | Secret scan + conventional commit |
| Multi-LLM review | `/mf-voices [target]` | Send material to 2–3 LLMs, synthesize consensus + disagreements |

For detailed workflow steps, templates, and decision trees, see `docs/WORKFLOW.md`.

## Testing

- **Run tests:** `bash scripts/build-test.sh [--filter PATTERN]` (per-project) or `bash ~/.claude/scripts/build-test.sh [--filter PATTERN]` (global). Use whichever exists.
- **Auto-detects:** Swift, Node, Python, Rust, Go, Java, C#, Ruby
- **Compile/typecheck BEFORE running tests.** Catch syntax errors early.
- **Max 3 fix loops** for test failures. If tests still fail after 3 attempts, stop and report.
- **NEVER fix production code** to make a test pass — ask the user first.
- **No mocks, fakes, stubs, or cheats** to pass builds. Real implementations only.
  Test doubles are acceptable only when they replace external services (APIs, databases)
  that cannot run locally.

## Project Info

> Fill these in when setting up the project (or let `setup.sh` do it automatically).

- **Language:** [CUSTOMIZE]
- **Test framework:** [CUSTOMIZE]
- **Source directory:** [CUSTOMIZE]
- **Test directory:** [CUSTOMIZE]

## Conventions

- **Commits:** Conventional format — `type(scope): description`
  Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `build`, `ci`
- **File naming:** Descriptive enough that AI tools understand the purpose from the path alone.
  Prefer kebab-case for new files (e.g., `user-authentication-service.ts`).
- **Dates in filenames:** Use `$(date +%Y-%m-%d)` — never guess dates.
- **Spec naming:**
  - kebab-case, lowercase: `user-auth/user-auth.md`, `file-sync/file-sync.md`
  - Feature name, not module name: `user-auth/` not `AuthService/`
  - Each feature gets its own directory: `docs/specs/<feature>/<feature>.md`
  - Short (2-3 words): `payment-flow/` not `payment-processing-with-stripe-integration/`
  - No prefix/suffix: `user-auth.md` not `spec-user-auth.md`

## Forbidden

These patterns are never acceptable in this project:

- `any` / `Any` type without explicit justification in a comment
- Force unwrap (`!`) or force cast (`as!`) without a preceding guard
- Hardcoded secrets, API keys, tokens, or credentials in source files
- Mocks or fake data used solely to make tests pass
- `git push --force` to main or master branches
- Editing generated files, vendor directories, or lock files
- Committing `.env` files, certificates, or private keys
- Ignoring compiler/linter warnings without documented reason
- Replacing real code with placeholder comments like `// ... existing code ...`
- Renaming parameters to `_param` instead of actually fixing unused parameter issues
- Reading or writing `.env`, `.pem`, `.key`, or other sensitive files (use `.env.example` for templates)
