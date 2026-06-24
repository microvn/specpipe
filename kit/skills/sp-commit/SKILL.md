---
description: |
  Stage changes, scan for secrets and debug code, generate conventional commit message.
  Use when asked to "commit", "commit changes", "tạo commit", "viết commit message",
  "stage and commit", or "git commit".
  Proactively invoke this skill (do NOT run git commit directly) when the user
  asks to commit changes — the secret scan and debug-code detection covers gaps
  that raw git commit skips.
  Output: conventional commit format — type(scope): description (feat, fix, docs,
  refactor, test, chore, perf, build, ci).
allowed-tools: Bash, AskUserQuestion
---
Stage, scan secrets, generate conventional commit message.

## Step 1 — Analyze (single compound command)

```bash
echo "=== STATUS ===" && \
git status --short 2>/dev/null && \
echo "=== DIFF STAT ===" && \
git diff --stat 2>/dev/null && \
git diff --cached --stat 2>/dev/null && \
echo "=== METRICS ===" && \
{ git diff --shortstat 2>/dev/null; git diff --cached --shortstat 2>/dev/null; } && \
echo "=== SECRETS ===" && \
(git diff 2>/dev/null; git diff --cached 2>/dev/null) | grep -ciE "(api[_-]?key|token|password|secret|private[_-]?key|credential|auth[_-]?token)" || echo "0" && \
echo "=== DEBUG ===" && \
(git diff 2>/dev/null; git diff --cached 2>/dev/null) | grep -ciE "(console\.log|debugger|print\(|TODO:.*remove|HACK:|FIXME:.*temp|binding\.pry|var_dump)" || echo "0"
```

---

## Step 2 — Safety checks

**Secrets (hard block):** If count > 0, show matched lines and STOP. Do not commit.

**Debug code (soft warn):** If count > 0, show matched lines. Use `AskUserQuestion` to confirm:

```json
{
  "questions": [
    {
      "question": "Found <N> debug statements (console.log, debugger, etc.) in the diff. Are these intentional?",
      "header": "Debug Code",
      "multiSelect": false,
      "options": [
        {"label": "Yes, intentional — proceed with commit"},
        {"label": "No, remove them first"}
      ]
    }
  ]
}
```

**Large diff:** If > 10 files or > 300 lines, use `AskUserQuestion` to confirm:

```json
{
  "questions": [
    {
      "question": "Large commit detected (<N> files, <M> lines). Large commits are harder to review and revert.",
      "header": "Large Commit",
      "multiSelect": false,
      "options": [
        {"label": "Proceed — commit everything as one"},
        {"label": "Split — I'll stage specific files myself"}
      ]
    }
  ]
}
```

---

## Step 3 — Stage files

Prefer staging specific files by name. Do NOT use `git add -A`.

Never stage: `.env`, credentials, build artifacts, generated files, binaries > 1MB.

---

## Step 4 — Generate commit message

**Format:** `type(scope): description`

| Type | When |
|------|------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `test` | Tests only |
| `refactor` | Code change, no behavior change |
| `chore` | Maintenance, deps, config |
| `perf` | Performance improvement |
| `build` | Build system |
| `ci` | CI/CD changes |

**Breaking changes:** If diff removes/renames a public function, export, or API endpoint → use `feat!` or `fix!` type, or add `BREAKING CHANGE:` footer.

**Story link (optional — only when the commit implements a spec story):** If the change maps to an `S-NNN` story (a `docs/specs/<feature>/.build-progress` exists, or the context/`$ARGUMENTS` names a story), add a footer line `Story: S-NNN`. This lets `/sp-build` find the commit on resume (`git log --grep`). Omit it entirely for ordinary commits — most commits have no story, and their format is unchanged.

```
feat(auth): add refresh-token rotation

Story: S-003
```

**Rules:** Subject under 72 chars (the `Story:` footer does not count toward the subject). Imperative tense ("add" not "added"). No period. WHAT+WHY, not HOW.

**Bad examples — avoid:**
- ❌ `Updated some files` — not descriptive
- ❌ `feat(auth): added login validation using bcrypt with salt rounds of 12` — too long, describes HOW
- ❌ `Fix bug` — not specific
- ❌ `WIP` — never commit unfinished work

---

## Step 5 — Commit

```bash
git commit -m "type(scope): description"
```

---

## Step 6 — Push?

Check if a remote exists:

```bash
git remote
```

If no remote → skip this step entirely.

If remote exists, use `AskUserQuestion`:

```json
{
  "questions": [
    {
      "question": "Commit successful. Push to remote now?",
      "header": "Push",
      "multiSelect": false,
      "options": [
        {"label": "Yes — push now (git push, or git push -u origin <branch> if no upstream)"},
        {"label": "No — push later"}
      ]
    }
  ]
}
```

If user chooses Yes → run `git push` (or `git push -u origin <branch>` if upstream not set).

---

## Output

```
staged: N files (+X/-Y lines)
checks: secrets ✓ | debug ✓
commit: abc1234 type(scope): description
pushed: yes → origin/<branch>  (or "no")
```

Keep under 5 lines. No explanations.

## Rules
1. **Specific files, not `git add -A`.** Stage intentionally.
2. **Secrets = hard block.** No exceptions.
3. **Ask before pushing.** Push only if user confirms in Step 6.
4. **One concern per commit.** Mixed features → suggest separate commits.
