# FAQ

[← Back to README](../README.md)


**Q: Do I need specs for every tiny change?**
A: No. Changes under 5 lines with no behavior change can skip the spec. Just `/sp-build` and `/sp-commit`. The spec-first rule is for meaningful behavior changes.

**Q: Can I use mocks in tests?**
A: Only for external services you can't run locally (third-party APIs, email services). Never mock your own code or database just to make tests pass faster.

**Q: What if Claude writes a test that tests the wrong thing?**
A: This usually means the spec is ambiguous. Clarify the spec first, then re-run `/sp-build`. Good specs produce good tests.

**Q: Can I use this with other AI coding tools?**
A: Yes. `specpipe init --agents <list>|all` installs the skills for Codex, Cursor, Antigravity, OpenClaw, and Hermes, each in its native format. Guards are hook-*enforced* for Claude, Codex, and Cursor (`.codex/hooks.json` / `.cursor/hooks.json` can block tool calls); Antigravity, OpenClaw, and Hermes get them as always-on advisory rules. The specs and workflow are tool-agnostic. See [docs/multi-agent.md](docs/multi-agent.md).

**Q: When should I use `/sp-challenge`?**
A: After `/sp-plan`, for complex features involving authentication, payments, data pipelines, or multi-service integration. It spawns parallel hostile reviewers that find security holes, failure modes, and false assumptions BEFORE you write code. Skip it for simple CRUD or small features — the overhead isn't worth it.

**Q: How do I do a full coverage audit?**
A: This is intentionally not a command (it's expensive and rare). When needed, prompt Claude directly: "Audit test coverage for feature X against docs/specs/X/X.md acceptance scenarios. Identify gaps and write missing tests."

**Q: What if my project uses multiple languages?**
A: The skills auto-detect the test command from the first project marker they find. For monorepos, run `/sp-build` from each sub-project directory, or pin the test command per project in `.claude/CLAUDE.md` under **Testing**.

**Q: Can I add more skills?**
A: Yes. Create a directory `.claude/skills/<name>/SKILL.md` and it becomes available as a slash command. See [Customization](customization.md).

**Q: How do I update the kit in existing projects?**
A: Run `npx specpipe upgrade`. It automatically detects which files you've customized and only updates unchanged files. Use `--force` to overwrite everything.

**Q: What's the HTML view next to my spec, and how do I generate it?**
A: It's a scannable view of the spec — sidebar TOC, story cards, collapsible AS, dark/light theme. Reading a 1000-line spec markdown in an editor is painful; the HTML is what a tired human can actually skim. Generate or refresh it by running `/sp-spec-render <feature>` — `/sp-plan` does not create it automatically, it just suggests the command at the end. `.md` remains the source of truth (AI and `/sp-build` read it, git diffs work normally). `.html` is a regenerable artifact — never edit it by hand, let `/sp-spec-render` rebuild it. You can email/Slack the HTML to PMs/stakeholders who don't want to clone the repo.

**Q: I installed with the old setup.sh — how do I migrate?**
A: Run `npx specpipe init --adopt .` to generate a manifest from your existing files without overwriting anything. Future upgrades will then work normally.
