# Multi-Agent Support

agentpipe authors each skill once in an **agent-neutral source**
(`kit/skills/<skill>/SKILL.md`) and emits per-agent variants on install — Claude is
just one target (its emitter keeps the frontmatter verbatim), not the privileged source.
The markdown **body is identical** across agents; only the install path, file name,
and frontmatter change. See `cli/src/lib/agents.js` for the registry and emitters.

## Install

```bash
agentpipe init                              # Claude only (default, backward compatible)
agentpipe init --agents cursor,antigravity  # specific agents
agentpipe init --agents all                 # every supported agent
```

When Claude is among the targets it also gets the full base (hook scripts, settings.json,
CLAUDE.md). Today agentpipe enforces guards via hooks for Claude only; every other agent
gets the same guard intent as always-on advisory rules. (Several of them — Codex, Cursor,
OpenClaw — also have blocking hooks; emitting native hook configs for them is planned.)

## Verified format matrix (2026-06-22)

| Agent | Skill path | File | Frontmatter emitted | Guards today | Blocking hooks exist? |
|---|---|---|---|---|---|
| Claude Code | `.claude/skills/<n>/` | `SKILL.md` | canonical, verbatim | hooks (enforced) | ✓ `.claude/hooks` |
| Codex CLI | `.agents/skills/<n>/` | `SKILL.md` | `name` + `description` | AGENTS.md section | ✓ `.codex/hooks.json` (deny/exit-2) |
| Cursor | `.cursor/skills/<n>/` | `SKILL.md` | `name` + `description` | `.cursor/rules/*.mdc` | ✓ `.cursor/hooks.json` (fail-open by default) |
| Antigravity | `.agents/skills/<n>/` | `SKILL.md` | `name` + `description` | `.agent/rules/*.md` | ✗ rules only |
| OpenClaw | `skills/<n>/` | `SKILL.md` | `name` + `description` + `metadata.openclaw` | `AGENTPIPE-GUARDS.md` | ✓ plugin hooks (`api.on` block) |
| Hermes-Agent | `optional-skills/agentpipe/<n>/` | `SKILL.md` | `name`+`description`+`version`+`metadata.hermes.tags` | `AGENTPIPE-GUARDS.md` | ~ `command:*` only |

`allowed-tools` (Claude-specific) is stripped for every non-Claude agent.
Cursor uses its **native skills** (`.cursor/skills/`), not always-on `.mdc` rules — it also
reads `.claude/skills/` and `.agents/skills/` for interop. Reference files land under
`.cursor/skills/<n>/`.

**Enforcement (researched 2026-06):** Claude is NOT the only agent with blocking hooks —
Codex, Cursor, and OpenClaw also have hook systems that can deny a tool call. We currently
emit guards as **advisory rules** for all non-Claude agents; emitting native blocking-hook
configs for Codex/Cursor/OpenClaw is planned (see Phases). Antigravity (rules only) and
Hermes (only `command:*` can deny) stay advisory.

### Sources
- Claude Code skills/memory: https://code.claude.com/docs/en/skills , https://code.claude.com/docs/en/memory
- Cursor rules: https://cursor.com/docs/rules
- Codex skills/AGENTS.md: https://developers.openai.com/codex/skills , /concepts/customization , /guides/agents-md — skills live in `.agents/skills/` (NOT `.codex/skills/`, a non-working path per openai/codex#15136)
- Antigravity skills: https://codelabs.developers.google.com/getting-started-with-antigravity-skills (`.agents/skills/`); rules `.agent/rules/` per atamel.dev (Google DevRel)
- OpenClaw: https://github.com/openclaw/openclaw (skills/<n>/SKILL.md, `metadata.openclaw` block)
- Hermes-Agent: https://github.com/NousResearch/hermes-agent (optional-skills/<cat>/<n>/SKILL.md; persona in `SOUL.md`)

## Known limitations / phases

**P1 (done): format + install.** Per-agent emitters, `--agents` flag, multi-agent
manifest fields. Backward compatible — no `--agents` behaves exactly as before.

**P2 (done): hooks/guards per agent.** Claude keeps its native hook enforcement.
Every other agent gets the same guard *intent* as an always-on rule, emitted from
one canonical source (`kit/rules/agentpipe-guards.md`):
- Cursor → `.cursor/rules/agentpipe-guards.mdc` (`alwaysApply: true`)
- Antigravity → `.agent/rules/agentpipe-guards.md` (plain markdown — no documented trigger/glob frontmatter)
- Codex → a marked section merged into a shared `AGENTS.md` (preserves user content; stripped cleanly on remove)
- OpenClaw / Hermes → `AGENTPIPE-GUARDS.md` advisory doc (no rules system)

These are **advisory, not hook-enforced** — that's the honest completeness gap,
surfaced by `init` warnings and `list`.

**P3 (done): capability parity.** The skill body is kept verbatim. When a skill
declares Claude-specific tools in its `allowed-tools` frontmatter, the emitter
appends a "Running outside Claude Code" section to the non-Claude variant telling
the agent how to degrade:
- `AskUserQuestion` → ask the same choices in plain text and wait
- `Agent`/`Task` (subagents) → perform delegated steps sequentially in-session
- `mcp__graphatlas` → fall back to `grep`/file search

Skills with no Claude-specific tools get no added section.

**Lifecycle:** `upgrade`/`remove`/`diff`/`list` are agent-aware via the reconcile
model (`computeDesired`). The manifest lives at the neutral `.agentpipe/manifest.json`
(legacy `.claude/` read as a fallback) and records `{ agent, templateRel }` per file.

**Other open items**
- Codex + Antigravity skills share the vendor-neutral `.agents/skills/` standard, so
  installing for either lands the same files there (one emission serves the family).
- Global install (`init --global`) is still Claude-only; multi-agent global is future work.
- The skill *bodies* still reference "Claude Code" where they describe Claude
  capabilities — intentional. The adaptation section explains the gap rather than
  rewriting prose that's genuinely about Claude.
