# Contributing to agentpipe

Thanks for your interest. agentpipe is a spec-first development toolkit that
installs the same skills across many AI coding agents. Contributions that add an
agent, sharpen a skill, or improve the install/lifecycle are all welcome.

## Ground rules

- **Be specific.** Issues and PRs should name the agent, command, or skill they touch.
- **Tests are the gate.** Nothing merges with failing tests. Add tests for new behavior.
- **Keep files focused.** Source files stay under ~350 lines (the same guard the kit ships).
- **No fabricated agent formats.** When adding or changing an agent's paths/frontmatter,
  cite the official source in the PR. If a format can't be verified from docs, mark the
  agent **experimental** rather than guessing.

## Project layout

```
cli/src/          the CLI — commands/ (thin) + lib/ (registry, install, reconcile, manifest)
kit/skills/       agent-neutral skill sources (one SKILL.md per skill)
kit/rules/        agent-neutral guardrails source
kit/.claude/      Claude-platform artifacts (hooks + settings.json + CLAUDE.md)
test/             cli.sh, hooks.sh, agents.mjs, coverage-gate.sh
docs/             architecture, multi-agent, adding-an-agent
```

## Dev setup

```bash
git clone https://github.com/microvn/agentpipe
cd agentpipe/cli && npm install
```

## Running tests

```bash
npm test          # runs all suites (agents unit + cli + hooks + coverage gate)
npm run lint      # eslint
npm run format    # prettier --write
```

Or run a suite directly: `node test/agents.mjs`, `bash test/cli.sh`, `bash test/hooks.sh`.

## Adding a coding agent

agentpipe is designed so adding an agent is a single registry entry. See
[docs/adding-an-agent.md](docs/adding-an-agent.md). In short:

1. Add an entry to `AGENTS` in `cli/src/lib/agents.js` (label, `skillTarget`, `rules`,
   `hooks`, `capabilities`, frontmatter emitter) — cite the official format source.
2. Add a test asserting its emitted layout and that no Claude-only tool token leaks.
3. Update the Supported/Experimental table in the README and `docs/multi-agent.md`.

## Commit & PR

- Conventional commits: `type(scope): description` (`feat`, `fix`, `docs`, `refactor`,
  `test`, `chore`, `perf`, `build`, `ci`).
- Keep PRs scoped to one concern. Describe what changed and why; link the issue.
- CI must be green (tests + lint + the per-agent no-leak check).

## Reporting bugs / security

File an issue for bugs. For security concerns, see [SECURITY.md](SECURITY.md) — do not
open a public issue for vulnerabilities.
