---
description: |
  Pre-merge code review — security, correctness, spec alignment. Reviews diff
  against the base branch with smart focus by blast radius.
  Use when asked to "review this PR", "review code", "review trước khi merge",
  "kiểm tra code", "check my diff", "pre-merge review", or "review my changes".
  Proactively suggest before /sp-commit or when the user is about to merge,
  especially after /sp-build produces a non-trivial diff.
  Catches: SQL safety issues, security gaps, spec drift, regressions in
  modified-not-added lines, and changes to sensitive layers (auth, payment, core).
allowed-tools: Read, Bash, Glob, Grep, AskUserQuestion, mcp__graphatlas__*
---
Pre-merge code review — security, correctness, spec alignment.

## Phase 0a — Graphatlas probe (run once, silently)

Before Phase 0:

1. Call `mcp__graphatlas__ga_architecture` with `max_modules: 1`.
2. Interpret:
   - Returns `modules` → **GA available.** Use `ga_impact`, `ga_risk`, `ga_architecture` for blast-radius and layer checks below. Manual grep is fallback.
   - Error `STALE_INDEX` → call `mcp__graphatlas__ga_reindex` (mode `"full"`), retry once, then treat as available. (Reviewing the diff against a stale index gives wrong impact — reindex matters here.)
   - Tool not found / connection error / any other failure → **GA unavailable.** Skip `ga_*` steps and review the diff manually. Do not re-probe.
3. Carry the outcome through Phase 0 - 4.

---

## Phase 0: Understand Intent

1. Read commit messages:
   ```
   BASE=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||') || BASE="main"
   git log --oneline "$BASE"...HEAD
   ```
2. Check for spec in `docs/specs/<feature>/<feature>.md` — review against INTENT.
3. If the spec contains `## Behavior Matrix`, treat each `BM.AS-NNN.<surface>` row as review intent. Keep the matrix open while reading the diff.
4. Use the invariant registry README/schema as base knowledge; README examples are not runtime entries. Then read project-local invariant entries if present: `docs/invariants/INV-*.md`. If none exist, continue and note "No invariant registry found" internally.
5. Read the diff: `git diff "$BASE"...HEAD`
6. **Expand blast radius.** **If GA available (per Phase 0a):** run `ga_impact(diff=<full diff>)` (or `changed_files=[...]`) to get impacted files, affected tests, affected routes/configs, and a 4-dim risk score in one call — this is the flagship review tool, prefer it over any chain of grep + manual reading. Cross-check with `ga_architecture` for module/layer membership (auth, payment, core) and `ga_risk(changed_files=[...])` for a refactor-safety gate. **If GA unavailable:** grep for each changed function/type name across the rest of the tree to find affected files; identify sensitive paths (`auth/`, `payment/`, `core/`) by directory.
7. **What already exists:** List any code/flows that already partially solve the problem in this diff. Flag if the diff rebuilds something that already exists.

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
| Spec has `## Behavior Matrix`, or diff contains state/status/role/viewer/surface/read-model/feed/calendar/email/list/detail/worklist/dashboard | Lifecycle + parity + cascade |
| Diff touches code named in invariant logs | Regression invariants for that component |

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

### API/Backend (High)

- **Unvalidated input** — request body/params used without schema validation
- **Missing rate limiting** — public endpoints without throttling
- **Missing timeouts** — external HTTP calls without timeout configuration
- **Missing CORS configuration** — APIs accessible from unintended origins
- **Error message leakage** — stack traces, file paths, DB schemas in responses

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

### Behavior Matrix & Invariants (High)

Use this section when the spec has `## Behavior Matrix`, `## Sibling Surface Map`, or project-local invariant logs match the diff.

