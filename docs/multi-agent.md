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

Guards are emitted as native hook configs wherever the agent exposes a pre-tool-call
hook, so they actually **block**: Claude (`.claude/settings.json`), Codex
(`.codex/hooks.json`), Cursor (`.cursor/hooks.json`), and Antigravity
(`.agents/hooks.json`). Agents without that mechanism (OpenClaw, Hermes) get the same
guard intent as always-on advisory rules instead.

## Verified format matrix (2026-06-22)

| Agent | Skill path | File | Frontmatter emitted | Guards installed |
|---|---|---|---|---|
| Claude Code | `.claude/skills/<n>/` | `SKILL.md` | canonical, verbatim | **enforced** hooks (`.claude/hooks` + settings.json) |
| Codex CLI | `.agents/skills/<n>/` | `SKILL.md` | `name` + `description` | **enforced** `.codex/hooks.json` (PreToolUse, exit-2) + advisory `AGENTS.md` |
| Cursor | `.cursor/skills/<n>/` | `SKILL.md` | `name` + `description` | **enforced** `.cursor/hooks.json` (`failClosed`) + advisory `.cursor/rules/*.mdc` |
| Antigravity | `.agents/skills/<n>/` | `SKILL.md` | `name` + `description` | **enforced** `.agents/hooks.json` (PreToolUse `run_command`, exit-non-zero) + advisory `.agents/rules/*.md` |
| OpenClaw | `skills/<n>/` | `SKILL.md` | `name` + `description` + `metadata.openclaw` | advisory `SPECPIPE-RULES.md` (plugin hooks can block — planned) |
| Hermes-Agent | global-only (`~/.hermes/skills/`) | `SKILL.md` | `name`+`description`+`version`+`metadata.hermes.tags` | advisory `SPECPIPE-RULES.md` |

`allowed-tools` (Claude-specific) is stripped for every non-Claude agent.
Cursor uses its **native skills** (`.cursor/skills/`), not always-on `.mdc` rules — it also
reads `.claude/skills/` and `.agents/skills/` for interop. Reference files land under
`.cursor/skills/<n>/`.

Hermes is **global-only for skills**: it discovers skills solely from `~/.hermes/skills/`
(plus explicitly-configured `external_dirs`) and never scans the project, so a per-project
skill file would be dead. `init --agents hermes` therefore emits only its advisory rules
doc per project; use `init --global --agents hermes` to install its skills.

**Enforcement.** Four agents BLOCK tool calls: **Claude, Codex, Cursor, and Antigravity**.
A single unified guard pair (`specpipe-shell-guard.sh` blocks wasteful-dir exploration +
secret access in shell commands; `specpipe-read-guard.sh` blocks secret-file reads) is
emitted from one hook registry (`cli/src/lib/hooks.js`) into each agent's native config.
The scripts are **multi-payload** — they read the command/path from whichever shape the
agent sends:

| Agent | Config file | Shape | Shell matcher | Command payload | Block |
|---|---|---|---|---|---|
| Claude | `.claude/settings.json` | `{hooks:{PreToolUse:[{matcher,hooks:[{type,command}]}]}}` | `Bash` | `.tool_input.command` | exit 2 |
| Codex | `.codex/hooks.json` | same (nested) — enabled by default; project layer must be trusted | `Bash` | `.tool_input.command` | exit 2 |
| Cursor | `.cursor/hooks.json` | `{version:1,hooks:{beforeShellExecution:[{command,failClosed}]}}` | (full command) | `.command` | exit 2 |
| Antigravity 2.0 | `.agents/hooks.json` | `{enabled:true,PreToolUse:[{matcher,command,timeout}]}` | `run_command` | `.tool_args.CommandLine` | exit ≠0 |

