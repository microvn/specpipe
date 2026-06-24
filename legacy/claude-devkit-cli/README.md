# claude-devkit-cli → renamed to **specpipe**

This package has been renamed to [`specpipe`](https://www.npmjs.com/package/specpipe).
specpipe is the same spec-first toolkit, now multi-agent (Claude Code, Codex, Cursor,
Antigravity, and more) instead of Claude-only.

**Install the new package:**

```bash
npm i -g specpipe
specpipe init .        # or: sp init .
```

This `claude-devkit-cli` package still works — it depends on `specpipe` and forwards the
`claude-devkit` / `claude-devkit-cli` commands to it — but it is **deprecated** and only
exists to keep old installs running. Please migrate to `specpipe`.

- Repo & docs: https://github.com/microvn/specpipe
- Changelog: https://github.com/microvn/specpipe/blob/main/CHANGELOG.md