- **Cell-to-diff trace:** For each changed state transition, viewer rule, read surface, notification, queue, dashboard count, feed, calendar, or API projection, identify the corresponding `BM.AS-NNN.<surface>` row. If code changes behavior for a matrix cell but tests do not reference that AS ID or `BM.AS-NNN`, flag High.
- **Surface parity:** If the diff updates one read surface for a state/viewer change, check matrix siblings for list/detail/worklist/dashboard/feed/API/email/calendar parity. Flag missing sibling updates unless the matrix marks them `N/A` with a concrete reason.
- **Sibling candidate disposition:** If the spec has `## Sibling Surface Map`, every high/medium candidate must be `cover`, `GAP-NNN`, or `ignore(reason)`. Flag missing dispositions. If the diff changes a confirmed sibling surface but omits sibling tests/updates for the other confirmed surfaces, flag High unless a GAP/N/A covers it.
- **Discovery drift:** If the diff introduces or modifies an entry-point whose name/evidence matches the operation (`create_from_*`, `*_from_*`, `send_*invite*`, `*_outcome*`, `reschedule*`, `book_next*`, etc.) but it is absent from the Sibling Surface Map and invariant registry, flag "Invariant candidate missing" as Medium/High depending on risk.
- **Suspicious N/A/GAP:** If changed code exercises a matrix row marked `N/A` or `GAP`, flag the spec/code mismatch. `GAP` is not a test obligation, but it is a review concern when the diff implements or depends on that behavior.
- **Viewer-relative behavior:** Confirm visibility, labels, allowed actions, recipients, and queue membership are derived from `state/status × viewer/role`, not only from owner/assignee shortcuts.
- **Cascade propagation:** State transitions must update derived queues, counts, feeds, read models, notifications, calendars, and APIs named by the matrix. Flag partial propagation and stale read-path risks.
- **Delete/orphan/incomplete/out-of-order:** For lifecycle changes, check delete/cancel/reschedule/reassign paths for orphaned rows, stale external events, incomplete rollback, and out-of-order async delivery.
- **Timing/source parity:** When matrix rows imply sync/async/external-down timing, confirm tests assert the correct timing tier and user-visible source of truth.
- **No-vacuous boundary tests:** If a test covers `BM.AS-NNN.<surface>` but mocks the exact boundary that surface depends on (API projection, calendar provider, email provider, read-model query, queue feed), flag it. Mock outside the boundary, not the behavior being claimed.
- **Invariant registry check:** For each project-local `docs/invariants/INV-*.md` entry whose `component_keys`, `sibling_set`, `shared_anchor`, or keywords match the diff, verify code and tests preserve it. Status handling:
  - `enforced` → hard review gate: if the diff touches one sibling/component in the invariant but does not update or run the `test_ref` / equivalent regression, flag High.
  - `confirmed` → High risk advisory: flag missing sibling updates/tests unless the spec intentionally changes the invariant.
  - `candidate` → Medium/High depending on evidence: flag as "Invariant candidate needs confirmation" if the diff repeats the class.
  - `retired` → ignore unless the diff revives the retired component.
  A repeated class such as carry-forward, viewer-relative labels, invite-on-reschedule, orphan cleanup, or stale dashboard count is High unless intentionally changed in the spec.
- **Review fix direction:** Suggested fixes should usually update the spec/test/code triangle: add or correct the matrix cell, add a `BM.AS-NNN` regression test, then fix code. Do not suggest "add generic coverage" when a precise cell is available.

### Code Quality (Medium)
- Dead code: removed functions still imported elsewhere?
- Obvious duplication: copy-pasted blocks that should be shared?
- Naming: consistent with codebase? Descriptive?
- Complexity: functions > 40 lines or > 3 nesting levels?
- **Diagram maintenance:** Diff touches code with ASCII diagrams in nearby comments? Check if those diagrams are still accurate. Stale diagrams are worse than no diagrams — they actively mislead. Flag even if outside immediate scope.

### Performance (Low)
- Flag N+1 queries, unbounded collections, redundant computation in loops.

### When Reviewing AI-Generated Code

Prioritize these concerns above standard checklist:
- **Behavioral regressions** — does changed code break edge cases the AI didn't consider?
- **Trust boundaries** — does the AI code implicitly trust external input it shouldn't?
- **Architecture drift** — does it introduce hidden coupling or deviate from existing patterns?
- **Model cost escalation** — flag workflows that escalate to higher-cost models without clear reasoning; recommend lower-cost tiers for deterministic operations.

### Failure Mode Grid
For each new codepath in the diff, evaluate 3 dimensions:

| Codepath | Test covers it? | Error handling? | User sees clear error? |
|----------|----------------|-----------------|----------------------|
| (path)   | ✓/✗            | ✓/✗             | clear / silent        |

**Critical gap** = all 3 are ✗ → flag as High severity, non-optional.

---

## Confidence Calibration

Every finding MUST include a confidence score:

| Score | Meaning | Display rule |
|-------|---------|-------------|
| 9–10 | Verified by reading code directly. Concrete bug demonstrated. | Show normally |
| 7–8 | High-confidence pattern match. Very likely correct. | Show normally |
| 5–6 | Possible false positive. | Show with caveat: "verify this" |
| 3–4 | Low confidence. | Appendix only |
| 1–2 | Speculation. | Only report if severity Critical |

**Finding format:** `**[C-1] (confidence: 9/10) file.ts:42 — description**`

---

## Phase 3: TL;DR Output

Print ONLY this block to terminal — concise, no full finding bodies yet. Keep all finding detail internal for Phase 5.

