<p align="center">
  <img src="docs/cover.svg" alt="Specpipe — spec-first toolkit for AI coding agents" width="100%">
</p>

<h1 align="center">Specpipe</h1>

<p align="center">
  <b>One spec-first workflow, installed into every AI coding agent you use.</b>
</p>

<p align="center">
  <a href="https://specpipe.vercel.app"><b>Live demo&nbsp;→</b></a>
</p>

Specpipe installs a disciplined loop — **spec → code + tests → build pass** — as native skills, guard hooks, and project rules. You author it once; it lands in whichever agent you run (Claude Code, Codex, Cursor, Antigravity, OpenClaw, Hermes). Switch agents, keep the same `/sp-*` commands.

```bash
npx specpipe init        # interactive picker — choose agents, skills, guards
```

---

## Why

AI agents write code fast and drift fast — they invent requirements, test the wrong things, and quietly break what worked. Specpipe fixes the loop, not the model:

- **The spec is the source of truth.** Acceptance scenarios (Given/When/Then) live inside the spec; if code contradicts it, the code is wrong. No separate test plan to fall out of sync.
- **Tests check behavior, not guesses.** They come from the spec, so they survive refactors.
- **Guardrails are enforced, not suggested.** Hooks stop an agent from reading secrets or crawling `node_modules` *before* it happens.
- **Learn it once.** The same commands and discipline work in every agent.

You don't have to be a developer to feel it: describe a feature in plain language, the agent turns it into a spec you can read, builds against it, and proves it with tests — every step reviewable.

---

## Quick start

```bash
npx specpipe init        # interactive: scope (project/global), agents, skills, guards
npx specpipe init -y     # non-interactive defaults: this project, Claude, all skills + guards
```

Then open your agent (`claude`, `codex`, `cursor`, …) and run the loop. The transcript below is on Claude Code with a Swift project; the same commands and output work in every agent.

**1 — Spec it (`/sp-plan`)**

```text
You: /sp-plan "add tag filter to the todo list screen"

Agent → running /sp-plan
  Phase 0: Codebase scan — found docs/specs/todo-list/todo-list.md (exists)
  Phase 1: Scope Challenge — TodoList already has text search; the tag filter
           can reuse the same query pipeline. Flagging: reuse vs rebuild.

  "Extend existing search, or add a separate tag filter UI?"
    A) Extend search       — one input, parsed (text + "tag:work")   [lowest cost]
    B) Separate tag chips  — chips below the search box              [clearer UX]
    C) Both                — chips drive the same query              [most work]
You: B

Agent: Drafting spec… docs/specs/todo-list/todo-list.md (Mode C update, snapshot created)
  ### S-007: Filter todos by tag (P0)
    AS-014: Given todos tagged [work, home], when user taps "work" chip,
            then only work-tagged todos show.
    AS-015: Given no todos match, when filter applied, then empty state shows.
  Not in Scope: saving favorite tag combinations (deferred).
```

**2 — Build it (`/sp-build`)** — TDD loop: coverage map → write the missing test → build green.

```text
  Phase 1.5: Coverage Map
    applyTagFilter(selected:)
      ├── [★ TESTED] empty selection → returns all
      ├── [GAP]      no-match empty state            (← AS-015)
      └── [★ TESTED] multi-tag AND semantics
  Writing test for [GAP]… building… ✓ 14 tests passed (3 new, 0 regressions)
```

**3 — Fix a bug (`/sp-fix`)** — failing test first, then the one-line fix, then green.

```text
You: /sp-fix "selecting two tags shows OR results, should be AND"
  [BUG] predicate uses .contains(anyOf:) — should be .contains(allOf:)
  failing test → change .anyOf → .allOf (TodoRepository.swift:88) → suite green
```

**4 — Review + commit (`/sp-review` → `/sp-commit`)** — failure-mode grid, then a secret-scanned conventional commit.

```text
  Verdict: APPROVE
  feat(todo): filter list by selected tags with AND semantics
  ✓ commit a1b2c3d (not pushed — run `git push` when ready)
```

The CLI auto-detected the stack (Swift + XCTest) — no config touched. For a risky spec, run `/sp-challenge` between steps 1 and 2; it spawns hostile reviewers that quote the spec and propose surgical edits.

---

## Supported agents

A skill is authored once and **emitted into each agent's native format** — the markdown body is identical; only the location, frontmatter, and hook config change.

