These are the always-on operating rules for working in this repository with specpipe.
On Claude Code the guardrails are also enforced by blocking hooks; on every agent this
whole document is an always-on rule you must self-enforce.

## Spec-first cycle

Every change follows: **SPEC (with acceptance scenarios) → CODE + TESTS → BUILD PASS**.

- Specs live in `docs/specs/<feature>/<feature>.md`; acceptance scenarios (Given/When/Then)
  are embedded under `## Stories`.
- Never write code before the spec exists. Never auto-modify a spec from code.
- The spec is the source of truth — if code contradicts it, the code is wrong.

## Workflow

| Trigger | Commands |
|---------|----------|
| New project (no codebase yet) | `/sp-explore` → `/sp-scaffold` → `/sp-plan` → `/sp-build` |
| Feature unclear / complex | `/sp-explore` → `/sp-plan` |
| New feature | `/sp-plan` → `/sp-challenge` (optional) → code in chunks → `/sp-build` each chunk |
| Update feature | `/sp-plan <spec-path> "changes"` → code → `/sp-build` (do NOT hand-edit the spec first) |
| Bug (complex/outage) | `/sp-investigate "<bug>"` → `/sp-fix <investigation-file>` |
| Bug fix | `/sp-fix "<bug>"` (test-first: failing test → fix → green) |
| Remove feature | `/sp-plan <spec-path> "remove stories"` → delete code + tests → build pass |
| Pre-merge check | `/sp-review` |
| Commit | `/sp-commit` (secret scan + conventional message) |
| Render spec / markdown as HTML | `/sp-spec-render <feature>` · `/sp-md-render <file.md>` |
| Multi-LLM review / humanize | `/sp-voices [target]` · `/sp-humanize [text]` |

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
- Dates in filenames: `$(date +%Y-%m-%d)` — never guess dates.
- Specs: kebab-case feature dir `docs/specs/<feature>/<feature>.md` (2–3 words, no prefix).
- Never `git push --force` to `main`/`master`; never commit `.env`, certs, or keys.
- Self-review before finishing: tests pass, no secrets, no debug code, matches the spec.

## Forbidden

- `any`/`Any` without a justifying comment; force unwrap/cast without a preceding guard.
- Hardcoded secrets, API keys, tokens, or credentials in source.
- Mocks or fake data used solely to pass tests.
- Editing generated files, vendor dirs, or lock files; ignoring compiler/linter warnings.
- Replacing real code with placeholder comments; renaming params to `_param` to dodge
  unused-warnings instead of fixing them.
- Reading/writing `.env`, `.pem`, `.key`, or other sensitive files (use `.env.example`).

## Project Info

> Auto-detected on install; verify and edit if wrong.

- **Language:** [CUSTOMIZE]
- **Test framework:** [CUSTOMIZE]
- **Source directory:** [CUSTOMIZE]
- **Test directory:** [CUSTOMIZE]
