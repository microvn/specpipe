# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