| Agent | Skills | Rules | Enforced guards |
|-------|--------|-------|-----------------|
| **Claude Code** | `.claude/skills/` | `.claude/CLAUDE.md` | `.claude/settings.json` — all five |
| **Codex CLI** | `.agents/skills/` | `AGENTS.md` | `.codex/hooks.json` — shell |
| **Cursor** | `.cursor/skills/` | `.cursor/rules/*.mdc` | `.cursor/hooks.json` — shell + read + file |
| **Antigravity** | `.agents/skills/` | `.agents/rules/` | `.agents/hooks.json` — shell |
| **OpenClaw** | `skills/` | `SPECPIPE-RULES.md` | advisory rules |
| **Hermes** | `~/.hermes/skills/` (global only) | `SPECPIPE-RULES.md` | advisory rules |

Guards run as **blocking hooks** wherever the agent exposes a pre-tool-call hook — they deny a tool call before it runs. Each agent enforces only the guards its hook system supports; most hook Claude-specific tool events:

| Guard | Stops | Claude | Cursor | Codex | Antigravity |
|---|---|:--:|:--:|:--:|:--:|
| **shell** | crawling `node_modules`/build dirs, reading `.env`/keys in a command | ✓ | ✓ | ✓ | ✓ |
| **read** | the agent reading a secret file | ✓ | ✓ | — | — |
| **file** | *(advisory)* warns when a source file grows too large | ✓ | ✓ | — | — |
| **comment / glob** | placeholder-comment edits, repo-wide broad globs | ✓ | — | — | — |

A guard an agent can't hook still reaches it as an **advisory rule** in that agent's rules file, so the intent travels everywhere; OpenClaw and Hermes (no blocking hooks) get all guards that way. Skills that lean on Claude-only tools degrade gracefully with a short "running outside Claude Code" note. Details: [docs/multi-agent.md](docs/multi-agent.md).

---

## What gets installed

Each agent gets its own paths; the Claude layout, as an example:

```
your-project/
├── .specpipe/manifest.json   ← tracks every installed file per agent (drives upgrade/remove)
├── .claude/
│   ├── CLAUDE.md             ← rules hub: spec-first cycle + guardrails + auto-detected stack
│   ├── settings.json         ← hook wiring
│   ├── hooks/                ← shell, read, comment, glob, file guards
│   └── skills/sp-*/          ← the 13 skills
└── docs/specs/<feature>/     ← your specs + snapshots (created by the skills)
```

Other agents add their own dirs (`.agents/`, `.cursor/`, `.codex/`) and a shared `AGENTS.md`. `remove` cleans it all up; `remove --agents <list>` drops one agent and keeps shared files the others need. Your `CLAUDE.md` content and `docs/` are always preserved.

