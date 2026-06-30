# Automatic Guards (Hooks)

Hooks run automatically — you do not invoke them. They provide passive protection. Enforced (blocking) for Claude, Codex, Cursor, and Antigravity; advisory rules for OpenClaw and Hermes. `--hooks none` turns guardrails off; `--hooks <list>` picks a subset.

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

### Shell Guard (`specpipe-shell-guard.sh`)

**Trigger:** Before every shell command (Bash). The single shell guard for every agent —
it reads the command from `.tool_input.command` (Claude/Codex), `.command` (Cursor), or
`.tool_args.CommandLine` (Antigravity).
**Action:** (1) Blocks exploring large directories (node_modules, build artifacts, …).
(2) Flags secret access in commands (`.env`, keys, credentials) — `SECRET_POLICY=block`
(default, used by Codex/Cursor/Antigravity) denies; `SECRET_POLICY=warn` (Claude's wiring)
warns and allows so the user can approve.
**Blocking:** Yes — exit 2 (the portable block primitive).

**Default blocked paths:**
`node_modules`, `__pycache__`, `.git/objects`, `dist/`, `build/`, `.next/`, `vendor/`, `Pods/`, `.build/`, `DerivedData/`, `.gradle/`, `target/Debug|Release`, `.venv/`, `bin/Debug`, `.turbo/`, `.svelte-kit/`, … (and more)

**Configuration:**
```bash
export PATH_GUARD_EXTRA="\.terraform|\.vagrant|\.docker"   # extra blocked dir patterns
export SENSITIVE_GUARD_EXTRA="\.vault|.*_token\.json"      # extra secret patterns
export SECRET_POLICY=block                                 # block|warn (per-agent default differs)
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

### Read Guard (`specpipe-read-guard.sh`)

**Trigger:** Before every file Read/Write/Edit. Reads the path from `.tool_input.file_path`
(Claude/Codex) or `.file_path` (Cursor `beforeReadFile`).
**Action:** Blocks reads/writes of secret files: `.env`, private keys, credentials, tokens.
**Blocking:** Yes — exit 2. (Secret access *in shell commands* is handled by the shell
guard above, where Claude's `SECRET_POLICY=warn` enables the ask-then-`cat .env` approval flow.)

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

### Testing Hooks Manually

You can test hooks by piping mock JSON payloads:

```bash
# ── Shell Guard ── (dirs + secret access in commands)
# Should exit 2 (blocked)
echo '{"tool_input":{"command":"ls node_modules"}}' | bash .claude/hooks/specpipe-shell-guard.sh
echo $?  # expect: 2

# Should exit 0 (allowed)
echo '{"tool_input":{"command":"ls src"}}' | bash .claude/hooks/specpipe-shell-guard.sh
echo $?  # expect: 0

# Secret in command: block by default, warn (exit 0) under Claude's SECRET_POLICY=warn
echo '{"tool_input":{"command":"cat .env"}}' | bash .claude/hooks/specpipe-shell-guard.sh; echo $?  # expect: 2
echo '{"tool_input":{"command":"cat .env"}}' | SECRET_POLICY=warn bash .claude/hooks/specpipe-shell-guard.sh; echo $?  # expect: 0 (warning on stderr)

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

# ── Read Guard ── (secret file reads)
# Should exit 2 (blocked)
echo '{"tool_input":{"file_path":".env"}}' | bash .claude/hooks/specpipe-read-guard.sh
echo $?  # expect: 2

# Should exit 0 (allowed)
echo '{"tool_input":{"file_path":".env.example"}}' | bash .claude/hooks/specpipe-read-guard.sh
echo $?  # expect: 0

# ── Glob Guard ──
# Should exit 2 (blocked — broad pattern at root)
echo '{"tool_input":{"pattern":"**/*.ts"}}' | node .claude/hooks/glob-guard.js
echo $?  # expect: 2

# Should exit 0 (allowed — scoped pattern)
echo '{"tool_input":{"pattern":"src/**/*.ts"}}' | node .claude/hooks/glob-guard.js
echo $?  # expect: 0
```

---

