# Architecture

specpipe authors a spec-first toolkit **once** and installs it for many AI coding
agents. The whole design follows from one idea: separate *what the toolkit is* (neutral
content) from *how each agent consumes it* (per-agent emission).

## The artifact taxonomy

Everything the kit ships is one of two kinds:

| Class | Examples | Source | How it installs |
|---|---|---|---|
| **Neutral source** | skills, project-rules, guard scripts | `kit/skills/`, `kit/rules/`, `kit/hooks/` | **emitted** per agent into that agent's native location |
| **Per-agent output** | `.claude/settings.json`, `.codex/hooks.json`, `.cursor/rules/*.mdc`, `AGENTS.md` | generated from the registry | written at install, tracked in the manifest |

A hook is a *mechanism*: an agent that exposes a pre-tool-call hook gets the neutral
guard scripts wired into its native config and **enforced** — a blocking exit stops the
call. Today that's Claude (`.claude/settings.json`), Codex (`.codex/hooks.json`), Cursor
(`.cursor/hooks.json`), and Antigravity (`.agents/hooks.json`). Agents without that
mechanism (OpenClaw, Hermes) receive the same guard **intent** as always-on advisory
rules instead. The scripts themselves are authored once in `kit/hooks/`; only the
per-agent config that registers them differs.

## The registry is the single extension point

`cli/src/lib/agents.js` holds `AGENTS` — one entry per agent. An entry declares:

- `label`, `skillTarget(name, inner)` — where its skills land,
- `emitFrontmatter` — how to render a skill's frontmatter,
- `rules` — where/how its guardrails live,
- `hooks`, `capabilities` — what it can enforce / do.

Every other part of the CLI (install, lifecycle, manifest) reads the registry. Adding an
agent touches one entry, not a dozen `if (agent === …)` branches. See
[adding-an-agent.md](adding-an-agent.md).

### Convention families

`.agents/skills/<name>/SKILL.md` + `AGENTS.md` is an emerging **vendor-neutral standard**
shared by Codex, Antigravity, and Gemini CLI. So those agents emit to the same location
with the same frontmatter — one emission serves the family. Families today:

- `claude` → `.claude/` (skills + hooks + settings + CLAUDE.md)
- **`.agents/` standard** (Codex, Antigravity, …) → `.agents/skills/` + `AGENTS.md`
- `cursor` → `.cursor/skills/` + `.cursor/rules/*.mdc`
- `openclaw` → `skills/`  ·  `hermes` → global-only (`~/.hermes/skills/`)

## Emission pipeline

```
kit/skills/<skill>/SKILL.md  (neutral source)
        │
        ▼  emitSkillFile(agent, rel, content)
   ┌─────────────────────────────────────────────┐
   │ 1. parseSkillPath  → skill name + inner path  │
   │ 2. skillTarget      → agent's output path      │
   │ 3. emitFrontmatter  → agent's frontmatter       │
   │ 4. adaptBody        → capability rewrites        │
   └─────────────────────────────────────────────┘
        │
        ▼
   { path, content }   → written + recorded in manifest
```

**Capability adaptation** (`adaptBody`) keeps the markdown body but reconciles
Claude-specific tools per agent:
- `AskUserQuestion` → rewritten into an explicit "ask one plain-text multiple-choice
  question" instruction (Claude keeps the tool verbatim).
- Subagent orchestration → an honest caveat for agents without subagents.
- GraphAtlas MCP → skills already self-gate (`if GA available … else grep`).

## Lifecycle: reconcile, not copy

`upgrade`/`remove`/`diff`/`list` don't assume the Claude layout. They compute the
**desired state** for the project's agents (`reconcile.js: computeDesired(agents)` —
re-emits every file) and reconcile against the manifest:

- desired ∧ ¬manifest → install (new file / newly added agent)
- desired ∧ manifest, kit changed, not customized → update
- ¬desired ∧ manifest → remove

The manifest lives at the neutral `.specpipe/manifest.json` (legacy
`.claude/.devkit-manifest.json` is read as a fallback so old installs migrate). Each entry
records `{ agent, templateRel, kitHash, installedHash, customized }`, so any agent's file
is reproducible and customization is detectable.

## Module map

```
cli/src/
  cli.js              command wiring
  commands/           init, upgrade, remove, diff, list, check
  lib/
    agents.js         registry + emitters + capability adaptation
    reconcile.js      computeDesired(agents) — desired-state model
    installer.js      file writes, conflict handling, agent-install, claude-global
    manifest.js       read/write, customization tracking
    hasher.js, detector.js, logger.js
kit/
  skills/             neutral skill sources (one SKILL.md per skill)
  rules/              specpipe-rules.md — the single rich rules source (emitted per agent)
  hooks/              guard scripts (shell/read/comment/glob/file), emitted per agent
```
