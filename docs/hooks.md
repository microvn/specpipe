# Automatic Guards (Hooks)

Hooks run automatically — you do not invoke them. They provide passive protection. Enforced (blocking) for Claude, Codex, and Cursor; advisory rules for the other agents.

[← Back to README](../README.md)


Hooks run automatically — you don't invoke them. They provide passive protection.

### File Guard (`file-guard.js`)

**Trigger:** After every Write or Edit operation.
**Action:** If a modified **source code file** exceeds 350 lines, injects a warning suggesting modularization. Docs, configs, and templates are intentionally excluded — they are naturally long.
**Blocking:** No — warns only, does not prevent the edit.

**Checked extensions:** `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.php`, `.rb`, `.rs`, `.go`, `.swift`, `.kt`, `.java`, `.cs`, `.cpp`, `.c`, `.dart`, `.vue`, `.svelte`, `.astro`, and more.
**Not checked:** `.md`, `.json`, `.yaml`, `.toml`, `.html`, `.css`, `.sh`, and other non-source files.

**Configuration:**
```bash
# Change the line threshold (default: 350)
export FILE_GUARD_THRESHOLD=500

# Exclude files from checking (comma-separated globs)
export FILE_GUARD_EXCLUDE="*.generated.swift,*.pb.go,*.min.js"
```

### Path Guard (`path-guard.sh`)

**Trigger:** Before every Bash command.
**Action:** Blocks commands that reference large directories (node_modules, build artifacts, etc.).
**Blocking:** Yes — prevents the command from running.

**Default blocked paths:**
`node_modules`, `__pycache__`, `.git/objects`, `dist/`, `build/`, `.next/`, `vendor/`, `Pods/`, `.build/`, `DerivedData/`, `.gradle/`, `target/debug`, `target/release`, `.nuget`, `.cache`

**Configuration:**
```bash
# Add project-specific blocked paths (pipe-separated)
export PATH_GUARD_EXTRA="\.terraform|\.vagrant|\.docker"
```

### Glob Guard (`glob-guard.js`)

**Trigger:** Before every Glob (file search) operation.
**Action:** Blocks overly broad glob patterns at project root that would return thousands of files and fill the context window.
**Blocking:** Yes — prevents the glob and suggests scoped alternatives.

**What it blocks:**
- `**/*.ts` at project root (use `src/**/*.ts` instead)
- `**/*` at project root (use `src/**/*` instead)
- `*` or `**` at project root
- Any recursive glob without a specific directory prefix

**What it allows:**
- `src/**/*.ts` — scoped to a specific directory
- `tests/**/*.test.js` — scoped to tests
- `**/*.ts` when run from inside a scoped directory (e.g., `path: "src"`)

### Comment Guard (`comment-guard.js`)

**Trigger:** After every Edit operation.
**Action:** Detects when real code is replaced with placeholder comments like `// ... existing code ...` or `// rest of implementation`. This is a common LLM laziness pattern.
**Blocking:** Yes — rejects the edit and tells Claude to preserve the original code.

**What it catches:**
- `// ... existing code ...`, `// ... rest of implementation`
- `// [previous code remains]`, `// unchanged`
- `/* ... */` replacing real code
- `# ... existing ...` (Python placeholders)
- `// TODO: implement` replacing real code
- Any edit where real code is replaced with a much shorter comment-only block

**What it allows:**
- Editing comments (old content was already comments)
- Adding comments alongside code (new content has both)
- Normal code replacements

### Sensitive Guard (`sensitive-guard.sh`)

**Trigger:** Before every Read, Write, Edit, and Bash command.
**Action:** Protects files containing secrets: `.env`, private keys, credentials, tokens.
**Blocking:** Read/Write/Edit → **blocks** (exit 2). Bash commands → **warns only** (allows access).

The Bash warn-only behavior enables an approval flow: Claude asks the user for permission, and if approved, can use `bash cat .env` to read the file.

**Protected files:**
- `.env`, `.env.local`, `.env.production`, etc. (but NOT `.env.example`)
- Private keys: `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`
- SSH keys: `id_rsa`, `id_ecdsa`, `id_ed25519`
- Cloud credentials: `serviceAccountKey.json`, `firebase-adminsdk*`
- Token files: `.npmrc`, `.pypirc`, `.netrc`
- Any file matching `*credential*`, `*secret*`, `*private_key*`

**Supports `.agentignore`:** Create a `.agentignore` file (or `.aiignore`, `.cursorignore`) in the project root with gitignore-style patterns to add project-specific protections.

**Configuration:**
```bash
# Add extra patterns (pipe-separated regex)
export SENSITIVE_GUARD_EXTRA="\.vault|.*_token\.json"
```

### Self-Review (`self-review.sh`)

**Trigger:** When Claude is about to stop (Stop event).
**Action:** Injects a self-review checklist reminding Claude to verify quality before finishing.
**Blocking:** No — just a reminder.

**Questions asked:**
1. Did you leave any TODO/FIXME that should be resolved now?
2. Did you create mock/fake implementations just to pass tests?
3. Did you replace real code with placeholder comments?
4. Do all changed files compile and typecheck cleanly?
5. Did you run the full test suite, not just the new tests?
6. Are there any files you modified but forgot to include in the summary?

**Configuration:**
```bash
# Disable self-review
export SELF_REVIEW_ENABLED=false
```

### Testing Hooks Manually

You can test hooks by piping mock JSON payloads:

```bash
# ── Path Guard ──
# Should exit 2 (blocked)
echo '{"tool_input":{"command":"ls node_modules"}}' | bash .claude/hooks/path-guard.sh
echo $?  # expect: 2

# Should exit 0 (allowed)
echo '{"tool_input":{"command":"ls src"}}' | bash .claude/hooks/path-guard.sh
echo $?  # expect: 0

# ── File Guard ──
seq 1 250 > /tmp/test-large.txt
echo '{"tool_input":{"file_path":"/tmp/test-large.txt"}}' | node .claude/hooks/file-guard.js
# Should output JSON with additionalContext warning

# ── Comment Guard ──
# Should exit 2 (blocked — replacing code with placeholder)
echo '{"tool_input":{"old_string":"function hello() {\n  return world;\n}","new_string":"// ... existing code ..."}}' | node .claude/hooks/comment-guard.js
echo $?  # expect: 2

# Should exit 0 (allowed — replacing code with code)
echo '{"tool_input":{"old_string":"return a;","new_string":"return b;"}}' | node .claude/hooks/comment-guard.js
echo $?  # expect: 0

# ── Sensitive Guard ──
# Should exit 2 (blocked)
echo '{"tool_input":{"file_path":".env"}}' | bash .claude/hooks/sensitive-guard.sh
echo $?  # expect: 2

# Should exit 0 (allowed)
echo '{"tool_input":{"file_path":".env.example"}}' | bash .claude/hooks/sensitive-guard.sh
echo $?  # expect: 0

# Should exit 0 (warn only — bash commands are allowed for approved access)
echo '{"tool_input":{"command":"cat .env.local"}}' | bash .claude/hooks/sensitive-guard.sh
echo $?  # expect: 0 (with warning on stderr)

# ── Glob Guard ──
# Should exit 2 (blocked — broad pattern at root)
echo '{"tool_input":{"pattern":"**/*.ts"}}' | node .claude/hooks/glob-guard.js
echo $?  # expect: 2

# Should exit 0 (allowed — scoped pattern)
echo '{"tool_input":{"pattern":"src/**/*.ts"}}' | node .claude/hooks/glob-guard.js
echo $?  # expect: 0
```

---

