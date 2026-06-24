# Multi-Agent Support

specpipe authors each skill once in an **agent-neutral source**
(`kit/skills/<skill>/SKILL.md`) and emits per-agent variants on install — Claude is
just one target (its emitter keeps the frontmatter verbatim), not the privileged source.
The markdown **body is identical** across agents; only the install path, file name,
and frontmatter change. See `cli/src/lib/agents.js` for the registry and emitters.

## Install

```bash
specpipe init                              # Claude only (default, backward compatible)
specpipe init --agents cursor,antigravity  # specific agents
specpipe init --agents all                 # every supported agent
```

When Claude is among the targets it also gets the full base (hook scripts, settings.json,
CLAUDE.md). Today specpipe enforces guards via hooks for Claude only; every other agent
gets the same guard intent as always-on advisory rules. (Several of them — Codex, Cursor,
OpenClaw — also have blocking hooks; emitting native hook configs for them is planned.)

## Verified format matrix (2026-06-22)

| Agent | Skill path | File | Frontmatter emitted | Guards installed |
|---|---|---|---|---|
| Claude Code | `.claude/skills/<n>/` | `SKILL.md` | canonical, verbatim | **enforced** hooks (`.claude/hooks` + settings.json) |
| Codex CLI | `.agents/skills/<n>/` | `SKILL.md` | `name` + `description` | **enforced** `.codex/hooks.json` (PreToolUse, exit-2) + advisory `AGENTS.md` |
| Cursor | `.cursor/skills/<n>/` | `SKILL.md` | `name` + `description` | **enforced** `.cursor/hooks.json` (`failClosed`) + advisory `.cursor/rules/*.mdc` |
| Antigravity | `.agents/skills/<n>/` | `SKILL.md` | `name` + `description` | advisory `.agent/rules/*.md` |
| OpenClaw | `skills/<n>/` | `SKILL.md` | `name` + `description` + `metadata.openclaw` | advisory `SPECPIPE-GUARDS.md` (plugin hooks can block — planned) |
| Hermes-Agent | `optional-skills/specpipe/<n>/` | `SKILL.md` | `name`+`description`+`version`+`metadata.hermes.tags` | advisory `SPECPIPE-GUARDS.md` |

`allowed-tools` (Claude-specific) is stripped for every non-Claude agent.
Cursor uses its **native skills** (`.cursor/skills/`), not always-on `.mdc` rules — it also
reads `.claude/skills/` and `.agents/skills/` for interop. Reference files land under
`.cursor/skills/<n>/`.

**Enforcement.** Claude is not the only agent that can BLOCK a tool call.
**Codex and Cursor now get enforced hooks** — specpipe installs shared guard scripts
(`specpipe-shell-guard.sh` blocks wasteful-dir exploration + secret access in shell
commands; `specpipe-read-guard.sh` blocks secret-file reads) wired via `.codex/hooks.json`
(PreToolUse → exit-2) and `.cursor/hooks.json` (`beforeShellExecution`/`beforeReadFile`,
`failClosed: true`). They ALSO get the advisory operating-rules for everything the hooks
don't cover. The hook payloads + exit-2 block primitive are verified against each tool's
docs; the scripts are unit-tested on both payload shapes. OpenClaw's plugin-hook
enforcement (a TypeScript plugin, different mechanism) is still planned; Antigravity and
Hermes stay advisory (no usable blocking-hook surface).

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
one canonical source (`kit/rules/specpipe-guards.md`):
- Cursor → `.cursor/rules/specpipe-guards.mdc` (`alwaysApply: true`)
- Antigravity → `.agent/rules/specpipe-guards.md` (plain markdown — no documented trigger/glob frontmatter)
- Codex → a marked section merged into a shared `AGENTS.md` (preserves user content; stripped cleanly on remove)
- OpenClaw / Hermes → `SPECPIPE-GUARDS.md` advisory doc (no rules system)

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
model (`computeDesired`). The manifest lives at the neutral `.specpipe/manifest.json`
(legacy `.claude/` read as a fallback) and records `{ agent, templateRel }` per file.

**Other open items**
- Codex + Antigravity skills share the vendor-neutral `.agents/skills/` standard, so
  installing for either lands the same files there (one emission serves the family).
- Global install (`init --global`) is still Claude-only; multi-agent global is future work.
- The skill *bodies* still reference "Claude Code" where they describe Claude
  capabilities — intentional. The adaptation section explains the gap rather than
  rewriting prose that's genuinely about Claude.
