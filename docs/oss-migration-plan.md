# Specpipe — Private → OSS Migration & Rebuild Plan

Status: draft for review. Author bar: senior AI/SWE. This is a **structured refactor +
reorganization + OSS hardening**, NOT a from-scratch rewrite — the 6,151 LOC of authored
skills and ~430 passing test assertions are the asset; we restructure around them.

---

## 1. Goal & non-goals

**Goal.** Turn `claude-devkit` (private, Claude-only) into `specpipe` — an OSS,
multi-agent, spec-first development toolkit that installs cleanly for Claude Code,
Codex, Cursor, Antigravity, OpenClaw, and Hermes, with an architecture that makes
adding the *next* agent a small, well-defined change.

**Non-goals.** No rewrite of skill content from scratch. No new feature scope beyond
multi-agent + OSS readiness. No docs-site build system yet (defer; ship `docs/` markdown).

**Definition of done.** A stranger can `npx specpipe init --agents <theirs>`, get a
correct install, read a clear README, and open a PR against a repo with LICENSE, CI,
CONTRIBUTING, and green tests on every supported agent's emitted format.

---

## 2. Current-state assessment (honest)

**Solid (keep):**
- Skill content — 13 skills, carefully authored, the real value.
- Emitter foundation (this session): agent registry, `emitSkillFile`/`emitFile`/`emitRules`,
  `--agents`, reconcile-based lifecycle, manifest at `.specpipe/`, neutral `kit/skills/`.
- Test coverage — cli.sh (~161), hooks.sh (203), agents.mjs (66).

**Debt (fix):**
- `init.js` 533 LOC, `installer.js` 501 LOC — over the kit's own 350-line guard. Split.
- No linter/formatter, no CI, no OSS hygiene files at all.
- Two install paths (default vs `--agents`) with overlapping logic — should unify.

**Coupling (resolve):**
- `CLAUDE.md` project-rules (spec-first, testing, conventions) install **Claude-only**;
  other agents get guards but not the rules → parity gap.
- Skill bodies hard-reference Claude tools: `AskUserQuestion` (rewrite done),
  subagent orchestration (not yet), and assume Claude's execution model.

---

## 3. Target architecture

### 3.1 Artifact taxonomy (the core mental model)

Everything the kit ships is exactly one of three kinds. This is the organizing principle:

| Class | Examples | Source | Install |
|---|---|---|---|
| **Neutral content** | skills, guardrails, project-rules | `kit/skills/`, `kit/rules/` | emitted per-agent to each agent's native location |
| **Claude-platform** | hook scripts, `settings.json` | `kit/.claude/` | copied verbatim to `.claude/` (Claude only — it's Claude's enforcement engine; other agents have none) |
| **Per-agent output** | `.cursor/rules/*.mdc`, `AGENTS.md`, `.agents/skills/` | generated | written at install, tracked in manifest |

Decision already validated: hooks + `settings.json` stay Claude-only platform artifacts
(no neutral equivalent; other agents get guard *intent* as advisory rules). `CLAUDE.md`
is split — its neutral project-rules become emitted content; its location stays `.claude/`.

### 3.1b Verified agent formats (researched 2026-06, sourced)

| Agent | Skills path | Rules/guards | Confidence |
|---|---|---|---|
| Claude Code | `.claude/skills/<n>/SKILL.md` | `.claude/hooks/` + `settings.json` | verified (official docs) |
| **Codex CLI** | **`.agents/skills/<n>/SKILL.md`** (+ `~/.agents/skills`) | `AGENTS.md` (plain md) | verified — official docs + `openai/codex` repo |
| Antigravity | `.agents/skills/<n>/SKILL.md` (global `~/.gemini/config/skills/`) | `.agent/rules/*.md` (singular, no frontmatter) + `.agent/workflows/` | skills verified (Google Codelab); rules path/format **soft** |
| Cursor | `.cursor/rules/<n>.mdc` | same (`description`/`globs`/`alwaysApply`) | verified |
| OpenClaw | `skills/<n>/SKILL.md` (+ `metadata.openclaw`) | none (config-driven) | repo-verified |
| Hermes | `optional-skills/<cat>/<n>/SKILL.md` | none (`SOUL.md` persona) | repo-verified |

