<p align="center">
  <img src="docs/cover.svg" alt="Specpipe — spec-first multi-agent dev toolkit" width="100%">
</p>

<h1 align="center">Specpipe</h1>

<p align="center">
  A lightweight, spec-first development toolkit for agentic AI coding agents.
</p>

<p align="center">
  <a href="https://specpipe.vercel.app"><b>Live demo&nbsp;→</b></a>
</p>

It enforces the cycle **spec (with acceptance scenarios) → code + tests → build pass** through skills, always-on guardrails, and a universal test runner.

**Agents:** [Claude Code](https://claude.ai/code) (full hook enforcement) plus Codex, Cursor, Antigravity, OpenClaw, and Hermes (skills + advisory guard rules). Install for one or all: `specpipe init --agents <list>|all`. See [docs/multi-agent.md](docs/multi-agent.md).
**Works with:** Swift, TypeScript/JavaScript, Python, Rust, Go, Java/Kotlin, C#, Ruby.
**Dependencies:** None (requires only a supported agent CLI, Node.js, Git, and Bash).
**Optional:** [GraphAtlas](https://github.com/microvn/graphatlas) MCP server for graph-based code intelligence — six skills use it automatically when present and fall back to `grep` when it isn't.

---

## Table of Contents

1. [Philosophy](#1-philosophy)
2. [Quick Start](#2-quick-start)
3. [Setup](#3-setup)
4. [Daily Workflows](#4-daily-workflows)
5. [Commands](#5-commands)
6. [Docs & Reference](#6-docs--reference)

---

## 1. Philosophy

### The Core Cycle

```
SPEC (with acceptance scenarios) → CODE + TESTS → BUILD PASS
```

Every code change — feature, fix, or removal — follows this cycle. The spec is the source of truth. Acceptance scenarios (Given/When/Then) are embedded directly in the spec — no separate test plan file. If code contradicts the spec, the code is wrong.

### Why Spec-First?

- **Prevents drift.** Acceptance scenarios live inside the spec — no separate test plan to fall out of sync.
- **Tests have purpose.** Scenarios derived from specs test behavior, not implementation details. This means tests survive refactoring.
- **AI writes better code.** When an agent has a spec with concrete Given/When/Then scenarios, it generates more accurate implementations and more meaningful tests.
- **Reviews are grounded.** Reviewers can check code against the spec rather than guessing at intent.

### Principles

1. **Specs are source of truth** — Code changes require spec updates first.
2. **Incremental, not big-bang** — Test after each code chunk, not after everything is done.
3. **Tests travel with code** — Every PR includes production code + tests + spec updates.
4. **Build pass is the gate** — Nothing merges with failing tests.
5. **Everything in the repo** — Specs, plans, tests, and code are version-controlled and reviewable.

---

## 2. Quick Start

**Time needed: 5 minutes.** Below is a realistic transcript — user input, what each skill actually asks, what it actually outputs. Nothing embellished.

```bash
npx specpipe init .              # install for Claude Code (default)
# or target other agents:
npx specpipe init . --agents cursor,codex
npx specpipe init . --agents all

claude                            # open your agent (claude, codex, cursor, …)
```

> The transcript below is on Claude Code. The same skills install for Codex, Cursor,
> Antigravity, OpenClaw, and Hermes — see [Supported agents](#supported-agents).

### Step 1 — Spec the feature (`/sp-plan`)

```text
You: /sp-plan "add tag filter to the todo list screen"

Agent → running /sp-plan
  Phase 0: Codebase scan — found docs/specs/todo-list/todo-list.md (exists)
  Phase 1: Scope Challenge — TodoList already supports text search; tag
           filter can reuse the same query pipeline. Flagging: reuse vs rebuild.

Multiple-choice: "Extend existing search, or add a separate tag filter UI?"
  A) Extend search       — one input, parsed (text + "tag:work")   [lowest cost]
  B) Separate tag chips  — chips below the search box              [clearer UX]
  C) Both                 — chips drive the same query             [most work]

You: B

Agent: Drafting spec…
  docs/specs/todo-list/todo-list.md  (Mode C update, snapshot created)

  ## Stories (added)
  ### S-007: Filter todos by tag (P0)
    AS-014: Given todos tagged [work, home], when user taps "work" chip,
            then only work-tagged todos show.
    AS-015: Given no todos match the selected tags, when filter applied,
            then empty state shows "No todos match these tags".

  What Already Exists: TodoRepository.query() handles predicates — reuse.
  Not in Scope: saving favorite tag combinations (deferred).
```

> **Complex spec?** Run `/sp-challenge docs/specs/<feature>/<feature>.md` before coding.
> It spawns parallel hostile reviewers (Security Adversary, Failure Mode Analyst,
> Assumption Destroyer, Scope & YAGNI Critic) that quote the spec and propose surgical
> edits — e.g. "AS-014 doesn't define tag case-sensitivity → add constraint or AS".
> Skip for simple CRUD like this tag filter.

### Step 2 — Implement + build (`/sp-build`)

```text
You: (edit TodoListView.swift, TagFilterChip.swift) — now /sp-build

Agent → running /sp-build
  Phase 1.5: Coverage Map
    [+] TodoListView.swift
        └── applyTagFilter(selected:)
            ├── [★★  TESTED] empty selection → returns all   (new test)
            ├── [★★  TESTED] single tag match                 (new test)
            ├── [GAP]         no-match empty state            (← AS-015)
            └── [★★  TESTED] multi-tag AND semantics          (new test)

  Writing test for [GAP]… building… running.
  ✓ 14 tests passed (3 new, 0 regressions)
```

### Step 3 — Bug found? (`/sp-fix`)

```text
You: /sp-fix "selecting two tags shows OR results, should be AND"

Agent → running /sp-fix
  Phase 0: Bug Path Diagram
    applyTagFilter(selected: ["work","urgent"])
      └── [BUG] predicate uses .contains(anyOf:) — should be .contains(allOf:)

  Phase 1: writing failing test (AS-014 variant: 2 tags, AND)… FAILS ✓
  Phase 2: changing .anyOf → .allOf in TodoRepository.swift:88 (1 line)
  Phase 3: test now PASSES, full suite green.

  DEBUG REPORT
    Root cause: wrong set operator, regression from S-005 search refactor
    Prevention: add AS for multi-tag AND to spec (auto-signaled)
```

### Step 4 — Review + commit (`/sp-review` → `/sp-commit`)

```text
You: /sp-review

Agent → Smart Focus: UI state + query predicate
  Failure Mode Grid: all paths have tests ✓ error states covered ✓
  Finding (confidence 8/10): selected-tags state not persisted across
    navigation. Not in current spec — logged under "Not in Scope".
  Verdict: APPROVE

You: /sp-commit

Agent → secret scan: clean. debug-code scan: clean.
  Staging 4 files. Conventional message:
    feat(todo): filter list by selected tags with AND semantics
  ✓ commit a1b2c3d (not pushed — run `git push` when ready)
```

> **Complex bug?** Insert `/sp-investigate "<bug>"` before `/sp-fix`. It's read-only,
> writes `docs/investigate/<slug>-<date>.md` with hypotheses + blast radius, then
> `/sp-fix` auto-picks it up. Skip for trivial bugs.

That's the 5 minutes. The CLI auto-detected your project (Swift + XCTest here) — no config touched.

---

## 3. Setup

### Prerequisites

| Tool | Required | Why |
|------|----------|-----|
| **A supported agent CLI** | Yes | Runs the skills — Claude Code, Codex, Cursor, Antigravity, OpenClaw, or Hermes |
| **Git** | Yes | Change detection, commit workflow |
| **Node.js** (18+) | Yes | File guard hook, JSON parsing |
| **Bash** (4+) | Yes | Path guard hook, shell-based hooks |
| **Language toolchain** | Yes | Whatever your project uses (Swift, npm, pytest, etc.) |
| **[GraphAtlas](https://github.com/microvn/graphatlas)** | Optional | Graph-based code intelligence — skills prefer it over `grep` when connected |

### Installation

```bash
npx specpipe init .                              # A — one-command install (recommended)
npm install -g specpipe && specpipe init .       # B — global CLI, then init per project
specpipe init --global                           # C — install skills for every project (~/.claude/skills/)
npx specpipe init --force .                      # D — force re-install (overwrites existing files)
npx specpipe init --only hooks,skills .          # E — selective install (specific components)
npx specpipe init --agents cursor,codex .        # F — multi-agent (a list, or `all`)
```

Globally installed skills (`~/.claude/skills/`) are available in every project; per-project `.claude/skills/` always takes precedence, so a project can override individual skills.

### Supported agents

The skills are authored once and emitted into each agent's native format on install.
The markdown body is identical across agents; only the file location, name, and
frontmatter change. Guardrails are **enforced via blocking hooks** for Claude, Codex,
and Cursor (they can deny a tool call); Antigravity, OpenClaw, and Hermes get the same
guard intent as **always-on advisory rules**.

| Agent | Install location | Guardrails |
|-------|------------------|-----------|
| **Claude Code** | `.claude/skills/sp-*/SKILL.md` + `.claude/hooks/` | Hook-enforced |
| **Codex CLI** | `.agents/skills/sp-*/SKILL.md` | **enforced** `.codex/hooks.json` + `AGENTS.md` |
| **Cursor** | `.cursor/skills/sp-*/SKILL.md` | **enforced** `.cursor/hooks.json` + `.cursor/rules/` |
| **Antigravity** | `.agents/skills/sp-*/SKILL.md` | `.agent/rules/` (advisory) |
| **OpenClaw** | `skills/sp-*/SKILL.md` | `SPECPIPE-GUARDS.md` (advisory) |
| **Hermes** | `optional-skills/specpipe/sp-*/SKILL.md` | `SPECPIPE-GUARDS.md` (advisory) |

Skills that use Claude-only tools (`AskUserQuestion`, subagents) get a "Running outside
Claude Code" note appended for the other agents, so they degrade gracefully. The specs
and workflow themselves are tool-agnostic. Full details: [docs/multi-agent.md](docs/multi-agent.md).

### What gets installed

The default (`--agents claude`) layout. Other agents install the same skills into their own locations (see the table above).

```
your-project/
├── .specpipe/manifest.json     ← install manifest (tracks files per agent; used by upgrade/remove)
├── .claude/
│   ├── CLAUDE.md               ← project rules hub (auto-filled with detected stack)
│   ├── settings.json           ← hook wiring
│   ├── hooks/                  ← file/path/glob/comment/sensitive guards + self-review
│   └── skills/sp-*/            ← the 13 skills (/sp-plan, /sp-build, /sp-fix, …)
└── docs/
    ├── specs/<feature>/        ← your specs (folder-per-feature) + snapshots/
    └── WORKFLOW.md             ← process reference
```

`specpipe remove` cleans up hooks, skills, and settings while preserving `CLAUDE.md` and `docs/`. See [docs/hooks.md](docs/hooks.md) for what each guard does.

### Optional: GraphAtlas code intelligence

The skills work out of the box with `grep`. When [GraphAtlas](https://github.com/microvn/graphatlas) (GA) is connected as an MCP server, six skills — `/sp-explore`, `/sp-plan`, `/sp-build`, `/sp-fix`, `/sp-review`, `/sp-investigate` — prefer it for code discovery, call-graph tracing, and blast-radius analysis. `grep` can't tell a call site from a string literal or follow re-exports; GA indexes the repo into a local graph with typed `CALL`/`IMPORT`/`OVERRIDE` edges and answers structural questions deterministically — 100% local, no LLM, no telemetry.

Install and register it per the [GraphAtlas README](https://github.com/microvn/graphatlas); the skills detect it automatically and fall back to `grep` when it's absent or the index is stale. Nothing breaks — you only lose precision.

### Upgrade & uninstall

```bash
npx specpipe check       # is an update available?
npx specpipe diff        # what changed?
npx specpipe list        # installed files + status
npx specpipe upgrade     # smart upgrade — preserves files you customized (--force overwrites all)
npx specpipe remove      # remove hooks/skills/settings; keeps CLAUDE.md + docs/
```

After install, verify the **Project Info** in `.claude/CLAUDE.md` (language, test framework, directories) and edit if the auto-detection missed anything.

---

## 4. Daily Workflows

### New Project (Greenfield)

> When: Brand-new project — no codebase yet (empty repo, no package manager / `src/`).

```
1. /sp-explore "what you're building"
   → Detects greenfield, also decides app-type + stack (researched, current),
     emits a Bootstrap Brief in docs/explore/<feature>.md.

2. /sp-scaffold
   → Generator-first runnable skeleton (core/ + one pattern-demonstrating module +
     tests), smoke-gated (install→build→start GREEN), + ARCHITECTURE.md / ADRs.
     Hands off only when it RUNS.

3. /sp-plan → /sp-build   → normal New Feature flow, now on a runnable base.
```

### Explore Before Planning

> When: Requirements are unclear, you're debating between approaches, or it's a brownfield feature with existing code to understand first.

```
1. /sp-explore "feature description"
   → Asks questions as a Client Technical Lead — one topic at a time.
   → Clarifies: why, behavior, boundaries, business rules, edge cases, permissions, UI.
   → Output: docs/explore/<feature>.md

2. /sp-plan "feature description"
   → Auto-detects docs/explore/<feature>.md, skips redundant discovery.
   → Continue with the normal New Feature flow.
```

### New Feature

> When: Building something new — no existing code or spec.

```
1. /sp-plan "description of the feature"
   → Generates spec with acceptance scenarios at docs/specs/<feature>/<feature>.md.

2. Implement code in chunks.
   After each chunk: /sp-build
   Repeat until green.

3. /sp-review (before merge)

4. /sp-commit
```

**Example:**
```
/sp-plan "User authentication with email/password login, password reset via email, and session management with 24h expiry"
```

### Update Existing Feature

> When: Changing behavior of something that already exists.

```
1. /sp-plan docs/specs/<feature>/<feature>.md "description of changes"
   → Mode C handles everything: snapshot → classification → change report → apply.
   Do NOT manually edit the spec before running /sp-plan.

2. Implement the code change.
   /sp-build
   Fix until green.

3. /sp-review → /sp-commit
```

### Bug Fix

> When: Something is broken.

```
0. (OPTIONAL) /sp-investigate "description of the bug"
   → Use for complex bugs, outages, data corruption, or when the cause is unclear.
   → Read-only: hypothesis + blast radius + evidence, no code changes.
   → Writes docs/investigate/<slug>-<date>.md for /sp-fix to consume.
   → Skip for trivial/obvious bugs — go straight to /sp-fix.

1. /sp-fix "description of the bug"  (or /sp-fix docs/investigate/<slug>-<date>.md)
   → Writes failing test → fixes code → runs full suite.

2. /sp-commit
```

### Remove Feature

> When: Deleting code, removing deprecated functionality.

```
1. /sp-plan docs/specs/<feature>/<feature>.md "remove stories S-XXX"
   → Mode C creates a snapshot (removing stories = Major), then marks as removed.

2. Delete production code + related tests.

3. Run the full test suite (your project's native test command). Fix cascading breaks.

4. /sp-commit
```

---

## 5. Commands

Thirteen slash commands. The one-liner and token cost are below; full per-skill behaviour (phases, rules, outputs) lives in **[docs/commands.md](docs/commands.md)**.

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
| [`/sp-spec-render`](docs/commands.md#sp-spec-render--render-spec-as-html-view) | Render a spec as a standalone, scannable HTML view | 3–8k |
| [`/sp-md-render`](docs/commands.md#sp-md-render--render-any-markdown-as-html-view) | Render any long-form markdown as a standalone HTML view | 3–8k |
| [`/sp-humanize`](docs/commands.md#sp-humanize--rephrase-to-human-voice) | Rephrase a plan/draft into natural, send-ready text | 2–6k |

---

## 6. Docs & Reference

| Doc | What's in it |
|-----|--------------|
| [docs/commands.md](docs/commands.md) | Full per-skill reference — phases, rules, outputs, token cost guide |
| [docs/hooks.md](docs/hooks.md) | Automatic guards — triggers, what each blocks, config, manual testing |
| [docs/spec-format.md](docs/spec-format.md) | Spec template, AS depth by priority, snapshots, naming conventions |
| [docs/customization.md](docs/customization.md) | Environment variables, extending `CLAUDE.md`, adding custom skills |
| [docs/troubleshooting.md](docs/troubleshooting.md) | Hooks not firing, tests not detected, wrong base branch, … |
| [docs/faq.md](docs/faq.md) | Common questions — specs for tiny changes, mocks, multi-language, … |
| [docs/multi-agent.md](docs/multi-agent.md) | How one skill emits into every agent's native format |
| [docs/architecture.md](docs/architecture.md) | CLI internals — registry, reconcile lifecycle, manifest |
| [docs/adding-an-agent.md](docs/adding-an-agent.md) | Add support for a new agent |

---

## Contributing

Issues and PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the dev setup, test suite, and the spec-first workflow this repo holds itself to. Security reports: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Microvn
