When working in this repository, always follow these engineering guardrails.
On Claude Code these are enforced by hooks; on other agents they are always-on
rules you must self-enforce.

- **Don't explore large directories.** Never grep, list, or read inside
  `node_modules/`, build/dist artifacts, or `.git/` internals — they waste the
  context window. Use scoped, specific paths instead.
- **Never touch secrets.** Do not read or write `.env*`, private keys,
  credential files, or token stores. Respect any `.agentignore` patterns in the
  project.
- **Never drop real code.** Do not replace existing implementation with
  placeholder comments like `// ... existing code ...` or
  `// rest of implementation`. Reproduce the full code when editing.
- **Avoid broad globs.** Don't run wide patterns like `**/*.ts` at the project
  root; they return thousands of files. Scope globs to a directory.
- **Keep files focused.** Avoid letting a single source file grow past a few
  hundred lines — split into smaller, focused modules.
- **Self-review before finishing.** Before declaring work done, confirm: tests
  pass, no secrets committed, no leftover debug code, and the change matches the
  spec.