```
## Code Review: <branch>
Scope: X files, +Y/-Z lines | Focus: <detected> | Verdict: APPROVE | REQUEST CHANGES | NEEDS DISCUSSION
Counts: N Critical · N High · N Medium · N Low  (total: N)

Top blockers (Critical + High only, one-liner each — cap 5):
- [C-1] file.ts:42 — SQL injection (conf 9/10)
- [H-1] api.ts:15 — empty catch swallows DB errors (conf 8/10)

Positive: <1 line — reinforce one good pattern from the diff>
Not in scope: <1 line, or "None identified.">
```

If total findings = 0 → print TL;DR with "No findings." and STOP. Skip Phase 4–6.

After printing TL;DR, append one line:
> 💡 Want a second opinion? Run `/sp-voices` on this diff for a multi-LLM cross-check before triaging — especially useful for security/payment changes or when most findings sit at confidence 5–7.

---

## Phase 4: Bulk triage

Use `AskUserQuestion`. Recommendation logic for the question text:
- Any Critical or High present → recommend **A (Review each)**
- Only Medium/Low, majority confidence ≥7 → recommend **B (Accept all)**
- Majority confidence ≤6 → recommend **C (Reject all)**

Append `(Recommended)` to the matching option.

```json
{
  "questions": [
    {
      "question": "<N> findings (<C>C / <H>H / <M>M / <L>L). How to triage? RECOMMENDATION: Choose <X> — <one-line reason based on severity/confidence mix>.",
      "header": "Triage Mode",
      "multiSelect": false,
      "options": [
        {"label": "A) Review each — walk through finding by finding with full details"},
        {"label": "B) Accept all — add every finding to action list, skip per-item review"},
        {"label": "C) Reject all — dismiss all findings, verdict stands, no action list"},
        {"label": "D) Exit — keep the TL;DR above, stop here"}
      ]
    }
  ]
}
```

Routing: A → Phase 5. B → mark all Accepted, jump to Phase 6. C → mark all Rejected, jump to Phase 6. D → stop.

---

## Phase 5: Per-finding loop (only if A chosen)

Iterate findings in order: Critical → High → Medium → Low. For EACH, print the full detail block:

```
[<ID>] <severity> | confidence: <N>/10 | <file:line>
Title: <title>
Description: <what's wrong — concrete>
Evidence: <code snippet or direct quote from diff>
Failure scenario: <step-by-step how this hits production>
Suggested fix: <specific, actionable>
```

Then ask. Append `(Recommended)` to the matching option:
- **Accept** if: severity ≥ High AND confidence ≥ 7
- **Reject** if: confidence ≤ 6
- **Defer** if: severity Medium/Low AND confidence ≥ 7

```json
{
  "questions": [
    {
      "question": "Finding [<ID>]: <title>\n<1-line flaw summary>\nRECOMMENDATION: Choose <X> — <rationale: severity × confidence>.",
      "header": "Finding <ID>",
      "multiSelect": false,
      "options": [
        {"label": "A) Accept — add to action list"},
        {"label": "B) Reject — false positive, dismiss"},
        {"label": "C) Defer — note in PR description, don't fix now"}
      ]
    }
  ]
}
```

*(Move `(Recommended)` to whichever option matches the rule above.)*

Escape hatch: if user hits Reject 3 times in a row on High/Critical items, ask once: "Skip remaining per-finding prompts? A) Continue B) Reject all remaining C) Accept all remaining" — avoids fatigue on noisy reviews.

---

## Phase 6: Summary

Print final tally:

```
Triage complete.
Accepted: N | Rejected: N | Deferred: N

Action list (accepted):
- [<ID>] file:line — <title>  →  /sp-fix "<title>"
- ...

Deferred (note in PR description):
- [<ID>] file:line — <title>
```

If accepted = 0 → print "No action items. Verdict stands: <verdict>." and stop.
Do **NOT** spawn `/sp-fix` automatically — user runs it per item.

---

## Rules
1. **Never auto-fix.** Report only — triage classifies, doesn't edit code.
2. **Specific.** Every finding has `file:line` and concrete description.
3. **Severity matches impact.** Style nits = Low. Injection = Critical.
4. **Positive notes mandatory.** Reviews aren't just about problems.
5. **Review against intent.** Not just "clean code?" but "does this match spec/commits?"
6. **Proportional.** 5-line doc change ≠ 500-line auth rewrite.
7. **TL;DR first, details on demand.** Never dump all finding bodies to terminal upfront — reveal detail only inside Phase 5.
8. **Recommendation mandatory.** Every `AskUserQuestion` includes `RECOMMENDATION:` in question text AND `(Recommended)` suffix on the matching option.