**Two corrections this forces:**
1. **Codex is currently wired to `.codex/skills/` — wrong.** Must change to `.agents/skills/`.
   (`~/.codex/skills` is a known non-working path: openai/codex#15136.)
2. **Antigravity rules frontmatter (`trigger`/`globs`) is unverified** — current P2 guess.
   Antigravity rules appear to be plain markdown with no documented trigger/glob schema;
   emit a plain rule, don't fabricate frontmatter. Path: lean official `.agent/rules/`
   (singular) but verify against an installed build.

**Architectural consequence — model by *convention family*, not per-vendor.**
`.agents/skills/<n>/SKILL.md` + `AGENTS.md` is an emerging **vendor-neutral standard**
shared by Codex, Antigravity, and Gemini CLI. So Codex + Antigravity skills emit to the
SAME `.agents/skills/` location with identical (`name`+`description`) frontmatter — one
emission serves the whole family, not duplicated bespoke dirs. Families:
- `claude` → `.claude/` (full platform: skills + hooks + settings + CLAUDE.md)
- **`agents-standard`** (Codex, Antigravity, Gemini CLI, …) → `.agents/skills/` + `AGENTS.md`
- `cursor` → `.cursor/rules/*.mdc`
- `openclaw` → `skills/`  ·  `hermes` → `optional-skills/`

The registry should expose a `family` so adding a tool that follows the `.agents/` standard
is zero new emit code — just declare its family.

Sources: developers.openai.com/codex/skills, /concepts/customization, /guides/agents-md;
codelabs.developers.google.com/getting-started-with-antigravity-skills; atamel.dev (Google
DevRel) for Antigravity rules/workflows; cursor.com/docs/rules; github.com/openclaw/openclaw,
github.com/NousResearch/hermes-agent.

### 3.2 Agent registry as the single extension point

`cli/src/lib/agents.js` is the contract. Adding an agent = one registry entry declaring:
`label`, `skillTarget(name, inner)`, `rules` descriptor, `hooks` strategy, `capabilities`
(`subagents`, `structured-questions`, …), and frontmatter emitter. Everything else
(lifecycle, manifest, install) reads from the registry — no per-agent branches scattered.

### 3.3 Capability model (how Claude-specifics degrade)

Skill bodies declare what they need; emitters adapt per agent's capabilities:
- **Structured questions** (`AskUserQuestion`): controlled-vocabulary phrase rewrite →
  Claude keeps the tool verbatim; others get an explicit "plain-text multiple-choice
  question" instruction. (Done.)
- **Subagents** (`Task`/`Agent` orchestration): conditional blocks
  `<!-- ap:claude-only -->` / `<!-- ap:no-subagent -->`; emitter keeps/strips per the
  agent's `subagents` capability. (Planned — P2.)
- **MCP/GraphAtlas**: skills already self-gate ("if GA available … else grep"). No work.

### 3.4 Module boundaries (post-split)

```
cli/src/
  cli.js                 command wiring only
  commands/              thin: parse opts → call lib
  lib/
    agents/              registry + emitters (split agents.js: registry.js, emit-skill.js, emit-rules.js, adapt.js)
    install/             write + conflict logic (split installer.js: files.js, agent-install.js, claude-global.js)
    reconcile.js         desired-state model
    manifest.js, hasher.js, detector.js, logger.js
```

---

## 4. Migration phases (each shippable + tested + reviewed)

**P0 — Land the in-flight multi-agent work.** Commit the 31 uncommitted files
(neutral template + lifecycle + guards + AskUserQuestion). Clean baseline. *(ready now)*

**P1 — Architecture refactor (no behavior change).**
- Split `init.js` and `installer.js` under 350 LOC into the module layout above.
- Unify the default and `--agents` install paths (default = `--agents claude`).
- Formalize the capability model in the registry. Tests stay green throughout.

**P2 — Content parity across agents.**
- Emit `CLAUDE.md` project-rules per agent (Claude → `.claude/CLAUDE.md`; Cursor →
  `.cursor/rules/specpipe-project.mdc`; Codex → `AGENTS.md` section; etc.).
- Subagent conditional blocks for the 4 orchestration skills (sp-build, sp-voices,
  sp-challenge, sp-scaffold). Prove on sp-build, review, then replicate.
- Sweep remaining hard Claude references in bodies to the controlled vocabulary.

**P3 — OSS hardening.**
- `LICENSE` (MIT, matches package.json), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, `CHANGELOG.md` (Keep a Changelog), `.editorconfig`.
- Tooling: ESLint + Prettier config; `npm test` aggregator script; `npm run lint`.
- CI: `.github/workflows/` — run all test suites on push/PR (Node 18/20/22 matrix);
  a job that emits skills for every agent and asserts no Claude-token leaks.
- Issue/PR templates; `.github/FUNDING` optional.
- Verify `.idea/` is gitignored (it is) and not tracked.

**P4 — Docs & launch.**
- README: already multi-agent; add a 60-second per-agent quickstart + a real demo gif/asciinema.
- `docs/`: `multi-agent.md` (have), `architecture.md` (artifact taxonomy + registry),
  `adding-an-agent.md` (the extension recipe — proves the design), `skills.md` (catalog).
- Cover image (done). Social preview PNG (done).
- `npm publish` dry-run; bump to a clean `2.0.0` (rebrand + breaking layout = major).

---

## 5. Engineering practices (the 10+ yr bar)

- **Dogfood:** specpipe should be developed using its own spec-first loop where it fits.
- **CI is the gate:** no merge without green tests + lint + the per-agent emit check.
- **Semver discipline:** the rebrand + manifest-location move is breaking → `2.0.0`.
  Document the migration (legacy `.claude/.devkit-manifest.json` is already read as fallback).
- **Every agent in the registry has a test** asserting its emitted layout + no token leaks.
- **Keep files focused** — enforce the same 350-line guard we ship (split init/installer).

---

## 6. Open decisions (need your call)

1. **Agent tiers** (now grounded by research). Recommended split:
   - **Supported** (formats verified against official docs): Claude Code, Codex CLI,
     Cursor, Antigravity *(skills verified; rules emitted as plain markdown)*.
   - **Experimental** (real repos, niche, conventions verified from source not official
     docs): OpenClaw, Hermes.
   Confirm this split — it sets README claims + which agents CI hard-asserts.
2. **Version.** Ship the OSS launch as `2.0.0` (recommended — breaking) or continue `1.x`?
3. **Scope of P2 content work.** Full subagent conditional blocks for all 4 skills now,
   or ship parity (project-rules) first and treat orchestration degradation as advisory
   notes (current state) for the initial OSS release?
4. **Docs surface.** Markdown in `docs/` for launch (recommended) vs a docs site later?
5. **Repo/package name final.** `specpipe` everywhere is set; confirm npm `2.0.0` publish under it.

---

## 7. Suggested sequencing for the next working sessions

1. P0 (commit in-flight work) — minutes.
2. P3 OSS hygiene files (LICENSE/CONTRIBUTING/CI/lint) — high value, low risk, makes the
   repo "look OSS" immediately. Can run parallel to P1.
3. P1 refactor (split + unify) — de-risks all later work.
4. P2 parity (project-rules per agent → then subagent blocks).
5. P4 docs + launch + publish.
