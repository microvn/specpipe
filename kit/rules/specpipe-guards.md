These are the always-on operating rules for working in this repository with specpipe.
On Claude Code the guardrails are enforced by hooks; on other agents this whole document
is an always-on rule you must self-enforce.

## Spec-first cycle

Every change follows: **SPEC (with acceptance scenarios) → CODE + TESTS → BUILD PASS**.

- Specs live in `docs/specs/<feature>/<feature>.md`; acceptance scenarios (Given/When/Then)
  are embedded under `## Stories`.
- Never write code before the spec exists. Never auto-modify a spec from code.
- The spec is the source of truth — if code contradicts it, the code is wrong.

## Guardrails

- **Don't explore large directories.** Never grep/list/read inside `node_modules/`,
  build/dist artifacts, or `.git/` internals — scope to specific paths.
- **Never touch secrets.** Do not read or write `.env*`, private keys, credentials, or
  token stores. Respect any `.agentignore` patterns.
- **Never drop real code.** Don't replace implementation with placeholder comments like
  `// ... existing code ...`. Reproduce the full code when editing.
- **Avoid broad globs.** No `**/*.ts` at the project root; scope globs to a directory.
- **Keep files focused.** Don't let a source file grow past a few hundred lines — split.

## Testing

- Run the project's native test command (`npx vitest run`, `pytest`, `cargo test`,
  `go test ./...`, `swift test`, …). Compile/typecheck before running tests.
- Max 3 fix loops on a failure, then stop and report.
- **Never edit production code to make a test pass** — ask first.
- No mocks/fakes/stubs to pass builds; real implementations only. Test doubles are for
  external services (APIs, DBs) that can't run locally.

## Conventions

- Commits: conventional — `type(scope): description` (`feat`, `fix`, `docs`, `refactor`,
  `test`, `chore`, `perf`, `build`, `ci`).
- File names: kebab-case, descriptive enough to understand purpose from the path.
- Never `git push --force` to `main`/`master`; never commit `.env`, certs, or keys.
- Self-review before finishing: tests pass, no secrets, no debug code, matches the spec.
