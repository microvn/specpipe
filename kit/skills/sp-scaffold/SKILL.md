---
description: |
  Greenfield bootstrap — turn a decided app-type + tech stack into a RUNNABLE walking
  skeleton plus canonical docs (ARCHITECTURE.md, ADRs, optional DESIGN.md), before any
  feature spec or TDD. Generator-first (real pinned deps, no hallucinated packages),
  gated on a green smoke test (`install → build → start`), structured core/modules/tests.
  Use when asked to "scaffold the project", "khởi tạo dự án", "set up the codebase",
  "bootstrap a new app", "dựng nền dự án", "init the repo", "start a new project from scratch",
  "create the project skeleton", or after /sp-explore confirms a greenfield build.
  Proactively invoke this (do NOT hand-write project files) when the target directory has
  no runnable project yet (no package.json / pyproject.toml / Cargo.toml / go.mod, empty src)
  and the user wants to start building — sp-build assumes a runnable harness exists; this is
  what creates it.
  Hands off to /sp-plan (first feature spec) → /sp-build. Skip if a runnable project already
  exists — go straight to /sp-plan.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion, Agent, WebSearch
---
Greenfield bootstrap — decided stack → runnable walking skeleton + canonical docs, before any spec.

This skill exists because the rest of the kit assumes a runnable codebase: `/sp-build`'s TDD loop needs a resolvable `TEST_CMD` and an app to import, which an empty repo does not have. Folding "set up the project" into the first story (as a hand-written foundation) is the failure this fixes — scaffolding is infrastructure, not behaviour, so it lives here, not in a spec.

**Pipeline:** `/sp-explore` (greenfield branch — decides app-type + stack) → **`/sp-scaffold`** (this) → `/sp-plan` (first feature spec) → `/sp-build`.

**The one success metric:** not "files generated" — **"it builds and a smoke test passes."** A scaffold that doesn't run is worse than none; the gate in Phase 3 is non-negotiable.

---

## Phase 0 — Precondition & input

1. **Greenfield check (idempotent).** Look for an existing runnable project in the target dir: any of `package.json`, `pyproject.toml` / `requirements.txt`, `Cargo.toml`, `go.mod`, `build.gradle`, `*.sln`, `Package.swift`, `Gemfile`, or a non-empty `src/`.
   - Found AND it builds → **wrong tool.** Stop: "A project already exists here — run `/sp-plan` to spec the next feature, then `/sp-build`." Do not re-scaffold.
   - Found but partial/broken (e.g. a `package.json` but no installable tree) → treat as a **resume**: finish the skeleton and drive Phase 3 to green; do not blow away existing files without asking.
   - Empty / docs-only → normal greenfield, continue.

2. **Resolve the bootstrap brief.** This skill needs: **app-type**, **stack** (with one-line rationale per major choice), preferred **scaffold command**, and the **smoke-test command**.
   - From `/sp-explore` greenfield branch → read its bootstrap brief (in `docs/explore/<feature>.md` or `$ARGUMENTS`).
   - Missing or invoked standalone → gather it in Phase 1. Never silently default the stack.

3. **Resume protocol (partial / half-scaffolded repo).** If 0.1 found a partial tree, do NOT blindly run the generator over it — Phase 2 generator-first assumes an empty dir; `create-*` onto existing files either refuses or clobbers. Instead:
   - **Detect** which of {manifest, lockfile, src skeleton, test runner, canonical docs} already exist and whether they install/build.
   - **Usable generated base exists** → skip generation; go straight to imposing structure (Phase 2.3), filling gaps, then the Phase 3 gate.
   - **Unusable AND the user confirms it's throwaway** → generate into a clean temp dir, then move in — **asking before overwriting any non-empty file you did not create this run**.
   - **Never delete or overwrite a user file silently.** On any doubt, list what you'd change and ask. A wrong clobber destroys work — treat it as a destructive action.

---

## Phase 1 — App-type & stack (DECLARED, never silently defaulted)

