# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Multi-agent install: `agentpipe init --agents <list>|all` emits the skill set for
  Claude Code, Codex, Cursor, Antigravity, OpenClaw, and Hermes, each in its native format.
- Agent-neutral skill sources under `kit/skills/`; per-agent emitters in the registry.
- Guardrails per agent: native hooks for Claude; always-on advisory rules for the others
  (`.cursor/rules`, `.agent/rules`, `AGENTS.md`, `AGENTPIPE-GUARDS.md`).
- Agent-aware lifecycle (`upgrade`/`remove`/`diff`/`list`) via a reconcile model; manifest
  moved to the neutral `.agentpipe/manifest.json` (legacy `.claude/` read as a fallback).
- Capability adaptation: non-Claude skill variants rewrite `AskUserQuestion` into an
  explicit plain-text-question instruction and carry a subagent caveat.
- OSS scaffolding: LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, CHANGELOG, CI.

### Changed
- Rebrand `claude-devkit-cli` → `agentpipe`; skills `mf-*` → `ap-*`.
- Codex skills target corrected to the cross-tool `.agents/skills/` standard.

## [1.0.0] — unreleased (first public release)

Initial open-source release of agentpipe.
