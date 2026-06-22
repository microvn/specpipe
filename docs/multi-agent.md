# Multi-Agent Support

agentpipe authors each skill once in the **canonical Claude form**
(`kit/.claude/skills/<skill>/SKILL.md`) and emits per-agent variants on install.
The markdown **body is identical** across agents; only the install path, file name,
and frontmatter change. See `cli/src/lib/agents.js` for the registry and emitters.

## Install

```bash
agentpipe init                              # Claude only (default, backward compatible)
agentpipe init --agents cursor,antigravity  # specific agents
agentpipe init --agents all                 # every supported agent
```

When Claude is among the targets it also gets the full base (hooks, config, docs) —
it is the only agent with a native hook-enforcement system. Other agents receive
skills only; their guard story is future work (see Phases below).

## Verified format matrix (2026-06-22)

| Agent | Path | File | Frontmatter emitted | Hooks |
|---|---|---|---|---|
| Claude Code | `.claude/skills/<n>/` | `SKILL.md` | canonical, verbatim | native |
| Antigravity | `.agents/skills/<n>/` | `SKILL.md` | `name` + `description` | none (rules) |
| OpenClaw | `skills/<n>/` | `SKILL.md` | `name` + `description` | none |
| Hermes-Agent | `optional-skills/agentpipe/<n>/` | `SKILL.md` | `name` + `description` + `version` + `metadata.hermes.tags` | none |
| Codex CLI | `.codex/skills/<n>/` | `SKILL.md` | `name` + `description` | AGENTS.md |
| Cursor | `.cursor/rules/` | `<n>.mdc` | `description` + `globs` + `alwaysApply` | none |

`allowed-tools` (Claude-specific) is stripped for every non-Claude agent.
Cursor reference files (templates/examples) land under `.cursor/rules/<n>/`.

### Sources
- Claude Code skills/memory: https://code.claude.com/docs/en/skills , https://code.claude.com/docs/en/memory
- Cursor rules: https://cursor.com/docs/rules
- Codex AGENTS.md / skills: https://developers.openai.com/codex/guides/agents-md , https://developers.openai.com/codex/skills
- Antigravity skills: https://ai.google.dev/gemini-api/docs/antigravity-agent ; path `.agents/skills` confirmed via GitHub code search (26.8k vs 7.1k for singular)
- OpenClaw: https://github.com/openclaw/openclaw (skills/<n>/SKILL.md, `metadata.openclaw` block)
- Hermes-Agent: https://github.com/NousResearch/hermes-agent (optional-skills/<cat>/<n>/SKILL.md; persona in `SOUL.md`)

## Known limitations / phases

**P1 (done): format + install.** Per-agent emitters, `--agents` flag, multi-agent
manifest fields. Backward compatible — no `--agents` behaves exactly as before.

**P2 (done): hooks/guards per agent.** Claude keeps its native hook enforcement.
Every other agent gets the same guard *intent* as an always-on rule, emitted from
one canonical source (`kit/rules/agentpipe-guards.md`):
- Cursor → `.cursor/rules/agentpipe-guards.mdc` (`alwaysApply: true`)
- Antigravity → `.agents/rules/agentpipe-guards.md` (`trigger: always_on`)
- Codex → a marked section merged into a shared `AGENTS.md` (preserves user content; stripped cleanly on remove)
- OpenClaw / Hermes → `AGENTPIPE-GUARDS.md` advisory doc (no rules system)

These are **advisory, not hook-enforced** — that's the honest completeness gap,
surfaced by `init` warnings and `list`.

**P3 (todo): capability parity.** Skill bodies call Claude-specific tools — `Task`
(subagents in ap-build auto-mode, ap-voices, ap-challenge) and `AskUserQuestion`.
Other agents lack these. Add per-agent fallbacks or body variants so a ported skill
degrades gracefully instead of silently assuming Claude's tool surface.

**Other open items**
- The agentpipe manifest still lives at `.claude/.devkit-manifest.json` even for
  non-Claude installs. A neutral location (`.agentpipe/`) is future work — it touches
  `upgrade`/`remove`/`list`, which are not yet per-agent aware.
- `upgrade`, `remove`, `diff`, `list` operate on the Claude layout only; making them
  per-agent is the next slice after this foundation.
- Codex Agent Skills project path (`.codex/skills/`) is a reasonable default but not
  yet verified against a real Codex install.
