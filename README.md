# Dev Kit — Team Guide

A lightweight, spec-first development toolkit for [Claude Code](https://claude.ai/code). It enforces the cycle **spec → test plan → code + tests → build pass** through custom commands, automatic hooks, and a universal test runner.

**Works with:** Swift, TypeScript/JavaScript, Python, Rust, Go, Java/Kotlin, C#, Ruby.
**Dependencies:** None (requires only Claude Code CLI, Node.js, Git, and Bash).

---

## Table of Contents

1. [Philosophy](#1-philosophy)
2. [Quick Start](#2-quick-start)
3. [Setup](#3-setup)
4. [Daily Workflows](#4-daily-workflows)
5. [Commands Reference](#5-commands-reference)
6. [Automatic Guards (Hooks)](#6-automatic-guards-hooks)
7. [Build Test Script](#7-build-test-script)
8. [Specs & Test Plans Format](#8-specs--test-plans-format)
9. [Customization](#9-customization)
10. [Token Cost Guide](#10-token-cost-guide)
11. [Troubleshooting](#11-troubleshooting)
12. [FAQ](#12-faq)

---

## 1. Philosophy

### The Core Cycle

```
SPEC → TEST PLAN → CODE + TESTS → BUILD PASS
```

Every code change — feature, fix, or removal — follows this cycle. The spec is the source of truth. If code contradicts the spec, the code is wrong.

### Why Spec-First?

- **Prevents drift.** Without a spec, code becomes the only documentation and diverges from intent over time.
- **Tests have purpose.** Test plans derived from specs test behavior, not implementation details. This means tests survive refactoring.
- **AI writes better code.** When Claude Code has a spec to reference, it generates more accurate implementations and more meaningful tests.
- **Reviews are grounded.** Reviewers can check code against the spec rather than guessing at intent.

### Principles

1. **Specs are source of truth** — Code changes require spec updates first.
2. **Incremental, not big-bang** — Test after each code chunk, not after everything is done.
3. **Tests travel with code** — Every PR includes production code + tests + spec updates.
4. **Build pass is the gate** — Nothing merges with failing tests.
5. **Everything in the repo** — Specs, plans, tests, and code are version-controlled and reviewable.

---

## 2. Quick Start

**Time needed: 5 minutes.**

```bash
# 1. Install dev-kit into your project
npx claude-devkit-cli init .

# 2. Open your project in Claude Code
claude

# 3. Create your first spec and test plan
/plan "describe your feature here"

# 4. Write code, then test
/test

# 5. Review before merging
/review

# 6. Commit
/commit
```

That's it. The CLI auto-detects your project type and configures everything.

---

## 3. Setup

### Prerequisites

| Tool | Required | Why |
|------|----------|-----|
| **Claude Code CLI** | Yes | Runs the commands and hooks |
| **Git** | Yes | Change detection, commit workflow |
| **Node.js** (18+) | Yes | File guard hook, JSON parsing |
| **Bash** (4+) | Yes | Path guard hook, build-test script |
| **Language toolchain** | Yes | Whatever your project uses (Swift, npm, pytest, etc.) |

### Installation

**Option A: One-command install** (recommended)

```bash
npx claude-devkit-cli init .
```

**Option B: Global install**

```bash
npm install -g claude-devkit-cli

# Then, in any project:
cd my-project
claude-devkit init .
```

**Option C: Force re-install** (overwrites existing files)

```bash
npx claude-devkit-cli init --force .
```

**Option D: Selective install** (only specific components)

```bash
npx claude-devkit-cli init --only hooks,commands .
```

### What Gets Installed

```
your-project/
├── .claude/
│   ├── CLAUDE.md              ← Project rules hub
│   ├── settings.json          ← Hook wiring
│   ├── hooks/
│   │   ├── file-guard.js      ← Warns on large files
│   │   ├── path-guard.sh      ← Blocks wasteful Bash paths
│   │   ├── glob-guard.js      ← Blocks broad glob patterns
│   │   ├── comment-guard.js   ← Blocks placeholder comments
│   │   ├── sensitive-guard.sh ← Blocks access to secrets
│   │   └── self-review.sh     ← Quality checklist on stop
│   └── commands/
│       ├── plan.md            ← /plan command
│       ├── test.md            ← /test command
│       ├── fix.md             ← /fix command
│       ├── review.md          ← /review command
│       ├── commit.md          ← /commit command
│       └── challenge.md       ← /challenge command
├── scripts/
│   └── build-test.sh          ← Universal test runner
└── docs/
    ├── specs/                 ← Your specs go here
    ├── test-plans/             ← Generated test plans
    └── WORKFLOW.md            ← Process reference
```

### Post-Install Configuration

The CLI auto-detects your project type and fills in `CLAUDE.md`. Verify it's correct:

```bash
cat .claude/CLAUDE.md
```

Look for the **Project Info** section. Ensure language, test framework, and directories are correct. Edit manually if needed.

### Upgrade

```bash
npx claude-devkit-cli upgrade
```

Smart upgrade — updates kit files but preserves any you've customized. Use `--force` to overwrite everything.

```bash
# Check if update is available
npx claude-devkit-cli check

# See what changed
npx claude-devkit-cli diff

# View installed files and status
npx claude-devkit-cli list
```

### Uninstall

```bash
npx claude-devkit-cli remove
```

This removes hooks, commands, settings, and build-test.sh. It preserves `CLAUDE.md` (which you may have customized) and `docs/` (which contains your specs and plans).

---

## 4. Daily Workflows

### New Feature

> When: Building something new — no existing code or spec.

```
1. /plan "description of the feature"
   → Generates spec + test plan. Review both.

2. Implement code in chunks.
   After each chunk: /test
   Repeat until green.

3. /review (before merge)

4. /commit
```

**Example:**
```
/plan "User authentication with email/password login, password reset via email, and session management with 24h expiry"
```

### Update Existing Feature

> When: Changing behavior of something that already exists.

```
1. Edit the spec first: docs/specs/<feature>.md

2. /plan docs/specs/<feature>.md
   → Updates the test plan with new/modified/removed cases.

3. Implement the code change.
   /test
   Fix until green.

4. /review → /commit
```

### Bug Fix

> When: Something is broken.

```
1. /fix "description of the bug"
   → Writes failing test → fixes code → runs full suite.

2. /commit
```

**Example:**
```
/fix "Search returns no results when query contains apostrophes like O'Brien"
```

### Remove Feature

> When: Deleting code, removing deprecated functionality.

```
1. Mark spec sections as removed in docs/specs/<feature>.md

2. Delete production code + related tests.

3. bash scripts/build-test.sh (run full suite)
   Fix cascading breaks.

4. /commit
```

---

## 5. Commands Reference

### /plan — Generate Spec + Test Plan

**Usage:**
```
/plan docs/specs/auth.md                    # Mode A: from existing spec
/plan "user authentication with OAuth2"     # Mode B: from description
/plan docs/specs/auth.md (after spec edit)  # Mode C: update existing plan
```

**Modes:**
- **Mode A** — Reads an existing spec, generates a test plan.
- **Mode B** — Drafts a spec from your description, asks for confirmation, then generates the test plan.
- **Mode C** — Updates an existing spec + test plan when requirements change.

**How it works:**

1. **Phase 0: Codebase Awareness** — Scans existing code, `docs/specs/`, `docs/test-plans/`, and project patterns before planning. Prevents plans that conflict with existing implementations.
2. **Phase 1: Write/Update Spec** — Generates a structured spec with sections: Overview, Data Model, Use Cases, State Machine, Constraints & Invariants, Error Handling, Security Considerations. Depth is proportional to complexity — simple CRUD gets 1 paragraph + 3 use cases, complex auth gets the full template.
3. **Phase 2: Clarify Ambiguities** — Systematically finds gaps across behavioral, data, auth, non-functional, integration, and concurrency dimensions. Asks 3-5 targeted questions with 2-4 options each before proceeding. If the spec is clear and complete, 0 questions is valid.
4. **Phase 3: Generate Test Plan** — Derives test cases from the spec (never from code).

**Traceability IDs:** Every requirement gets a traceable ID:
- `UC-NNN` — Use Cases
- `FR-NNN` — Functional Requirements
- `SC-NNN` — Security Constraints
- `TC-NNN` — Test Cases (each must reference at least one FR or SC)

**Test plan table format:**

| ID | Priority | Type | UC | FR/SC | Description | Expected |
|----|----------|------|----|-------|-------------|----------|
| TC-001 | P0 | unit | UC-001 | FR-001 | ... | ... |

Priorities: **P0** (must have), **P1** (should have), **P2** (nice to have).

**Output:**
- Spec: `docs/specs/<feature>.md`
- Test plan: `docs/test-plans/<feature>.md`

### /test — Write + Run Tests

**Usage:**
```
/test                              # test all changes vs base branch
/test src/api/users.ts             # test specific file
/test "user authentication"        # test specific feature
```

**How it works:**

1. **Phase 0: Build Context** — Finds changed files vs base branch, reads matching test plan/spec, reads existing tests for patterns, fixtures, and naming conventions. Doesn't duplicate what already exists.
2. **Phase 1: Write Tests** — Creates or updates tests based on the test plan. Each test covers one concept, is independent, deterministic (no random, no time-dependent, no external calls), and has a clear name.
3. **Phase 2: Compile First** — Runs typecheck/compile before executing tests. Catches syntax errors early.
4. **Phase 3: Run Tests** — Executes the test suite.
5. **Phase 4: Fix Loop** — If tests fail, fixes **test code only** (max 3 attempts, then hard stop and report). If tests expect X but code does Y, asks you whether to fix production code or adjust the test.
6. **Phase 5: Report** — Summary with test counts, results, coverage, and files touched.

**Rules:**
- Never changes production code without asking first
- Never deletes or weakens existing tests
- Never adds `skip`/`xit`/`@disabled` to hide failures
- Max 3 fix attempts — then stops and reports the issue

**What NOT to test:** Private/internal methods, framework behavior, trivial getters/setters, implementation details.

### /fix — Test-First Bug Fix

**Usage:**
```
/fix "description of the bug"
```

**How it works:**

1. **Phase 0: Investigate** — Parses the bug report, locates relevant code, checks git history (`git log` + `git blame`), forms a hypothesis with evidence: *"I believe the bug is caused by [X] in [file:function] because [evidence]."* If the bug is in a dependency/config/data (not our code), reports that before proceeding.
2. **Phase 1: Write Failing Test** — Creates a regression test that reproduces the bug. Test includes a comment: `// Regression: <bug description> — <expected> vs <actual>`.
3. **Phase 2: Confirm Failure** — Runs the test to verify it fails for the right reason.
4. **Phase 3: Fix** — Minimal change to production code. If other tests break, the fix is wrong — never weakens existing tests.
5. **Phase 4: Root Cause Analysis** — Documents: Symptom, Root cause, Gap (why wasn't this caught earlier?), Prevention (suggests one: type constraint, validation, lint rule, spec update, or test plan update). Non-optional for serious bugs; for trivial bugs, the fix summary is enough.
6. **Phase 5: Full Suite** — Runs all tests to catch regressions.

**Multiple bugs:** Triages by severity, fixes one at a time, commits each separately.

### /review — Pre-Merge Quality Gate

**Usage:**
```
/review                            # review all changes vs base branch
/review src/auth/                  # review specific directory
```

**How it works:**

1. **Phase 0: Understand Intent** — Reads commit messages and checks for related spec/test plan. Understands *why* the change was made before reviewing *how*.
2. **Phase 1: Smart Focus** — Auto-detects what to focus on based on the diff:

   | Diff contains | Focus on |
   |---------------|----------|
   | Auth/session code | Security, token handling, permission checks |
   | SQL/queries | Injection, parameterization, N+1 queries |
   | API endpoints | Input validation, error responses, rate limiting |
   | `.env`/config | Secrets exposure, environment handling |
   | Tests only | Test quality, coverage gaps, flaky patterns |
   | Payment/billing | Financial accuracy, idempotency, audit trails |

3. **Phase 2: Review** — Checks security, correctness, null safety, spec-test alignment, and code quality. Spends 60% of analysis on the primary focus area. Looks for specific patterns: `${var}` in queries, `.innerHTML`, template literals in SQL, optionals without guards.
4. **Phase 3: Report** — Structured report with severity tiers (Critical/High/Medium/Low).

**Proportional review:** A 5-line doc change gets a light review. A 500-line auth rewrite gets file-by-file deep analysis. Diffs >500 lines get a note suggesting to split the commit.

**Verdicts:** APPROVE / REQUEST CHANGES / NEEDS DISCUSSION (three options, not binary).

**Rules:**
- At least 1 positive note — reinforces good patterns, not just problems
- Never auto-fixes code — report only
- Checks spec-test alignment: code changed → spec/tests also changed? Vague requirements without metrics ("fast", "secure") get flagged with a suggestion to add concrete numbers

### /commit — Smart Git Commit

**Usage:**
```
/commit
```

**How it works:**

1. **Analyze** — Scans `git status`, diff stats, and file contents in one pass.
2. **Scan for secrets** — Matches patterns: `api_key`, `token`, `password`, `secret`, `private_key`, `credential`, `auth_token`. **Hard block** — stops immediately if found, non-negotiable.
3. **Scan for debug code** — Matches: `console.log`, `debugger`, `print()`, `TODO:remove`, `HACK:`, `FIXME:temp`, `binding.pry`, `var_dump`. **Soft warn** — proceeds if you confirm.
4. **Stage files** — Stages specific files by name. Never uses `git add -A`.
5. **Generate message** — Conventional format: `type(scope): description`. Imperative tense ("add" not "added"), no period, WHAT+WHY not HOW.
6. **Commit** — Does NOT push (safe default). Ask Claude explicitly to push.

**Large diff warning:** If >10 files OR >300 lines changed, suggests splitting into smaller commits for easier review.

**Never stages:** `.env`, credentials, build artifacts, generated files, binaries >1MB.

**Breaking changes:** If the diff removes/renames a public function, export, or API endpoint, uses `feat!` or `fix!` type, or adds a `BREAKING CHANGE:` footer.

### /challenge — Adversarial Plan Review

**Usage:**
```
/challenge docs/test-plans/auth.md   # challenge a test plan
/challenge docs/specs/auth.md        # challenge a spec
/challenge "user authentication"     # challenge by feature name
```

**How it works (7 phases):**

1. **Read & Map** — Reads the plan/spec and maps: decisions made, assumptions (stated AND implied), dependencies, scope boundaries, risk acknowledgments, spec-plan consistency.
2. **Scale Reviewers** — Assesses complexity and selects reviewers:

   | Complexity | Signals | Reviewers |
   |------------|---------|-----------|
   | Simple | 1 spec section, <20 test cases, no auth/data | 2 |
   | Standard | Multiple sections, auth or data involved | 3 |
   | Complex | Multiple integrations, concurrency, migrations, 6+ phases | 4 |

3. **Spawn Reviewers** — Launches parallel subagents, each with an adversarial lens:

   - **Security Adversary**
     - OWASP Top 10
     - Injection vectors
     - Auth/authz bypass
     - Crypto issues
     - Data exposure
     - Supply chain risks

   - **Failure Mode Analyst** — *"Everything that can go wrong, will — simultaneously, at 3 AM, during peak traffic"*
     - Partial failures
     - Concurrency & race conditions
     - Cascading failures
     - Recovery paths
     - Idempotency
     - Observability gaps

   - **Assumption Destroyer** — *"'It should work' is not evidence"*
     - Unverified claims
     - Scale assumptions
     - Environment differences
     - Integration contracts
     - Data shape assumptions
     - Timing dependencies
     - Hidden dependencies

   - **Scope & YAGNI Critic** — *"The best code is no code. The best feature is the one you didn't build"*
     - Over-engineering
     - Premature abstraction
     - Missing MVP cuts
     - Gold plating
     - Simpler alternatives

4. **Deduplicate & Rate** — Collects all findings, removes duplicates, rates severity using a Likelihood x Impact matrix. Caps at 15 findings: keeps all Critical, top High by specificity, notes how many Medium were dropped. Each reviewer is limited to top 7 findings.

5. **Adjudicate** — Evaluates each finding: Accept (valid flaw, plan should change) or Reject (false positive, acceptable risk, already handled). 1-sentence rationale for each.

6. **User Choice** — Two modes: "Apply all accepted" (fast) or "Review each" (walk through one by one).

7. **Apply** — Surgical edits only to accepted findings. Doesn't rewrite surrounding sections.

**Finding format:** Each finding includes Title, Severity, Location, Flaw description, Evidence (direct quote from the plan), step-by-step Failure scenario, and Suggested fix.

**6 non-negotiable rules:**
1. Spawn reviewers in parallel (not sequential)
2. Reviewers read files directly, not summarized content
3. Be hostile — no praise, no softening
4. Every finding must quote the plan directly as evidence
5. Quality over quantity — 3 honest findings > 15 padded ones
6. Skip style/formatting — substance only

**When to use:**
- After `/plan`, before coding — for complex features
- Features involving auth, payments, data pipelines, multi-service integration
- NOT needed for simple CRUD, small bug fixes, or trivial features

**Token cost:** 15-30k (uses parallel subagents, doesn't bloat main context)

---

## 6. Automatic Guards (Hooks)

Hooks run automatically — you don't invoke them. They provide passive protection.

### File Guard (`file-guard.js`)

**Trigger:** After every Write or Edit operation.
**Action:** If the modified file exceeds 200 lines, injects a warning suggesting modularization.
**Blocking:** No — warns only, does not prevent the edit.

**Configuration:**
```bash
# Change the line threshold (default: 200)
export FILE_GUARD_THRESHOLD=300

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

## 7. Build Test Script

### Usage

```bash
bash scripts/build-test.sh                    # run all tests
bash scripts/build-test.sh --filter "Auth"    # filter by pattern
bash scripts/build-test.sh --list             # show detected project type
bash scripts/build-test.sh --ci               # machine-readable output
bash scripts/build-test.sh --help             # show usage
```

### Supported Languages

| Language | Detected By | Test Command |
|----------|-------------|-------------|
| Swift (SPM) | `Package.swift` | `swift test` |
| Swift (Xcode) | `*.xcworkspace` / `*.xcodeproj` | `xcodebuild test` |
| Node (Vitest) | `vitest.config.*` or vitest in `package.json` | `npx vitest run` |
| Node (Jest) | `jest.config.*` or jest in `package.json` | `npx jest` |
| Python (pytest) | `pyproject.toml`, `setup.py`, `pytest.ini` | `python3 -m pytest` |
| Rust | `Cargo.toml` | `cargo test` |
| Go | `go.mod` | `go test -race ./...` |
| Java (Gradle) | `build.gradle` / `build.gradle.kts` | `./gradlew test` |
| Java (Maven) | `pom.xml` | `mvn test` |
| C# (.NET) | `*.sln` / `*.csproj` | `dotnet test` |
| Ruby (RSpec) | `Gemfile` with rspec | `bundle exec rspec` |
| Ruby (Minitest) | `Gemfile` without rspec | `bundle exec rake test` |

Detection order: first match wins. The script also detects package managers (pnpm, bun) for Node projects.

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All tests passed |
| 1 | Tests failed |
| 2 | No project detected or missing tooling |

### CI Integration

```yaml
# GitHub Actions example
- name: Run tests
  run: bash scripts/build-test.sh --ci
```

### Adding a New Language

Edit `scripts/build-test.sh`:
1. Add a `detect_<language>()` function
2. Add it to the `DETECTORS` array
3. The function should set `LANG_NAME` and `TEST_CMD`

---

## 8. Specs & Test Plans Format

### Business Logic Spec Template

Create specs at `docs/specs/<feature-name>.md`:

```markdown
# Spec: <Feature Name>

## Overview
What this feature does, why it exists, who uses it. 2-3 sentences.

## Data Model
Entities, attributes, relationships (table format).

## Use Cases

### UC-001: <Name>
- **Actor:** User / System
- **Preconditions:** ...
- **Flow:** 1. ... 2. ...
- **Postconditions:** ...
- **Error cases:** ...

## Settings / Configuration
Configurable behavior and defaults.

## Constraints & Invariants
Rules that must always hold.

## Error Handling
How errors surface to users and are logged.

## Security Considerations
Auth, authorization, data sensitivity.
```

Skip sections that don't apply. Match depth to feature complexity.

### Test Plan Format

Generated by `/plan` at `docs/test-plans/<feature-name>.md`:

```markdown
# Test Plan: <Feature Name>

**Spec:** docs/specs/<feature-name>.md
**Generated:** 2026-04-01

## Test Cases

| ID | Priority | Type | UC | FR/SC | Description | Expected |
|----|----------|------|----|-------|-------------|----------|
| TC-001 | P0 | unit | UC-001 | FR-001 | Valid login returns token | 200 + JWT |
| TC-002 | P0 | unit | UC-001 | FR-002 | Wrong password returns 401 | 401 + error msg |
| TC-003 | P1 | integration | UC-002 | FR-003 | Session expires after 24h | Auto-logout |

## Coverage Notes
- Highest risk areas: ...
- Edge cases needing attention: ...
```

### Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Spec file | `<feature-name>.md` in `docs/specs/` | `user-auth.md` |
| Test plan | Same name as spec, in `docs/test-plans/` | `user-auth.md` |
| Test case ID | `TC-NNN` sequential | `TC-001`, `TC-042` |
| Priority | `P0` (critical), `P1` (important), `P2` (nice-to-have) | — |
| Type | `unit`, `integration`, `e2e`, `snapshot`, `performance` | — |

---

## 9. Customization

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FILE_GUARD_THRESHOLD` | `200` | Max lines before file guard warns |
| `FILE_GUARD_EXCLUDE` | _(empty)_ | Comma-separated globs to skip (e.g. `*.generated.swift`) |
| `PATH_GUARD_EXTRA` | _(empty)_ | Additional pipe-separated patterns to block (e.g. `\.terraform`) |
| `SENSITIVE_GUARD_EXTRA` | _(empty)_ | Additional pipe-separated patterns for sensitive files (e.g. `\.vault`) |
| `SELF_REVIEW_ENABLED` | `true` | Set to `false` to disable the self-review checklist on Stop |

Set these in your shell profile or project `.envrc` (if using direnv).

### Extending CLAUDE.md

Add project-specific rules to `.claude/CLAUDE.md`:

```markdown
## Project-Specific Rules

- All API endpoints must have OpenAPI annotations
- Database migrations must be reversible
- UI components must support dark mode
- All strings must be localized via i18n keys
```

### Adding Custom Commands

Create new `.md` files in `.claude/commands/`:

```markdown
# .claude/commands/deploy.md

Run the deployment pipeline:
1. /review
2. /commit
3. Run: bash scripts/deploy.sh $ARGUMENTS
4. Verify deployment health: curl -f https://api.example.com/health
```

Then use: `/deploy staging`

---

## 10. Token Cost Guide

| Activity | Tokens | Frequency |
|----------|--------|-----------|
| `/test` (incremental, 1-3 files) | 5–10k | Every code chunk |
| `/fix` (single bug) | 3–5k | As needed |
| `/commit` | 2–4k | Every commit |
| `/review` (diff-based) | 10–20k | Before merge |
| `/plan` (new feature) | 20–40k | Start of feature |
| `/challenge` (adversarial review) | 15–30k | After /plan, complex features |
| Full audit (manual prompt) | 100k+ | Before release |

### Minimizing Token Usage

- **Test incrementally.** `/test` after each small chunk uses 5-10k. Waiting until everything is done then running `/test` on a large diff uses 50k+.
- **Use filters.** `/test src/auth/login.ts` is cheaper than `/test` on the whole project.
- **Skip `/plan` for tiny changes.** Under 5 lines with no behavior change? Just `/test` and `/commit`.
- **Use `/review` only before merge.** Not after every commit.

---

## 11. Troubleshooting

### Hook not firing

**Symptom:** File guard or path guard doesn't trigger.

**Check:**
1. Is `settings.json` valid? `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf-8'))"`
2. Are hooks executable? `ls -la .claude/hooks/`
3. Is Node.js available? `node --version`
4. Is `$CLAUDE_PROJECT_DIR` set? Check in Claude Code with: `echo $CLAUDE_PROJECT_DIR`

### Tests not detected

**Symptom:** `build-test.sh` says "No supported project detected."

**Check:**
1. Are you in the project root? `pwd`
2. Does the project marker file exist? (e.g., `package.json`, `Cargo.toml`)
3. Run `bash scripts/build-test.sh --list` for diagnostic output.

### Wrong base branch

**Symptom:** `/test` or `/review` compares against wrong branch.

**Check:**
```bash
git symbolic-ref refs/remotes/origin/HEAD
```

If this is wrong or missing:
```bash
git remote set-head origin <your-main-branch>
```

### Path guard blocking a legitimate command

**Symptom:** Claude can't run a command you need.

**Fix:** The path guard blocks broad patterns. If you need to access `build/` for a specific reason, run the command directly in your terminal (not through Claude Code).

### File guard warning on generated files

**Fix:** Set the exclude pattern:
```bash
export FILE_GUARD_EXCLUDE="*.generated.swift,*.pb.go,*.min.js,*.snap"
```

---

## 12. FAQ

**Q: Do I need specs for every tiny change?**
A: No. Changes under 5 lines with no behavior change can skip the spec. Just `/test` and `/commit`. The spec-first rule is for meaningful behavior changes.

**Q: Can I use mocks in tests?**
A: Only for external services you can't run locally (third-party APIs, email services). Never mock your own code or database just to make tests pass faster.

**Q: What if Claude writes a test that tests the wrong thing?**
A: This usually means the spec is ambiguous. Clarify the spec first, then re-run `/test`. Good specs produce good tests.

**Q: Can I use this with other AI coding tools?**
A: The commands and hooks are Claude Code-specific. The specs, test plans, workflow, and `build-test.sh` work with any tool or manual workflow.

**Q: When should I use `/challenge`?**
A: After `/plan`, for complex features involving authentication, payments, data pipelines, or multi-service integration. It spawns parallel hostile reviewers that find security holes, failure modes, and false assumptions BEFORE you write code. Skip it for simple CRUD or small features — the overhead isn't worth it.

**Q: How do I do a full coverage audit?**
A: This is intentionally not a command (it's expensive and rare). When needed, prompt Claude directly: "Audit test coverage for feature X against docs/test-plans/X.md. Identify gaps and write missing tests."

**Q: What if my project uses multiple languages?**
A: `build-test.sh` detects the first match. For monorepos, you may need to run it from each sub-project directory or customize the script.

**Q: Can I add more commands?**
A: Yes. Drop a `.md` file in `.claude/commands/` and it becomes available as a slash command. See [Customization](#9-customization).

**Q: How do I update the kit in existing projects?**
A: Run `npx claude-devkit-cli upgrade`. It automatically detects which files you've customized and only updates unchanged files. Use `--force` to overwrite everything.

**Q: I installed with the old setup.sh — how do I migrate?**
A: Run `npx claude-devkit-cli init --adopt .` to generate a manifest from your existing files without overwriting anything. Future upgrades will then work normally.
