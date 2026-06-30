# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] — 2026-06-30

The first multi-agent release: specpipe authors one spec-first workflow and emits it
into every supported AI coding agent. (npm 1.0.2–1.0.4 carried this work under a
mislabeled major; 2.0.0 is the canonical line.)

### Added
- **Multi-agent install** (`init --agents <list>|all`): one skill set, emitted into each
  agent's native layout — Claude Code, Codex, Cursor, Antigravity, OpenClaw, Hermes.
- **Antigravity is now hook-enforced.** Verified live against Antigravity CLI 1.0.13:
  the hook config is a named-hook map (`{ "<name>": { PreToolUse: [...] } }`, no `enabled`
  bool), commands run relative to the `.agents/` cwd, the payload is `toolCall.args.*`, and
  blocking uses a stdout `{"decision":"deny"}` (exit codes aren't honored). So it joins
  Claude/Codex/Cursor as an enforced agent.
- **`remove --agents <list>`** drops one agent and keeps shared files the others need;
  **`remove --dry-run`** previews without touching disk.
- **file-guard on Cursor** (postToolUse → `additional_context`): the large-file warning now
  reaches Cursor too, not just Claude.
- **Migration from the old claude-devkit (`mf-*`) / agentpipe (`ap-*`):** `init`/`upgrade`
  prune predecessor skills + renamed hooks that a prior manifest tracked (per-project and
  global, including legacy entries with no `agent` field), and sweep the old
  `~/.claude/scripts/build-test.sh`. A user's own untracked skills are never touched.
- **`--hooks <all|none|names>`**: choose which guard hooks install. `none` is option A —
  guardrails off entirely (no enforced hooks AND no advisory rules). Recorded in the
  manifest, honored on upgrade; the interactive picker asks for it too.
- **Interactive `specpipe init`**: run bare in a terminal, it now asks scope (project/global),
  agents, skills, and hooks (all pre-selected; render/humanize skills tagged *optional*).
  Powered by `@clack/prompts`. Any flag or `-y/--yes` skips the prompts; non-TTY is always
  non-interactive.
- **`--skills <list>`**: install a subset — `all` (default), `core` (all minus the optional
  `sp-spec-render`/`sp-md-render`/`sp-humanize`), or a comma list (`sp-build,sp-fix`). The
  selection is recorded in the manifest and honored by `upgrade`/`diff`. Works per-project
  and `--global`.
- Multi-agent **global** install: `specpipe init --global --agents <list>` installs skills
  into each agent's own user-level dir — Claude `~/.claude/skills`, Codex `~/.codex/skills`,
  Antigravity `~/.gemini/antigravity-cli/skills`, Cursor `~/.cursor/skills`, OpenClaw
  `~/.openclaw/skills`, Hermes `~/.hermes/skills`. `--global` alone still defaults to Claude.
  Cursor also reads Claude's & Codex's global dirs. Hermes is global-only for skills (it
  never scans the project).

### Changed
- **One rules source, emitted per agent (incl. CLAUDE.md).** `kit/rules/specpipe-rules.md`
  is now the single rich source — spec-first + the `/sp-*` workflow table + guardrails +
  testing + conventions + forbidden + auto-detected Project Info. Install emits it into each
  agent's project-config file as a marked section: **Claude → `.claude/CLAUDE.md`**, Codex →
  `AGENTS.md` (both merged into the user's existing file, preserving it), Cursor →
  `.cursor/rules/`, Antigravity → `.agents/rules/`, OpenClaw/Hermes → `SPECPIPE-RULES.md`.
  The old whole-file `kit/.claude/CLAUDE.md` (a second copy of the rules) is gone — no more
  duplication, and every agent now gets the workflow + project info, not just Claude.
  `remove` strips only specpipe's section, keeping the rest of a user's CLAUDE.md/AGENTS.md.
- "guards" → "rules" naming throughout (files, markers `specpipe:rules:*`, `.mdc`/doc names).
- **Unified guard scripts.** The two guard pairs (Claude's `path-guard`/`sensitive-guard`
  vs the shared `shell`/`read` guards) are merged into one comprehensive, multi-payload
  pair in `kit/hooks/`: `specpipe-shell-guard.sh` (wasteful dirs + secret access in shell
  commands) and `specpipe-read-guard.sh` (secret file reads). They read the command/path
  from every agent's payload shape and take `SECRET_POLICY=warn|block` (Claude warns to
  keep its approval flow; the others block). No more duplicated guard logic.
- **Hooks are emitted, not static.** A hook registry (`cli/src/lib/hooks.js`) generates
  each agent's native config (Claude `settings.json`, Codex/Cursor/Antigravity `hooks.json`)
  from one source. `kit/.claude/hooks/` and the static `settings.json` are gone.
- `publish.sh`: run the multi-agent emitter suite in the pre-publish gate; push to the
  `github` remote explicitly (origin is the legacy Bitbucket mirror).

### Fixed
- **Agent emit paths aligned to official 2026 docs:** Antigravity rules → `.agents/rules/`
  (plural, the v1.19.5 default; singular was legacy); Cursor gained a native global skills
  dir (`~/.cursor/skills/`) and reads `.cursor/skills/`; Hermes is global-only for skills
  (it never scans the project, so per-project skill files were dead).
- **Global hooks are now tracked in the manifest.** Previously their kit-hash was written
  to a discarded copy, so every differing hook looked "customized" and stale guard scripts
  were stranded forever; now a stale hook (matching the recorded kit-hash) auto-updates on
  upgrade while a genuinely user-edited one is preserved.
- The `.agents/`-family skill emit (Codex + Antigravity share the path) is byte-identical,
  so a clean `--agents all` no longer false-flags skills as "customized."
- Upgrading from an older install prunes obsolete `path-guard.sh`/`sensitive-guard.sh`/
  `self-review.sh` + the old `settings.json`, then installs the unified hooks. `remove`/
  `upgrade --global` now prune stale files too (global was previously add-only).
- `init` reports Codex/Cursor/Antigravity guards as hook-enforced (not advisory), and warns
  visibly when the project type can't be auto-detected (was a silent, phantom warning).
- `--global --agents <agent>` is now honored — previously `--global` silently ignored
  `--agents` and only installed Claude.
- `remove --global` deletes only specpipe's `sp-*` skill dirs, preserving the agent's own
  skills (e.g. Codex's `~/.codex/skills/.system`).

### Removed
- The **self-review** Stop hook and `SELF_REVIEW_ENABLED` (BREAKING). The advisory
  "self-review before finishing" rule stays in the operating rules.

## [1.0.1]

### Changed
- Package `homepage` now points to the landing site, [specpipe.vercel.app](https://specpipe.vercel.app).

## [1.0.0]

### Added
- Multi-agent install: `specpipe init --agents <list>|all` emits the skill set for
  Claude Code, Codex, Cursor, Antigravity, OpenClaw, and Hermes, each in its native format.
- Agent-neutral skill sources under `kit/skills/`; per-agent emitters in the registry.
- Guardrails per agent: native hooks for Claude; always-on advisory rules for the others
  (`.cursor/rules`, `.agent/rules`, `AGENTS.md`, `SPECPIPE-GUARDS.md`).
- Agent-aware lifecycle (`upgrade`/`remove`/`diff`/`list`) via a reconcile model; manifest
  moved to the neutral `.specpipe/manifest.json` (legacy `.claude/` read as a fallback).
- Capability adaptation: non-Claude skill variants rewrite `AskUserQuestion` into an
  explicit plain-text-question instruction and carry a subagent caveat.
- Enforced (blocking) guard hooks for Codex (`.codex/hooks.json`, PreToolUse exit-2) and
  Cursor (`.cursor/hooks.json`, `failClosed`): shared `specpipe-shell-guard.sh` /
  `specpipe-read-guard.sh` block wasteful-dir exploration and secret access. These agents
  now ENFORCE guards (not just advisory rules), like Claude's hooks.
- OSS scaffolding: LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, CHANGELOG, CI.

### Changed
- Rebrand `claude-devkit-cli` → `specpipe`; skills `mf-*` → `sp-*`.
- Codex skills target corrected to the cross-tool `.agents/skills/` standard.
- Cursor skills now emit to its native `.cursor/skills/<n>/SKILL.md` (was converted to
  always-on `.cursor/rules/*.mdc`); guards stay a `.cursor/rules/*.mdc` rule.
- Refactor: split `installer.js` (→ `agent-install.js`, `claude-global.js`) and
  `init.js` (→ `init-agents.js`, `init-global.js`); every source file is now under the
  350-line guard the kit ships.

### Planned (post-1.0)
- OpenClaw enforced hooks (a TypeScript plugin via `api.on` — different mechanism than
  the Codex/Cursor JSON-config hooks already shipped).
- Subagent conditional content for orchestration skills (currently an advisory caveat).
- Unify the default and `--agents` install paths into one.

## [1.0.0] — unreleased (first public release)

Initial open-source release of specpipe.