> **GraphAtlas (optional):** with [GraphAtlas](https://github.com/microvn/graphatlas) connected as an MCP server, six skills prefer it over `grep` for call-graph and blast-radius analysis — 100% local, no LLM. Skills fall back to `grep` when it's absent; nothing breaks.

---

## Commands

Thirteen slash commands. Full per-skill behaviour (phases, rules, outputs) lives in **[docs/commands.md](docs/commands.md)**.

| Command | What it does | Tokens |
|---------|--------------|--------|
| [`/sp-explore`](docs/commands.md#sp-explore--feature-discovery-as-client-technical-lead) | Feature discovery as a Client Technical Lead — read-only Q&A before planning | 10–20k |
| [`/sp-scaffold`](docs/commands.md#sp-scaffold--greenfield-project-bootstrap) | Greenfield bootstrap to a runnable, smoke-gated skeleton | 15–40k + build |
| [`/sp-plan`](docs/commands.md#sp-plan--generate-spec-with-acceptance-scenarios) | Generate / update a spec with acceptance scenarios (Given/When/Then) | 20–40k |
| [`/sp-challenge`](docs/commands.md#sp-challenge--adversarial-plan-review) | Adversarial spec review by parallel hostile reviewers | 15–30k |
| [`/sp-build`](docs/commands.md#sp-build--tdd-delivery-loop) | TDD delivery loop — coverage map → tests → build green | 5–10k |
| [`/sp-investigate`](docs/commands.md#sp-investigate--read-only-root-cause-investigation-optional) | Read-only root-cause investigation (optional, before fix) | 8–15k |
| [`/sp-fix`](docs/commands.md#sp-fix--test-first-bug-fix) | Test-first bug fix — failing test → minimal fix → green | 3–5k |
| [`/sp-review`](docs/commands.md#sp-review--pre-merge-quality-gate) | Pre-merge quality gate with smart focus + failure-mode grid | 10–20k |
| [`/sp-voices`](docs/commands.md#sp-voices--multi-llm-review-optional) | Multi-LLM review panel (optional second opinion) | 10–30k + API |
| [`/sp-commit`](docs/commands.md#sp-commit--smart-git-commit) | Smart conventional commit with secret + debug-code scan | 2–4k |
| [`/sp-spec-render`](docs/commands.md#sp-spec-render--render-spec-as-html-view) | Render a spec as a standalone HTML view | 3–8k |
| [`/sp-md-render`](docs/commands.md#sp-md-render--render-any-markdown-as-html-view) | Render any long-form markdown as an HTML view | 3–8k |
| [`/sp-humanize`](docs/commands.md#sp-humanize--rephrase-to-human-voice) | Rephrase a plan/draft into natural, send-ready text | 2–6k |

---

## Workflows

The four-step loop above is the **new feature** flow. Variants:

- **Greenfield** (empty repo): `/sp-explore` (decides app-type + stack) → `/sp-scaffold` (runnable, smoke-gated skeleton) → the feature loop.
- **Update a feature:** `/sp-plan docs/specs/<feature>/<feature>.md "what's changing"` — never hand-edit the spec; Mode C snapshots → diffs → applies. Then `/sp-build` → `/sp-review` → `/sp-commit`.
- **Bug fix:** `/sp-fix "the bug"` (failing test → minimal fix → green). For a murky bug, run `/sp-investigate` first — read-only hypothesis + blast radius.
- **Fuzzy requirements:** `/sp-explore "feature"` runs a one-topic-at-a-time Q&A and `/sp-plan` picks up its notes automatically.

---

## CLI reference

```bash
npx specpipe init . --agents cursor,codex   # install for specific agents (a list, or `all`)
npx specpipe init . --skills core           # skip optional render/humanize skills (or a comma list)
npx specpipe init . --hooks none            # skills only, no guardrails (or --hooks shell,read)
npx specpipe init --global --agents claude,codex   # install skills globally for chosen agents

npx specpipe check | diff | list            # update available? · what changed? · installed status
npx specpipe upgrade                        # smart upgrade, preserves files you customized (--force overwrites)
npx specpipe remove [--agents <list>] [--dry-run]   # uninstall (keeps your CLAUDE.md content + docs/)
```

**Requirements:** a supported agent CLI, Git, Node.js 18+, Bash 4+, and your project's own toolchain. No dependencies are added to your project.

**Global install** puts each agent's skills in its user-level dir (`~/.claude/skills/`, `~/.codex/skills/`, `~/.cursor/skills/`, `~/.gemini/antigravity-cli/skills/`, `~/.openclaw/skills/`, `~/.hermes/skills/`), so every project is covered. Per-project skills take precedence; Hermes is global-only; global hooks are Claude-only. The lifecycle remembers your skill selection — `upgrade` won't resurrect ones you deselected.

After install, check the **Project Info** in `.claude/CLAUDE.md` and fix anything auto-detection missed. Per-skill behavior is tunable via env vars — see [docs/customization.md](docs/customization.md).

---

## Docs

| Doc | What's in it |
|-----|--------------|
| [multi-agent.md](docs/multi-agent.md) | How one skill emits into every agent's native format (verified path/format matrix) |
| [commands.md](docs/commands.md) | Full per-skill reference — phases, rules, outputs, token cost |
| [hooks.md](docs/hooks.md) | The guards — triggers, what each blocks, config, manual testing |
| [spec-format.md](docs/spec-format.md) | Spec template, AS depth by priority, snapshots, naming |
| [customization.md](docs/customization.md) | Environment variables, extending rules, custom skills |
| [troubleshooting.md](docs/troubleshooting.md) · [faq.md](docs/faq.md) | Hooks not firing, tests not detected, specs for tiny changes, … |
| [architecture.md](docs/architecture.md) · [adding-an-agent.md](docs/adding-an-agent.md) | CLI internals; how to add a new agent |

---

Issues and PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Security: [SECURITY.md](SECURITY.md). License: [MIT](LICENSE) © Microvn
