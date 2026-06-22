# Development Workflow Reference

> Spec-first development: every change follows SPEC (with acceptance scenarios) → CODE + TESTS → BUILD PASS.

---

## 1. Workflow Types

### New Project (Greenfield)

When: Brand-new project — no codebase yet (empty repo, no package manager / `src/`).

```
Step 1 → /ap-explore "what you're building"
          Detects greenfield → ALSO decides app-type + stack (versions researched,
          current — not recalled from memory) and emits a Bootstrap Brief.
          Output: docs/explore/<feature>.md (with ## Bootstrap Brief)

Step 2 → /ap-scaffold
          Reads the Bootstrap Brief → generator-first runnable skeleton:
          core/ + ONE pattern-demonstrating module + co-located tests.
          Smoke-gated (install → build → start/smoke must be GREEN, ≥1 real test —
          this resolves TEST_CMD for /ap-build). Writes ARCHITECTURE.md + ADRs.
          Hands off ONLY when it actually runs; otherwise BLOCKED.

Step 3 → /ap-plan → /ap-build
          Normal New Feature flow, now on a runnable base. /ap-build's Foundation
          Gate confirms the harness exists before the first RED.
```

### Explore Before Planning

When: Requirements are unclear, multiple approaches are possible, or it's a brownfield feature with existing code to understand first.

```
Step 1 → /ap-explore "feature description"
          Clarifies: why the feature is needed, desired behavior, boundaries,
          edge cases, business rules, permissions, UI expectations.
          Asks questions as a Client Technical Lead — one topic at a time.
          Output: docs/explore/<feature>.md

Step 2 → /ap-plan "feature description"
          Auto-detects docs/explore/<feature>.md → skips redundant codebase
          discovery, uses explore findings as direct input for the spec.
          Continue with the normal New Feature flow from Step 2.
```

### New Feature

When: Building something that doesn't exist yet (no code, no spec).

```
Step 1 → /ap-plan "description of feature"
          Generates: docs/specs/<feature>/<feature>.md (spec with acceptance scenarios)
          Runs Scope Challenge: reuse check, complexity smell (8+ files = flag),
          framework built-in search, distribution check.
          Adds "What Already Exists" and "Not in Scope" sections to the spec.
          Answers validation questions with effort scales (human: X / CC: Y).
          At the end, suggests /ap-spec-render if you want a scannable HTML view.
          Review before proceeding.

Step 1.5 → (Optional) /ap-spec-render <feature>
          Generates <feature>.html next to the .md — sidebar TOC, story cards,
          collapsible Given/When/Then, dark/light theme. Useful when the spec
          is long and you want to scan it visually or share it with stakeholders.
          Source .md remains canonical; .html is regenerable, never hand-edit.
          For non-spec markdown (investigation, explore, RFC, retro, README),
          use /ap-md-render <file.md> instead — same idea, generic content.

Step 2 → (Optional) /ap-challenge docs/specs/<feature>/<feature>.md
          Adversarial review: spawns hostile reviewers to find flaws.
          Recommended for complex features, auth, data pipelines.
          Skip for simple CRUD or small features.

Step 3 → Implement in chunks. After each chunk:
          /ap-build
          Checks 8 edge case categories (null, empty, invalid types, boundary,
          error paths, race conditions, large data, special chars).
          Draws Coverage Map before writing tests: traces code paths + user flows,
          marks [GAP], [GAP][→E2E], [GAP][→EVAL] (with pass@1/pass@3 guidance).
          Regression rule enforced.
          Repeat until chunk is green.

Step 4 → /ap-review (before merge)
          Checks API/Backend patterns (rate limiting, timeouts, CORS, error leakage).
          Extra layer for AI-generated code: regressions, trust boundaries, cost escalation.

Step 4.5 → (Optional) /ap-voices
          Multi-LLM second opinion: sends the diff (or spec) to 2–3 different LLMs,
          synthesizes consensus + disagreements. Use when: high-stakes change
          (auth/payment/data), mixed-confidence findings from /ap-review, or
          you want cross-model verification before merge. Skip for routine changes.

Step 5 → /ap-commit
```

### Update Existing Feature

When: Changing behavior, adding options, refactoring logic.

```
Step 1 → /ap-plan docs/specs/<feature>/<feature>.md "description of changes"
          Mode C handles everything: snapshot → classification → change report → apply.
          Do NOT manually edit the spec before running /ap-plan — it creates the
          snapshot first, then applies changes. Manual edits bypass snapshot protection.
          At the end, suggests /ap-spec-render to refresh <feature>.html if you
          have an HTML view (it's stale after this update).

Step 2 → Implement code changes.
          /ap-build
          Fix until green.

Step 4 → /ap-review → /ap-commit
```

### Bug Fix

When: Something is broken and needs fixing.

