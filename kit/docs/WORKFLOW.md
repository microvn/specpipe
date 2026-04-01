# Development Workflow Reference

> Spec-first development: every change follows SPEC → TEST PLAN → CODE + TESTS → BUILD PASS.

---

## 1. Four Workflow Types

### New Feature

When: Building something that doesn't exist yet (no code, no spec).

```
Step 1 → /plan "description of feature"
          Generates: docs/specs/<feature>.md (spec)
                     docs/test-plans/<feature>.md (test plan)
          Answers validation questions about assumptions.
          Review both before proceeding.

Step 2 → (Optional) /challenge docs/test-plans/<feature>.md
          Adversarial review: spawns hostile reviewers to find flaws.
          Recommended for complex features, auth, data pipelines.
          Skip for simple CRUD or small features.

Step 3 → Implement in chunks. After each chunk:
          /test
          Repeat until chunk is green.

Step 4 → /review (before merge)

Step 5 → /commit
```

### Update Existing Feature

When: Changing behavior, adding options, refactoring logic.

```
Step 1 → Update spec FIRST: docs/specs/<feature>.md
          Describe what's changing and why.

Step 2 → /plan docs/specs/<feature>.md
          Updates the test plan with new/modified/removed test cases.

Step 3 → Implement code changes.
          /test
          Fix until green.

Step 4 → /review → /commit
```

### Bug Fix

When: Something is broken and needs fixing.

```
Step 1 → /fix "description of the bug"
          Writes failing test → fixes code → confirms green → runs full suite.

Step 2 → /commit

Optional → If the bug reveals an undocumented edge case, update the spec.
```

### Remove Feature

When: Deleting a feature, removing deprecated code.

```
Step 1 → Mark spec sections as removed in docs/specs/<feature>.md
          (Or archive the entire file if the feature is fully removed.)

Step 2 → Delete production code and related test code.

Step 3 → Run full test suite: bash scripts/build-test.sh
          Fix any cascading breakage.

Step 4 → /commit
```

---

## 2. Decision Tree

Use this to decide which workflow to follow:

```
Is this a brand new feature (no existing spec or code)?
├─ Yes → New Feature workflow. Start with /plan.
│   └─ Is the feature complex (auth, data pipeline, multi-service)?
│       ├─ Yes → Run /challenge after /plan, before coding.
│       └─ No → Skip /challenge, go straight to implementation.
└─ No
    ├─ Is this a bug fix?
    │   ├─ Yes → Bug Fix workflow. Start with /fix.
    │   └─ No
    │       ├─ Are you removing/deprecating code?
    │       │   ├─ Yes → Remove Feature workflow.
    │       │   └─ No → Update Feature workflow. Start by editing the spec.
    │       │
    │       └─ Is the change very small (< 5 lines, behavior unchanged)?
    │           └─ Yes → Skip spec update. Just /test and /commit.
```

---

## 3. Prompt Templates

Copy-paste these when working with Claude Code.

### Template A — Implement + Test Together

```
I just implemented [brief description].
Files changed: [list files]

Based on:
- Spec: docs/specs/<feature>.md (section §X)
- Test plan: docs/test-plans/<feature>.md

Write tests for the part I just implemented.
Only tests related to this change — not the entire feature.
Build and run until all pass.
If the spec seems incomplete, note what's missing but don't change it.
```

### Template B — Update Feature + Tests

```
I'm about to change [description of change].
Affected files: [list]

1. Update the spec: docs/specs/<feature>.md
2. Update the test plan: docs/test-plans/<feature>.md (only affected test cases)
3. Implement the code change
4. Update tests to match
5. Build and run → fix until green
```

### Template C — Test-First Bug Fix

```
Bug: [description]
Steps to reproduce: [steps]
Expected: [correct behavior]
Actual: [broken behavior]

1. Write a test that reproduces this bug (must fail currently)
2. Fix the production code to make the test pass
3. Run the full test suite — nothing else should break
4. Update the spec if this is an undocumented edge case
```

### Template D — Remove Feature

```
Removing: [feature name]
Files to delete: [list]

1. Mark relevant spec sections as removed
2. Mark related test plan entries as removed
3. Delete production code
4. Delete test code
5. Run full test suite → fix cascading breaks
```

---

## 4. Token Cost Guide

| Workflow | Estimated Tokens | When |
|----------|-----------------|------|
| `/test` (incremental) | 5–10k | Daily, after each code chunk |
| `/fix` (single bug) | 3–5k | As bugs arise |
| `/commit` | 2–4k | Each commit |
| `/review` (diff-based) | 10–20k | Before merge |
| `/plan` (new feature) | 20–40k | Start of new feature |
| `/challenge` (adversarial) | 15–30k | After /plan, for complex features |
| Full audit (manual) | 100k+ | Before release, quarterly |

**Rule of thumb:** Daily work uses templates + `/test` → low token cost.
Save `/plan` and full audits for significant milestones.

---

## 5. CI Integration Checklist

Use this as a PR review checklist (enforce manually or via CI):

- [ ] **Spec updated?** If production behavior changed, `docs/specs/` should have changes.
- [ ] **Test plan updated?** If spec changed, `docs/test-plans/` should have changes.
- [ ] **Tests pass?** `bash scripts/build-test.sh` exits 0.
- [ ] **No dead tests?** Removed production code → removed corresponding tests.
- [ ] **Coverage not decreased?** (Optional, per-team decision.)
- [ ] **No secrets in diff?** No API keys, tokens, passwords in committed code.
- [ ] **Commit messages conventional?** `type(scope): description` format.

---

## 6. Spec-Test-Code Sync Rules

| Change | Must Also Update |
|--------|-----------------|
| Production code behavior changed | Spec + test plan + tests |
| Spec updated | Test plan + tests (if behavior changed) |
| Test plan updated | Tests (implement new/modified test cases) |
| Code removed | Remove related tests. Mark spec as removed. |
| Bug fix | Add test. Update spec if edge case was undocumented. |

**Never acceptable:**
- Code changed, spec not updated (spec drift)
- Code changed, tests not updated (untested code)
- Spec changed, tests not updated (plan drift)
- Code removed, dead tests remain (orphaned tests)

**Acceptable shortcut** for changes under 5 lines with no behavior change:
- Code + tests together, skip spec update (same PR).

---

## 7. Common Pitfalls

| Pitfall | Symptom | Prevention |
|---------|---------|------------|
| **Spec drift** | Code does X, spec says Y | Always update spec before coding |
| **Dead tests** | Tests pass but test removed functionality | Delete tests when removing features |
| **Over-testing** | 50 tests for simple CRUD, slow suite | Focus on behavior, not implementation details |
| **Mock abuse** | Tests pass with mocks, fail in production | Use real implementations; mock only external services |
| **Big-bang testing** | All tests written after all code is done | Test incrementally after each chunk |
| **Ignoring flaky tests** | Tests pass sometimes, fail sometimes | Fix immediately — flaky tests erode trust |
| **Testing private methods** | Tests break on refactor | Test public API and behavior only |