The field's honest ceiling is "LLM reads + asks", not a signal classifier — so confirm, don't guess.

1. **App-type** — classify into one of: `web-frontend` · `backend-API` · `full-stack` · `mobile` (iOS/Android/RN/Flutter) · `desktop` (native: Swift/macOS, C++/Qt, C#/WinUI — or web-wrapped: Electron/Tauri) · `CLI` · `library` — with `monorepo` as an orthogonal modifier (can co-occur). If the brief already pins it, confirm in one line. If ambiguous, ask the disambiguating questions (each collapses branches):
   - "Install from an app store, or open in a browser?" (mobile vs web)
   - "Something people *use*, or something other devs *import*?" (app vs library)
   - "Run by typing commands, or opening a window?" (CLI vs GUI)
   - "Server/login/DB behind it, or all on-device?" (full-stack vs frontend-only)

2. **Stack — research current versions, propose, then confirm (never silently default).**
   **Research first (WebSearch):** training memory of versions and "current best practice" goes stale — before proposing, search the *current* stable/LTS releases + current best practice for the candidate area, using the current year from `date +%Y` (never a hardcoded year). The default + rationale must reflect what you find, not cutoff memory. **If a `/sp-explore` Bootstrap Brief already pinned the stack, research happened upstream — trust it and skip re-searching.**
   Then decide along the axes below; for each pick a default WITH a one-line rationale, then confirm before scaffolding. "Use whatever" is not an answer — pin it; every downstream file depends on it. Each major choice's rationale becomes one ADR (Phase 4). If the brief already pinned the stack with rationale, skip the matrix + question — just confirm in one line.

   **Stack-decision axes** (resolve each that applies to the app-type):

   | Axis | Default heuristic |
   |---|---|
   | Language / runtime | The app-type's mainstream: TS for web/node, Python for data/ML, Go/Rust for CLI/perf, Swift/Kotlin or RN/Flutter for mobile. |
   | Framework | Prefer one with an official scaffolder (Reference table) over a hand-rolled setup. |
   | Datastore (if any) | Postgres for relational by default; justify anything exotic. |
   | Repo shape | Single package unless the app genuinely has ≥2 deployable units → then monorepo + a workspace tool. |
   | Test runner | The framework's blessed runner (this resolves `TEST_CMD` for sp-build). |
   | Architecture conventions | State mgmt · validation · data layer · forms · UI · API/response shape — the patterns the example module will demonstrate. Source them from a stack profile (see **Stack profiles** note below) or the project's house conventions; else research current best-practice. |

   **Confirmation question** — sp-scaffold is self-contained; do not depend on reading another skill for the format:
   ```json
   {"questions":[{"question":"Proposed stack: <one-line summary>. RECOMMENDATION: <X> because <reason>. Confirm or change?","header":"Stack","multiSelect":false,"options":[
     {"label":"Confirm — <stack> | Completeness: N/10 | Trade-off: <gain vs lose>"},
     {"label":"Change — I'll specify"}]}]}
   ```

3. **Resolve the scaffold command + smoke command** for the confirmed stack (see Reference table). Prefer an official generator over freeform.

**Stack profiles (optional, LAYERED — they must survive kit upgrades).** A profile is a reusable opinion-as-data file naming a stack's library/pattern defaults. The kit installs globally, so the profile *store* lives OUTSIDE the skill bundle; look up in precedence order, first found = the starting suggestion:
1. **Project** — `./.claude/stack-profiles/<stack>.md` (or the project's CLAUDE.md house-conventions). Wins for this repo.
2. **User / global** — `~/.claude/stack-profiles/<stack>.md`. Your personal cross-project defaults; survives `devkit upgrade`.
3. **Kit seed** — the bundled `references/stack-profiles/<stack>.md`. Examples/fallback only.

A profile is only a suggestion: verify its currency (it carries a date), and the **Bootstrap Brief always overrides it**. The kit-bundled seeds are OVERWRITTEN on `devkit upgrade` — to customize, **copy** a seed to `~/.claude/stack-profiles/` (global) or `./.claude/stack-profiles/` (this project); never hand-edit the bundled copy.

---

## Phase 2 — Skeleton (generator-first)

**Generator-first, always when one exists.** An official `create-*` / framework CLI / `degit` template gives a guaranteed-buildable base with **real, pinned** dependencies — eliminating the highest-risk LLM failure (a non-runnable base wired to hallucinated packages; ~1 in 5 LLM-suggested packages don't exist, and the fake names repeat, so attackers pre-register them).

**Monorepo (≥2 packages)? Orchestrate root-first — generators are NOT workspace-aware.** Running a per-package generator blind will fight the workspace. Sequence:
- Write the **root** manifest + workspace file (`package.json` + `pnpm-workspace.yaml` / equivalent) FIRST.
- Run each package generator with **install skipped** (`--skip-install` or equivalent) into its package dir.
- **De-conflict generator output:** generators often drop their OWN nested workspace file, lockfile, or `.git` inside the package (e.g. `create-next-app` writes a nested `pnpm-workspace.yaml`; generators `git init`). Remove/hoist them — a nested workspace file silently breaks resolution; a nested `.git` makes a repo-in-repo.
- Then ONE install at the root (single lockfile).

A single-package project skips all this — generate, install, done.

1. **Run the generator** (Reference table) — *only into an empty/clean dir*. Use its `@latest` / current invocation; if unsure of the generator's current name or flags, WebSearch it — `create-*` tools get renamed and deprecated (e.g. CRA). If Phase 0.3 flagged a partial repo, follow the resume protocol there first; never run `create-*` over existing files. Let the generator own dependency selection + lockfile. **Version drift:** if the Brief pinned a major (e.g. "Next 15") but `@latest` has moved past it, do NOT silently diverge — pin the generator to the brief's major, OR surface the drift in one line and record it as an ADR. Don't let `@latest` quietly override a declared stack.
2. **Freeform only as fallback** (no blessed template for the stack). Then, before any install, **sanity-check that each proposed dependency actually exists** in the registry (Reference §dep-verify). This is a minimum guard against hallucinated / typosquatted *names* — NOT a supply-chain audit: an existing name can still be a typosquat, unmaintained, or malicious, and the check does nothing for transitive deps. When supply-chain safety matters, defer to the lockfile + a real audit (`npm audit` / `pip-audit` / `cargo audit`). Pin versions; commit the lockfile.
3. **Impose the two-layer structure** (core + features under ONE root, siblings) on the generated base — read the ARCHITECTURE codemap (`references/ARCHITECTURE.md.tmpl` §4); it defines the principle, the per-language mechanism, and the anti-pattern to avoid:
   - **Core layer** — reusable foundation (entrypoint/bootstrap, config/env, IO plumbing, DI, errors, logging, shared utils/types). Feature-independent.
   - **Feature layer** — one self-contained unit per capability; the scale axis. **Seed exactly ONE example unit that DEMONSTRATES the architecture conventions** (from the Brief): the thinnest end-to-end slice through the real pattern — e.g. React → data call via the chosen data layer (React Query) → input validated by Zod → render; backend → one endpoint through the chosen validation + response envelope; native → one use-case through the chosen architecture (a guarded op behind a repository protocol). NOT an empty stub: this is the *pattern template* every sp-build story copies. Still ONE slice — thin, not a feature. **Native GUI app whose GUI target is deferred (Phase 3):** also seed a **headless composition root** (a small CLI/executable that wires core + feature) so `build`/`test` prove the wiring without the IDE; the GUI `@main` belongs to the deferred GUI target.
   - **Map the two layers onto the stack's unit of modularity** — directories (JS), packages/targets (Swift SPM, Go, C#/Java), crates/modules (Rust). Keep core + features **siblings under one discoverable root**; never bury the real code deep inside a wrapper dir, and never split into disconnected top-level trees (a `core/` package next to a separate `app/` tree is the §4 anti-pattern — put the app/GUI target in the same package/solution at root).
   - **tests — follow the §4 test rule** in the language-idiomatic location (JS co-located sibling, ONE suffix, never mix `.spec`/`.test`; Swift `Tests/` mirror; Go/Rust inline; integration separate; e2e its own package).
   - A **test-only package** (e.g. an e2e package) has no core/feature shape — its trivial seed is one hermetic passing test (no running servers), scaffolded freeform if no non-interactive generator exists (verify deps per 2.2).
4. **`.env.example`** with every config/secret key (no real values). No secret in client-shipped code.

Keep the skeleton minimal — it's a walking skeleton, not the app. One thin end-to-end path, not features.

---

## Phase 3 — Smoke-test gate *(non-negotiable)*

The skeleton is not done until it **runs**. Drive, in order:

1. **install** — dependencies resolve and install clean.
2. **build / typecheck** — compiles (`tsc --noEmit`, `cargo check`, `go build`, `swift build`, etc.).
3. **prove it runs** — demonstrate liveness the way THIS app-type requires (a server "boots" is not a library "imports" — don't conflate them). There MUST be at least one real, passing test so `TEST_CMD` resolves — this is exactly what unblocks `/sp-build`'s Phase 0b foundation gate.

**Smoke contract — what "green" means per app-type** (resolve to the one that fits):

| App-type | "Runs" = | TEST_CMD anchor |
|---|---|---|
| backend-API / full-stack BE | server boots AND a health/route request returns 2xx, then **shut it down** | ≥1 passing route/unit test |
| web-frontend | production build succeeds AND dev server reaches "ready" within a timeout, then stop it | ≥1 passing component/unit test |
| CLI | binary builds AND runs `--help` (or a no-op) exiting 0 | ≥1 passing test |
| library | builds/packages AND a sample consumer imports the public entry | ≥1 passing public-API test |
| mobile | JS/Flutter layer builds AND bundler / `flutter test` passes (native shell build best-effort — note if skipped) | ≥1 passing test |
| desktop | build succeeds AND the app launches headless OR the runner passes | ≥1 passing test |

For anything long-running (servers, dev servers, bundlers): use a **readiness signal + hard timeout + guaranteed teardown**. A smoke check that hangs or leaks a process is a FAILED gate, not a pass.

**Monorepo:** run the smoke for EVERY package (each per its own app-type row above) AND the aggregate run-all (`pnpm -r test` / workspace equivalent). "Green" = every package green AND the aggregate green; record both the per-package and the root `TEST_CMD`.

**Native desktop (Swift/Qt/WinUI):** these usually have TWO build systems — a **headless testable core** and an **IDE/toolchain-bound GUI target**. Gate the smoke on the core (build + `swift test`/`ctest`/`dotnet test` GREEN); treat the GUI target as **best-effort** — defer + note it if there's no non-interactive build path (e.g. no committed `.xcodeproj` and no `xcodegen`). Never block the gate on the GUI target, and never fake it green.

Record the resolved **`TEST_CMD`** (run-all + filtered) and the run command in the handoff (Phase 5) and in ARCHITECTURE §13.

- **Green** → proceed to Phase 4.
- **Not green after 3 attempts** → STOP, report **BLOCKED** with the raw failure output. Do NOT hand off a skeleton that doesn't run, and do NOT paper over it by deleting the failing check. A non-running scaffold is the failure this skill exists to prevent.

> Success here = "builds + smoke passes", never "files generated". A green light is the only handoff condition.

---

## Phase 4 — Canonical docs (thin + true)

Fill the templates in `references/`. At bootstrap the docs describe the **skeleton honestly** — not a hallucinated full system. They thicken as `/sp-build` adds stories.

| Doc | Template | Seed at bootstrap |
|---|---|---|
| `ARCHITECTURE.md` | `ARCHITECTURE.md.tmpl` | §1 quality goal + §2 scope from the brief; §4 Codemap = the core/modules layout just created + the test-split rule; §5 data model if any; **§7 Invariants** = the system invariants you already know (these become `INV-NNN` in specs, with `applies-to:` surfaces — the cross-surface test discipline); §12 ADRs (below); §13 run/deploy = the verified commands from Phase 3. |
| `docs/adr/NNNN-*.md` | `adr/NNNN-template.md` | One ADR per major stack choice (language, framework, datastore, auth transport, sync-vs-async). ADR-0001 = "Record architecture decisions". While ≤~6, they may live inline in ARCHITECTURE §12 instead. The stack *rationale* lives here, not in §1. |
| `DESIGN.md` | `DESIGN.md.tmpl` | OPTIONAL — only if the initial system design is non-trivial/contested. Per-feature forward-looking design is normally written later, alongside its spec. |

Do not over-document an empty repo. A greenfield ARCHITECTURE.md is short and honest; that's correct, not lazy.

---

## Phase 5 — Hygiene & handoff

1. **Secret/safety scan** (reuse `/sp-commit` discipline): no hardcoded secret; `.gitignore` excludes `.env`, `*.pem`, `*.key`, build dirs, `node_modules`/vendor; `.env.example` present and committed.
2. **Initial commit** (if the user wants one): conventional `chore: scaffold <stack> walking skeleton`.
3. **Handoff summary:**
   - App-type + confirmed stack.
   - Skeleton layout (core / modules / tests) — one line.
   - **Smoke-test gate: PASS** + the resolved `TEST_CMD` and run command.
   - Docs written (ARCHITECTURE / ADRs / DESIGN?).
   - Next: "Run `/sp-plan <feature>` for the first feature spec, then `/sp-build`. `/sp-build`'s Phase 0b will re-verify the harness."

---

## Reference — generators & dependency verification

**Scaffold command by stack** — covers the common ~80%. Prefer the official generator over freeform; **resolve `@latest` and confirm the command name at run time** (several moved recently — see the caveat below). Stacks marked *(freeform)* have NO official generator → write minimal files yourself and verify deps (below).

| App-type | Stack | Generator (+ non-interactive hint) |
|---|---|---|
| Web FE | React | `npm create vite@latest <app> -- --template react-ts` |
| Web FE | Next.js | `npx create-next-app@latest <app> --ts --app --yes` |
| Web FE | Vue | `npm create vue@latest <app>` (flags `--router --typescript`) |
| Web FE | SvelteKit | `npx sv create <app>` *(was `create-svelte`)* |
| Web FE | Angular | `ng new <app> --defaults --skip-git` |
| Web FE | Astro | `npm create astro@latest <app> -- --template minimal --yes` |
| Backend | NestJS | `npx @nestjs/cli new <app> --skip-git --package-manager npm` |
| Backend | Django | `django-admin startproject <name>` (no prompts) |
| Backend | Spring Boot | `curl https://start.spring.io/starter.zip -d dependencies=web -d type=maven-project -o app.zip` |
| Backend | Rails | `rails new <app> --api -d postgresql --skip-git` |
| Backend | Laravel | `laravel new <app> --no-interaction` |
| Backend | .NET | `dotnet new webapi -n <Name>` |
| Backend | FastAPI / Go | *(freeform)* — `uv init` + `fastapi` / `go mod init <mod>` + layout |
| Full-stack | Nuxt | `npx nuxi@latest init <app>` |
| Full-stack | React Router 7 | `npx create-react-router@latest <app>` *(was `create-remix`)* |
| Full-stack | T3 | `npm create t3-app@latest <app> -- --CI` |
| Mobile | Expo (RN) | `npx create-expo-app@latest <app> --template blank-typescript` |
| Mobile | bare RN | `npx @react-native-community/cli@latest init <App>` *(not `react-native init`)* |
| Mobile | Flutter | `flutter create <app> --org com.example` |
| Desktop | Electron | `npx create-electron-app@latest <app> --template=vite-typescript` |
| Desktop | Tauri | `npm create tauri-app@latest -- --template react-ts --yes` |
| Desktop | native (Swift/Qt/WinUI) | *(freeform core + IDE GUI)* — `swift package init` / CMake / `dotnet new wpf`; GUI via Xcode/XcodeGen — see the Native-desktop smoke note (Phase 3) |
| CLI | Node / Go / Rust / Python | oclif `npx oclif generate <cli>` · Go `cobra-cli init` · Rust `cargo new <cli>` · Python `uv init` + `typer` |
| Library | npm / Python / Rust / Go / .NET | `npm init -y` · `uv init --lib` (or `poetry new`) · `cargo new --lib` · `go mod init` · `dotnet new classlib` |
| any (no blessed gen) | template | `degit <template-repo>`, then verify deps |

**Recently changed — VERIFY before trusting:** CRA is dead (use Vite/Next); SvelteKit `create-svelte` → `sv create`; Remix → React Router 7 (`create-react-router`); bare RN → `@react-native-community/cli init`; Laravel installer preferred over `composer create-project`; RedwoodJS split (RedwoodSDK vs winding-down Redwood GraphQL). If a stack isn't listed, WebSearch its current official generator.

**Dependency existence check (freeform mode only — generators already pin real deps):** an existence *sanity-check*, NOT a supply-chain audit (Phase 2.2). Confirm each proposed package resolves before install:

| Manager | Check | Gotcha |
|---|---|---|
| npm / pnpm | `npm view <pkg> version` / `pnpm view <pkg> version` | missing → `E404`, exit 1 |
| yarn (Berry) | `yarn npm info <pkg>` | plain `yarn info` reports the project tree, not the registry |
| PyPI | `curl -fsSL https://pypi.org/pypi/<pkg>/json` | missing → 404 (cheaper than `pip index`) |
| cargo | `curl -fsSL https://crates.io/api/v1/crates/<name>` | **NOT `cargo search`** (fuzzy/substring); API 404 = absent |
| Go | `go list -m <module>@<ver>` | proxy lookup; new tags lag minutes; private → `GOPRIVATE` |
| SPM / any Git-URL | `git ls-remote <url> <tag>` | **exit 0 even if the ref is absent → check stdout is non-empty**; no registry |
| Maven / Gradle | `curl -fsSL https://repo1.maven.org/maven2/<grp/path>/<artifact>/<ver>/` | group dots → slashes; 404 = absent |
| NuGet | `dotnet package search <id> --exact-match` | id must be lowercased for the raw API |
| RubyGems | `gem list -r -e <name>` | `-r` remote, `-e` exact |
| Composer | `composer show <pkg> --all` | Packagist p2 holds tagged releases only (dev-only → 404) |

A package that doesn't resolve is dropped, not guessed at. Pin versions; commit the lockfile. (Caveat: existence ≠ safety — a registered typosquat still resolves; for supply-chain safety use the lockfile + `npm/pip/cargo audit`.)

---

## Rules

1. **Runnable or BLOCKED.** Never hand off a skeleton that fails the Phase 3 smoke gate. "Files generated" is not done.
2. **Generator-first.** Use the blessed scaffolder when it exists; freeform only as fallback, and then verify every dependency exists.
3. **Stack is declared.** Confirm app-type + stack explicitly; never silently default and never bury the rationale.
4. **Structure by principle.** core (foundation) vs modules (scale axis) vs co-located tests — adapt names to the stack, don't copy one blindly.
5. **Docs thin + true.** Describe the skeleton honestly; let it thicken with stories. Stack rationale → ADRs; shape + invariants → ARCHITECTURE.
6. **Scaffolding is not behaviour.** This skill writes no acceptance scenarios and runs no TDD loop — that's `/sp-plan` + `/sp-build`. It only makes the harness those need exist.