```
Step 0 → (OPTIONAL) /ap-investigate "description of the bug"
          Use ONLY when: bug is complex, ambiguous, production outage, data
          corruption, regression with unclear cause, or user wants diagnosis
          before any code change. Skip for trivial/obvious bugs.
          Read-only: traces data flow, maps blast radius, lists hypotheses
          with confidence levels. Writes docs/investigate/<slug>-<date>.md.
          No code changes — hands off the report to /ap-fix.

Step 1 → /ap-fix "description" (or /ap-fix docs/investigate/<slug>-<date>.md)
          Auto-detects investigation file if passed → skips redundant discovery.
          Draws Bug Path Diagram to confirm hypothesis ([GAP] must be locatable).
          Regression rule: if diff broke existing behavior with no test → CRITICAL test required.
          Writes failing test → fixes code → confirms green → runs full suite.

Step 2 → /ap-commit

Optional → If the bug reveals an undocumented edge case, update the spec.
```

### Remove Feature

When: Deleting a feature, removing deprecated code.

```
Step 1 → /ap-plan docs/specs/<feature>/<feature>.md "remove stories S-XXX"
          Mode C creates a snapshot (removing stories = M2 = Major),
          then marks stories and AS as removed in the spec.
          (Or if removing the entire feature: archive the directory.)

Step 2 → Delete production code and related test code.

Step 3 → Run the full test suite with the project's native test command.
          Fix any cascading breakage.

Step 4 → /ap-commit
```

---

## 2. Decision Tree

Use this to decide which workflow to follow:

```
Is there a runnable project yet (package manager / src / build)?
├─ No → New Project (Greenfield). /ap-explore (greenfield) → /ap-scaffold → then /ap-plan.
└─ Yes ↓

Is this a brand new feature (no existing spec or code)?
├─ Yes
│   ├─ Are requirements clear and approach decided?
│   │   ├─ Yes → New Feature workflow. Start with /ap-plan.
│   │   │   └─ Is the feature complex (auth, data pipeline, multi-service)?
│   │   │       ├─ Yes → Run /ap-challenge after /ap-plan, before coding.
│   │   │       └─ No → Skip /ap-challenge, go straight to implementation.
│   │   └─ No → Explore Before Planning. Start with /ap-explore.
│   │           Then /ap-plan using the explore output.
└─ No
    ├─ Is this a bug fix?
    │   ├─ Yes → Bug Fix workflow.
    │   │   ├─ Complex / outage / ambiguous cause / data corruption?
    │   │   │   ├─ Yes → /ap-investigate first, then /ap-fix.
    │   │   │   └─ No  → /ap-fix directly.
    │   └─ No
    │       ├─ Are you removing/deprecating code?
    │       │   ├─ Yes → Remove Feature workflow.
    │       │   └─ No → Update Feature workflow. Start with /ap-plan.
    │       │
    │       └─ Is the change very small (< 5 lines, behavior unchanged)?
    │           └─ Yes → Skip spec update. Just /ap-build and /ap-commit.
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

1. /ap-plan docs/specs/<feature>/<feature>.md "description of changes"
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

1. /ap-plan docs/specs/<feature>/<feature>.md "remove stories S-XXX, S-YYY"
   (handles snapshot + marks stories and AS as removed)
2. Delete production code
3. Delete test code
4. Run full test suite → fix cascading breaks
```

---

## 4. Token Cost Guide

| Workflow | Estimated Tokens | When |
|----------|-----------------|------|
| `/ap-explore` | 10–20k | Before /ap-plan when requirements are unclear |
| `/ap-scaffold` | 15–40k + real install/build time | Greenfield only — once, to stand up a runnable skeleton before the first spec |
| `/ap-build` (incremental) | 5–10k | Daily, after each code chunk |
| `/ap-investigate` (complex bug) | 8–15k | OPTIONAL before /ap-fix — complex/outage only |
| `/ap-fix` (single bug) | 3–5k | As bugs arise |
| `/ap-commit` | 2–4k | Each commit |
| `/ap-review` (diff-based) | 10–20k | Before merge |
| `/ap-plan` (new feature) | 20–40k | Start of new feature |
| `/ap-challenge` (adversarial) | 15–30k | After /ap-plan, for complex features |
| `/ap-spec-render` (HTML view) | 3–8k | User-invoked after `/ap-plan` if HTML view wanted, or to refresh stale `.html` |
| `/ap-md-render` (HTML view, any md) | 3–8k | User-invoked for non-spec markdown — investigation, explore, RFC, retro, README |
| `/ap-voices` (multi-LLM review) | 10–30k + external API cost | Optional — after /ap-review for high-stakes changes |
| `/ap-humanize` (rephrase text) | 2–6k | User-invoked — rephrase plan/notes/AI output into send-ready text. Outside the dev cycle |
| Full audit (manual) | 100k+ | Before release, quarterly |

**Rule of thumb:** Daily work uses templates + `/ap-build` → low token cost.
Save `/ap-plan` and full audits for significant milestones.

---

## 5. CI Integration Checklist

Use this as a PR review checklist (enforce manually or via CI):

- [ ] **Spec updated?** If production behavior changed, `docs/specs/<feature>/` should have changes.
- [ ] **Acceptance scenarios updated?** If spec behavior changed, AS in spec should reflect it.
- [ ] **Tests pass?** The project's test command exits 0.
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
