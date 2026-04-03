---
description: Test-first bug fix — write failing test, fix code, verify green
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
---
Test-first bug fix — write failing test, fix code, verify green.

Bug: $ARGUMENTS

---

## Phase 0: Investigate

Don't jump to code. Understand the bug first:

1. **Parse the report.** Symptom? Expected vs actual? Repro steps?
2. **Locate the code.** Grep for keywords from the bug (error messages, function names).
3. **Check history.** `git log --oneline -5 -- <file>` and `git blame -L <range> <file>` — who changed this last and why?
4. **Form a hypothesis:** "I believe the bug is caused by [X] in [file:function] because [evidence]."

If the bug is in a dependency/config/data (not project code), say so before proceeding.

---

## Phase 1: Write a Failing Test

Write a test that reproduces the bug. It **MUST fail** with current code.

Add a comment: `// Regression: <bug description> — <expected> vs <actual>`

Run it:
```
bash scripts/build-test.sh --filter "<test name>"
```

- **FAILS** → reproduced. Continue.
- **PASSES** → hypothesis may be wrong. Use `AskUserQuestion`:

```json
{
  "questions": [
    {
      "question": "The test passes with current code — the bug isn't reproduced yet. How to proceed?",
      "header": "Test Passes Unexpectedly",
      "multiSelect": false,
      "options": [
        {"label": "Provide different repro steps or environment details"},
        {"label": "The bug may be environment-specific — describe the setup"},
        {"label": "Skip test-first for this bug — fix directly"}
      ]
    }
  ]
}
```

---

## Phase 2: Fix

Make the **minimal change** needed.

| Do | Don't |
|----|-------|
| Fix the specific bug | Refactor surrounding code |
| Add a guard for the edge case | Rewrite the function |
| Explain what and why before editing | Silently change code |

---

## Phase 3: Verify

1. Run the bug test: `bash scripts/build-test.sh --filter "<test name>"` → must PASS.
2. Run full suite: `bash scripts/build-test.sh` → no regressions.

If other tests break → the fix caused a regression. Investigate. Do NOT weaken existing tests.

---

## Phase 4: Root Cause Analysis

After fixing, document:

```
Symptom: <what the user saw>
Root cause: <why it happened>
Gap: <why not caught earlier — missing test? wrong assumption? missing spec?>
Prevention: <suggest one: type constraint, validation, lint rule, spec update (including acceptance scenarios)>
```

This is non-optional for serious bugs. For trivial bugs, the fix summary is enough.

---

## Phase 5: Summary

```
Bug: <description>
Hypothesis: <what you predicted> → <confirmed or actual cause>
Test added: <file>:<test name>
Fix: <file>:<lines> — <what changed>
Root cause: <1 sentence>
Prevention: <suggestion>
Full suite: All passing ✓
```

If the bug reveals an undocumented edge case: "Consider updating the spec at docs/specs/<feature>/<feature>.md."

## Multiple Bugs

If `$ARGUMENTS` describes multiple bugs: triage by severity, fix one at a time, commit each separately.

## Rules
1. **Investigate before coding.** Hypothesis before test. Evidence before fix.
2. **Minimal fix.** One bug, one change. Don't improve the neighborhood.
3. **Never weaken tests.** If existing tests break, the fix is wrong.
4. **Ask before touching production code** if unsure.
5. **One bug, one commit.** Each fix independently revertable.
