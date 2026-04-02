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

**Debug code (soft warn):** If count > 0, show matched lines. Proceed only after user confirms they're intentional.

**Large diff:** If > 10 files or > 300 lines, note: "Large commit — consider splitting for easier review." Continue unless user says to split.

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

**Rules:** Under 72 chars. Imperative tense ("add" not "added"). No period. WHAT+WHY, not HOW.

**Bad examples — avoid:**
- ❌ `Updated some files` — not descriptive
- ❌ `feat(auth): added login validation using bcrypt with salt rounds of 12` — too long, describes HOW
- ❌ `Fix bug` — not specific
- ❌ `WIP` — never commit unfinished work

---

## Step 5 — Commit

```bash
git commit -m "$(cat <<'EOF'
type(scope): description

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

**Do NOT push** unless user explicitly asks.

---

## Output

```
staged: N files (+X/-Y lines)
checks: secrets ✓ | debug ✓
commit: abc1234 type(scope): description
pushed: no
```

Keep under 5 lines. No explanations.

## Rules
1. **Specific files, not `git add -A`.** Stage intentionally.
2. **Secrets = hard block.** No exceptions.
3. **Never push without explicit request.**
4. **One concern per commit.** Mixed features → suggest separate commits.
