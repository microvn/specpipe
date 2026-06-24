# claude-devkit-cli → renamed to **agentpipe**

This package has been renamed to [`agentpipe`](https://www.npmjs.com/package/agentpipe).
agentpipe is the same spec-first toolkit, now multi-agent (Claude Code, Codex, Cursor,
Antigravity, and more) instead of Claude-only.

**Install the new package:**

```bash
npm i -g agentpipe
agentpipe init .        # or: ap init .
```

This `claude-devkit-cli` package still works — it depends on `agentpipe` and forwards the
`claude-devkit` / `claude-devkit-cli` commands to it — but it is **deprecated** and only
exists to keep old installs running. Please migrate to `agentpipe`.

- Repo & docs: https://github.com/microvn/agentpipe
- Changelog: https://github.com/microvn/agentpipe/blob/main/CHANGELOG.md
