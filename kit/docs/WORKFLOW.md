# Development Workflow Reference

> Spec-first development: every change follows SPEC (with acceptance scenarios) → CODE + TESTS → BUILD PASS.

---

## 1. Four Workflow Types

### New Feature

When: Building something that doesn't exist yet (no code, no spec).

```
Step 1 → /mf-plan "description of feature"
          Generates: docs/specs/<feature>/<feature>.md (spec with acceptance scenarios)
          Answers validation questions about assumptions.
          Review before proceeding.

Step 2 → (Optional) /mf-challenge docs/specs/<feature>/<feature>.md
          Adversarial review: spawns hostile reviewers to find flaws.
          Recommended for complex features, auth, data pipelines.
          Skip for simple CRUD or small features.

Step 3 → Implement in chunks. After each chunk:
          /mf-test
          Repeat until chunk is green.

Step 4 → /mf-review (before merge)

Step 5 → /mf-commit
```

### Update Existing Feature

When: Changing behavior, adding options, refactoring logic.

```
Step 1 → /mf-plan docs/specs/<feature>/<feature>.md "description of changes"
          Mode C handles everything: snapshot → classification → change report → apply.
          Do NOT manually edit the spec before running /mf-plan — it creates the
          snapshot first, then applies changes. Manual edits bypass snapshot protection.

Step 2 → Implement code changes.
          /mf-test
          Fix until green.

Step 4 → /mf-review → /mf-commit
```

### Bug Fix

When: Something is broken and needs fixing.

```
Step 1 → /mf-fix "description of the bug"
          Writes failing test → fixes code → confirms green → runs full suite.

Step 2 → /mf-commit

Optional → If the bug reveals an undocumented edge case, update the spec.
```

### Remove Feature

When: Deleting a feature, removing deprecated code.

```
Step 1 → /mf-plan docs/specs/<feature>/<feature>.md "remove stories S-XXX"
          Mode C creates a snapshot (removing stories = M2 = Major),
          then marks stories and AS as removed in the spec.
          (Or if removing the entire feature: archive the directory.)

Step 2 → Delete production code and related test code.

Step 3 → Run full test suite: bash scripts/build-test.sh
          Fix any cascading breakage.

Step 4 → /mf-commit
```

---

## 2. Decision Tree

Use this to decide which workflow to follow:

```
Is this a brand new feature (no existing spec or code)?
├─ Yes → New Feature workflow. Start with /mf-plan.
│   └─ Is the feature complex (auth, data pipeline, multi-service)?
│       ├─ Yes → Run /mf-challenge after /mf-plan, before coding.
│       └─ No → Skip /mf-challenge, go straight to implementation.
└─ No
    ├─ Is this a bug fix?
    │   ├─ Yes → Bug Fix workflow. Start with /mf-fix.
    │   └─ No
    │       ├─ Are you removing/deprecating code?
    │       │   ├─ Yes → Remove Feature workflow.
    │       │   └─ No → Update Feature workflow. Start with /mf-plan.
    │       │
    │       └─ Is the change very small (< 5 lines, behavior unchanged)?
    │           └─ Yes → Skip spec update. Just /mf-test and /mf-commit.
```

---

## 3. Prompt Templates

Copy-paste these when working with Claude Code.

### Template A — Implement + Test Together

```
I just implemented [brief description].
Files changed: [list files]

Based on:
- Spec: docs/specs/<feature>/<feature>.md (section §X)
- Acceptance scenarios: docs/specs/<feature>/<feature>.md (section ## Stories)

Write tests for the part I just implemented.
Only tests related to this change — not the entire feature.
Build and run until all pass.
If the spec seems incomplete, note what's missing but don't change it.
```

### Template B — Update Feature + Tests

```
I'm about to change [description of change].
Affected files: [list]

1. /mf-plan docs/specs/<feature>/<feature>.md "description of changes"
   (handles snapshot + spec update + acceptance scenarios)
2. Implement the code change
3. Update tests to match
4. Build and run → fix until green
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

1. /mf-plan docs/specs/<feature>/<feature>.md "remove stories S-XXX, S-YYY"
   (handles snapshot + marks stories and AS as removed)
2. Delete production code
3. Delete test code
4. Run full test suite → fix cascading breaks
```

---

## 4. Token Cost Guide

| Workflow | Estimated Tokens | When |
|----------|-----------------|------|
| `/mf-test` (incremental) | 5–10k | Daily, after each code chunk |
| `/mf-fix` (single bug) | 3–5k | As bugs arise |
| `/mf-commit` | 2–4k | Each commit |
| `/mf-review` (diff-based) | 10–20k | Before merge |
| `/mf-plan` (new feature) | 20–40k | Start of new feature |
| `/mf-challenge` (adversarial) | 15–30k | After /mf-plan, for complex features |
| Full audit (manual) | 100k+ | Before release, quarterly |

**Rule of thumb:** Daily work uses templates + `/mf-test` → low token cost.
Save `/mf-plan` and full audits for significant milestones.

---

## 5. CI Integration Checklist

Use this as a PR review checklist (enforce manually or via CI):

- [ ] **Spec updated?** If production behavior changed, `docs/specs/<feature>/` should have changes.
- [ ] **Acceptance scenarios updated?** If spec behavior changed, AS in spec should reflect it.
- [ ] **Tests pass?** `bash scripts/build-test.sh` exits 0.
- [ ] **No dead tests?** Removed production code → removed corresponding tests.
- [ ] **Coverage not decreased?** (Optional, per-team decision.)
- [ ] **No secrets in diff?** No API keys, tokens, passwords in committed code.
- [ ] **Commit messages conventional?** `type(scope): description` format.

---

## 6. Spec-Test-Code Sync Rules

| Change | Must Also Update |
|--------|-----------------|
| Production code behavior changed | Spec (including acceptance scenarios) + tests |
| Spec updated | Acceptance scenarios + tests (if behavior changed) |
| Code removed | Remove related tests. Mark spec and AS as removed. |
| Bug fix | Add test. Update spec if edge case was undocumented. |

**Never acceptable:**
- Code changed, spec not updated (spec drift)
- Code changed, tests not updated (untested code)
- Spec changed, acceptance scenarios or tests not updated (AS drift)
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
