Pre-merge code review — security, correctness, spec alignment.

## Phase 0: Understand Intent

1. Read commit messages:
   ```
   BASE=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||') || BASE="main"
   git log --oneline "$BASE"...HEAD
   ```
2. Check for spec in `docs/specs/<feature>/<feature>.md` — review against INTENT.
3. Read the diff: `git diff "$BASE"...HEAD`

If `$ARGUMENTS` provided → scope to those files only.
If diff > 500 lines → review file-by-file, prioritize by smart focus below.

---

## Phase 1: Smart Focus

Auto-detect primary focus from diff content:

| Diff contains | Focus heavily on |
|--------------|-----------------|
| auth, login, token, session, password, JWT | Security — full depth |
| SQL, query, database, migration | Injection + data integrity |
| API, endpoint, route, controller, handler | Input validation + error handling |
| .env, config, secret, key, credential | Secret exposure |
| Test files only | Test quality (skip security deep-dive) |
| Docs/comments only | Accuracy only (minimal review) |
| Payment, billing, transaction | Correctness + idempotency |

Spend 60% of analysis on the primary focus. Cover all categories, but proportionally.

---

## Phase 2: Checklist

### Security (Critical)
- **Injection:** Search diff for string concatenation in SQL/shell/HTML. Look for `${var}` in queries, `.innerHTML`, template literals in SQL. Flag any user input reaching a query without parameterization.
- **Auth/Authz:** New endpoint → has auth middleware? Can user A access user B's data? ID in URL without ownership check?
- **Secrets:** Hardcoded strings matching `sk-`, `ghp_`, `Bearer `, long base64. New env vars committed?
- **Error exposure:** Catch blocks sending raw errors to users? Stack traces, file paths, DB schemas in responses?
- **Dependencies:** New packages — maintained? >1000 weekly downloads? Known CVEs?

### Correctness (High)
- **Logic vs intent:** Does the code do what commits/spec claim? "Add validation" but code just logs?
- **Edge cases:** null, empty, 0, negative, MAX_INT, unicode, very long strings — handled?
- **Error handling:** For each try/catch — error logged with context? User shown safe message? Resources cleaned in finally?
- **Concurrency:** Shared state without locks? Read-then-write without atomicity? Non-atomic DB updates?
- **Null safety:** Optionals used without guards? `object!.property` without nil check?

### Spec-Test Alignment (Medium)
- Source changed but no spec update in `docs/specs/<feature>/`? → flag
- Source changed but no test update? → flag
- Spec changed but acceptance scenarios or tests not updated? → flag
- Code removed but dead tests remain? → flag
- Spec contains vague requirements without metrics ("fast", "secure", "easy", "scalable")? → flag with suggestion to add SC-NNN with concrete numbers
- **AS-to-test name check:** Read the spec's `## Stories` section. For each AS-NNN, check if a test file contains a test named or described with that AS ID or its short description. Flag:
  - AS in spec with no matching test → "AS-NNN: \<description\> has no corresponding test"
  - Test referencing an AS-NNN that no longer exists in the spec → "Test references removed AS-NNN"
  Keep this lightweight — match on AS-NNN identifiers and story name substrings, not semantic analysis.

### Code Quality (Medium)
- Dead code: removed functions still imported elsewhere?
- Obvious duplication: copy-pasted blocks that should be shared?
- Naming: consistent with codebase? Descriptive?
- Complexity: functions > 40 lines or > 3 nesting levels?

### Performance (Low)
- Flag N+1 queries, unbounded collections, redundant computation in loops.

---

## Phase 3: Output

```markdown
## Code Review: <branch or description>

**Scope:** X files, +Y/-Z lines
**Focus:** <auto-detected>
**Verdict:** APPROVE / REQUEST CHANGES / NEEDS DISCUSSION

### Critical Issues
**[C-1] file.ts:42 — SQL injection via unsanitized input**
`req.query.search` concatenated into SQL. Use parameterized query.

### High Priority
**[H-1] file.ts:87 — Empty catch swallows DB errors**
Users see blank screen. Log with context, return safe error.

### Medium Priority
**[M-1] Spec-test gap — rate limiting not in spec**
New logic at auth-service.ts:45-62 undocumented.

### Low Priority
**[L-1] Consider caching config lookup (called 3x per request)**

### Positive Notes
(At least 1 — reinforce good patterns)
- Clean middleware separation in auth-middleware.ts
- Thorough edge case tests

### Summary
<1-2 sentences: quality + clear next action>
```

## Rules
1. **Never auto-fix.** Report only.
2. **Specific.** Every finding has `file:line` and concrete description.
3. **Severity matches impact.** Style nits = Low. Injection = Critical.
4. **Positive notes mandatory.** Reviews aren't just about problems.
5. **Review against intent.** Not just "clean code?" but "does this match spec/commits?"
6. **Proportional.** 5-line doc change ≠ 500-line auth rewrite.