`SECRET_POLICY=warn` (Claude's wiring) keeps the secret-approval flow — warn + allow, so
the user can approve; the other three default to `block`. Formats verified 2026-06-28
against each tool's docs (see Sources). OpenClaw's hooks are programmatic TypeScript
plugins (`api.on`), not a droppable config — so OpenClaw and Hermes stay advisory-only.

### Global install (user-level)

`specpipe init --global [--agents …]` installs skills into each agent's own user-level
dir, so they're available across every project. The global dir is per-agent and usually
differs from the project path — it is NOT just the project path under `~`:

| Agent | Global skills dir | Source |
|---|---|---|
| Claude Code | `~/.claude/skills/` | code.claude.com/docs/en/skills |
| Codex CLI | `~/.codex/skills/` (NOT `~/.agents/skills/`) | developers.openai.com/codex/skills |
| Antigravity (CLI) | `~/.gemini/antigravity-cli/skills/` (IDE uses `~/.gemini/config/skills/`) | Google Antigravity codelab |
| OpenClaw | `~/.openclaw/skills/` | docs.openclaw.ai/tools/skills |
| Hermes-Agent | `~/.hermes/skills/` | NousResearch/hermes-agent |
| Cursor | `~/.cursor/skills/` (also reads `~/.claude/skills/` + `~/.codex/skills/`) | cursor.com/docs/skills |

`--global` alone defaults to Claude. Skills are emitted per-agent (same frontmatter
transforms as the project install). Global **hooks** stay Claude-only. `remove --global`
deletes only specpipe's `sp-*` dirs from each agent's global root — never the whole root
(it may hold the agent's own or vendor skills, e.g. Codex's `~/.codex/skills/.system`).

### Sources
- Claude Code skills/memory: https://code.claude.com/docs/en/skills , https://code.claude.com/docs/en/memory
- **Hooks (verified 2026-06-28):** Codex https://developers.openai.com/codex/hooks (enabled by default; `.codex/hooks.json`; exit 2) · Cursor https://cursor.com/docs/hooks (`.cursor/hooks.json` `version:1`, `failClosed`) · Antigravity https://antigravity.google/docs/hooks + codelab `secure-agentic-coding` (`.agents/hooks.json`, matcher `run_command`, payload `tool_args.CommandLine`, exit-non-zero)
- Cursor rules: https://cursor.com/docs/rules
- Codex skills/AGENTS.md: https://developers.openai.com/codex/skills , /concepts/customization , /guides/agents-md — skills live in `.agents/skills/` (NOT `.codex/skills/`, a non-working path per openai/codex#15136)
- Antigravity skills: https://codelabs.developers.google.com/getting-started-with-antigravity-skills (`.agents/skills/`); rules dir moved to `.agents/rules/` (plural) as of v1.19.5, `.agent/rules/` is backward-compat only — https://discuss.ai.google.dev/t/new-folder-for-rules/126165
- OpenClaw: https://github.com/openclaw/openclaw (skills/<n>/SKILL.md, `metadata.openclaw` block)
- Hermes-Agent: https://github.com/NousResearch/hermes-agent (optional-skills/<cat>/<n>/SKILL.md; persona in `SOUL.md`)

## Known limitations / phases

**P1 (done): format + install.** Per-agent emitters, `--agents` flag, multi-agent
manifest fields. Backward compatible — no `--agents` behaves exactly as before.

**P2 (done): hooks/guards per agent.** Claude keeps its native hook enforcement.
Every other agent gets the same guard *intent* as an always-on rule, emitted from
one canonical source (`kit/rules/specpipe-rules.md`):
- Cursor → `.cursor/rules/specpipe-rules.mdc` (`alwaysApply: true`)
- Antigravity → `.agents/rules/specpipe-rules.md` (plain markdown; `.agents/` plural is the v1.19.5+ default)
- Codex → a marked section merged into a shared `AGENTS.md` (preserves user content; stripped cleanly on remove)
- OpenClaw / Hermes → `SPECPIPE-RULES.md` advisory doc (no rules system)

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
- Global install (`init --global`) emits skills per agent (honors `--agents`); only
  global **hooks** stay Claude-only, since hooks are Claude's native enforcement engine.
- The skill *bodies* still reference "Claude Code" where they describe Claude
  capabilities — intentional. The adaptation section explains the gap rather than
  rewriting prose that's genuinely about Claude.
