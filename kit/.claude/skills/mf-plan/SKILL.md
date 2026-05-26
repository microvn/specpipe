---
description: |
  Generate spec with acceptance scenarios (Given/When/Then) from a description
  or update an existing spec. Outputs docs/specs/<feature>/<feature>.md ready for /mf-build.
  Use when asked to "write the spec", "viết spec", "tạo spec", "plan this feature",
  "generate acceptance scenarios", "lên kế hoạch tính năng", or "update spec X with changes Y".
  Proactively invoke this skill (do NOT write code or spec directly) when the user
  has a clear feature description and wants it formalized, or after /mf-explore
  confirms requirements.
  Per project rules: never write code before the spec exists, and never auto-modify
  specs from code — /mf-plan is the only path that touches specs.
  Skip if a current spec already exists and matches the request — go straight to /mf-build.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion, Agent, mcp__graphatlas__*
---
Generate spec with acceptance scenarios from description or existing spec.

## Question Format

When presenting questions to the user with multiple options, use the `AskUserQuestion` tool.

**Schema:**
```json
{
  "questions": [
    {
      "question": "<plain-language problem statement — what needs deciding and why. Include RECOMMENDATION: Choose [X] because [one-line reason]>",
      "header": "<short label>",
      "multiSelect": false,
      "options": [
        {"label": "A) <option> — <1-line rationale> | (human: ~X / CC: ~Y) | Completeness: X/10 | Trade-off: <gain vs. lose>"},
        {"label": "B) <option> — <1-line rationale> | (human: ~X / CC: ~Y) | Completeness: X/10 | Trade-off: <gain vs. lose>"},
        {"label": "C) <option> — <1-line rationale> | (human: ~X / CC: ~Y) | Completeness: X/10 | Trade-off: <gain vs. lose>"}
      ]
    }
  ]
}
```

**Completeness scoring calibration:**
- **9-10:** Covers the requirement fully, all edge cases handled, no meaningful downside.
- **7-8:** Solid choice, happy path covered, minor trade-offs acceptable.
- **5-6:** Workable but defers significant decisions or adds friction.
- **3-4:** Shortcut — gets past the question but creates debt.
- **1-2:** Placeholder only, must be revisited.

Rules:
- 2-4 options per question. Never more than 4.
- Every option must have a Completeness score AND a Trade-off. No score without rationale.
- RECOMMENDATION is mandatory in the question text. Pick one. State why.
- If two options score within 1 point, flag it: "Close call — A and B are both strong. Leaning A because [reason]."
- If the more complete option only costs `CC: ≤15m` more → recommend it directly in the question text without offering the shortcut.
- Pass all questions in a single `AskUserQuestion` call (not one-by-one) unless the answer to Q1 changes what Q2 should be.

---

## Determine mode

Examine `$ARGUMENTS`:

- **Mode A — New spec:** Argument is a feature description AND directory
  `docs/specs/<feature>/` does not exist → create new spec.
- **Mode B — Add scenarios:** Argument is a path to an existing spec AND spec does not
  contain `## Stories` section with AS-NNN IDs → read spec, add acceptance scenarios.
- **Mode C — Update:** Argument is a path to an existing spec AND spec already contains
  `## Stories` section with AS-NNN IDs → update flow (see Mode C section below).

---

## Directory Structure

```
docs/specs/
  <feature>/
    <feature>.md                    # current state — always read this file
    snapshots/                      # version history
      <YYYY-MM-DD>.md
      <YYYY-MM-DD>-<REF>.md
```

- `<feature>.md` is the single source of truth. All spec reads start from this file.
- `snapshots/` contains full copies at points in time. Immutable — never edit a snapshot.
- When a feature is split, sub-specs live in the same directory:
  ```
  docs/specs/billing/
    billing.md                # root spec or overview
    billing-checkout.md       # sub-spec
    billing-refund.md         # sub-spec
    snapshots/
  ```

---

## Phase 0: Codebase Awareness

**Graphatlas probe (run once, silently, before P0-1):**

1. Call `mcp__graphatlas__ga_architecture` with `max_modules: 1`.
2. Interpret:
   - Returns `modules` → **GA available.** Use `ga_*` everywhere in the P0 table below. Grep/glob is fallback.
   - Error `STALE_INDEX` → call `mcp__graphatlas__ga_reindex` (mode `"full"`), retry once, then treat as available.
   - Tool not found / connection error / any other failure → **GA unavailable.** Use grep/glob throughout. Do not re-probe.
3. Carry the outcome through the rest of Phase 0.

Before writing anything, run this checklist:

| # | Action | How |
|---|--------|-----|
| P0-1 | **Keyword scan** | **If GA available:** `ga_symbols` on 3-5 keywords from the feature description for indexed definitions, then `ga_file_summary` on each match to scope. **If GA unavailable** or the keyword matches only string/comment text (no symbol hits): grep. |
| P0-2 | **Related specs** | List `docs/specs/` directories. Read the main spec of any related feature. Is there overlap? |
| P0-2b | **Explore doc** | Derive feature name from `$ARGUMENTS` as kebab-case (same convention as `docs/specs/<feature>/`). Check `docs/explore/<feature-name>.md`. If no exact match, list `docs/explore/` and fuzzy-match by keywords. If found → read it. Log: "Explore findings found for '<feature>' — using as primary input. Skipping P0-3, P0-4 (already covered)." Continue with P0-5, P0-6. Map explore fields to spec sections: **Feature + Happy path** → Overview + Stories (happy path AS); **Unhappy paths** → Stories (error path AS); **Business rules** → Constraints & Invariants; **Data impact** → Data Model; **Out of scope** → Not in Scope; **Permissions** → Story descriptions; **Technical risks** → What Already Exists (note conflicts). |
| P0-3 | **Dependency scan** | `ga_architecture` for the module map and `ga_importers` / `ga_callees` on touched symbols to see what this code reaches. Manual import-grep is a fallback. |
| P0-4 | **Reusable utilities** | `ga_symbols` (fuzzy match) on names like `validate`, `format`, `parse`, `<domain>Helper` to find existing helpers; `ga_hubs` to surface the most-connected utilities worth reusing. |
| P0-5 | **Project patterns** | Identify test framework, naming conventions, directory structure from existing code. |
| P0-6 | **Change Log** | If the feature exists, read its Change Log to understand evolution. |

**Tooling rule:** when GA is available (per the probe above), prefer it — `ga_architecture`, `ga_symbols`, `ga_callers`, `ga_callees`, `ga_importers`, `ga_file_summary`, `ga_impact`, `ga_hubs` — over grep/glob/find for every step. Indexed symbol table + typed call/reference edges beat textual matching for discovery and dependency tracing. Use grep when GA is unavailable, or for free-text inside strings/comments.

Record findings as bullet points — carry them into Phase 2 (Data Model, Constraints) and Phase 3 (ambiguity check).

Don't plan in a vacuum. A spec that ignores existing code creates conflicts.

---

## Phase 1: Scope & Split Assessment

Before writing the spec, assess size.

**Input:** Feature description from user (Mode A) or current spec (Mode B).
Mode C does not run Phase 1 — it uses its own flow (see Mode C section).

**Split rules:**

| # | Condition | Action |
|---|-----------|--------|
| T1 | Feature has >7 expected stories | MUST split |
| T2 | Feature has >20 expected AS | MUST split |
| T3 | Stories belong to different domains (e.g. payment + notification) | SHOULD split |
| T4 | A story can ship independently without depending on other stories | SHOULD split |
| T5 | Stories share a data model or state machine | DO NOT split |
| T6 | Splitting would duplicate >50% of context (entities, constraints) | DO NOT split |

"MUST" = mandatory split, inform user.
"SHOULD" = suggest split, present using **Question Format** with split vs. keep-together as options.
"DO NOT" = keep together, unless user requests split.

**Sizing & Phasing — when a feature is large, break it into independently deliverable phases:**

| Phase | Goal |
|-------|------|
| Phase 1 | Minimum viable — smallest slice that provides value |
| Phase 2 | Core experience — complete happy path |
| Phase 3 | Edge cases — error handling, polish |
| Phase 4 | Optimization — performance, monitoring |

Each phase must be mergeable independently. Avoid plans that require all phases to complete before anything works.

**Scope Challenge — run before drafting the spec:**

1. **Reuse check:** From Phase 0 findings, what code already solves this sub-problem? Reuse vs rebuild? If rebuild → justify with AskUserQuestion.
2. **Complexity smell:** Plan touches 8+ files or introduces 2+ new classes/services → flag and propose a minimal version via AskUserQuestion before continuing.
3. **Search check:** Does the framework/runtime have a built-in for this? Is the chosen approach current best practice?
4. **Distribution check:** Does the plan introduce a new artifact (binary, package, container)? → Is the CI/CD pipeline in scope? Code without distribution is code nobody can use. If deferred → capture explicitly in "Not in Scope".
5. **Completeness check:** Is the plan doing the complete version or a shortcut? If the complete version only costs `CC: ≤15m` more → recommend it directly without asking.

If the complexity check triggers → use AskUserQuestion to propose scope reduction before proceeding.

If splitting:
- Create the feature directory, place sub-specs in the same directory.
- Each sub-spec must be self-contained (own overview, relevant data model, constraints).
- No sub-spec should depend on another sub-spec to be understood.

---

## Phase 2: Draft the Spec (Mode A + B)

**Mode A:** Create a new spec at `docs/specs/<feature>/<feature>.md` using the template below. Include stories + acceptance scenarios.

**Mode B:** Read existing spec, add `## Stories` section with AS following depth rules.

### Spec Template

```markdown
# Spec: <Feature Name>

**Created:** <$(date +%Y-%m-%d)>
**Last updated:** <$(date +%Y-%m-%d)>
**Status:** Draft | Active | Deprecated
**Snapshot limit:** <N, optional — default 5>

## Overview
[what, why, who — 2-3 sentences]

## Data Model
[entities, attributes, relationships — if applicable]

## Stories

### S-001: <Story name> (P0)

**Description:** [user story]
**Source:** [optional: ticket/issue ref]

**Acceptance Scenarios:**

AS-001: <short description>
- **Given:** [state]
- **When:** [action]
- **Then:** [expected]
- **Data:** [test data]

AS-002: <short description>
- **Given:** [error state]
- **When:** [action]
- **Then:** [error handling]
- **Data:** [edge case data]

### S-002: <Story name> (P1)

**Description:** [user story]
**Source:** [optional]

**Acceptance Scenarios:**

AS-003: <short description>
- **Given:** [state]
- **When:** [action]
- **Then:** [expected]

### S-003: <Story name> (P2)

**Description:** [user story]

**Acceptance Scenarios:**

AS-004: <short description>
- [flow description + expected behavior]

## Constraints & Invariants
[rules that must ALWAYS hold]

## What Already Exists
[existing code/flows that partially solve sub-problems — reusing or rebuilding?]

## Not in Scope
[work considered but deferred — each item with one-line rationale]

## Change Log

| Date | Change | Ref |
|------|--------|-----|
| <$(date +%Y-%m-%d)> | Initial creation | -- |
```

### Acceptance Scenario Depth

| Story priority | AS must contain | AS optional |
|---------------|----------------|-------------|
| P0 | Given + When + Then + Data + Setup | -- |
| P1 | Given + When + Then | Data, Setup |
| P2 | 1-2 line flow description + expected | Separate Given/When/Then |

**AS rules:**
- Every P0 story must have at least 1 happy path AS + 1 error path AS.
- Every P1 story must have at least 1 happy path AS.
- Every P2 story must have at least 1 AS.
- No orphan AS — every AS belongs to exactly 1 story.

Match depth to complexity. Simple CRUD = 3 stories. Complex auth = full template.

### Writing Instructions

**DO:**
- Write AS that test one specific behavior each. If it fails, the developer knows exactly what broke.
- Use concrete values in Given/When/Then — `Given: user with balance $50` not `Given: user with some balance`.
- Name edge cases explicitly — `AS-005: Payment with insufficient funds` not `AS-005: Payment error`.
- Each AS should be independent — no AS depends on another running first.
- Include the boundary — `Given: cart with 0 items` and `Given: cart with 999 items`, not just `Given: cart with items`.

**DO NOT produce:**
- Vague AS: "Test that the feature works" — every AS must specify Given, When, Then (or a concrete flow for P2).
- Excessive AS: 30+ scenarios for simple CRUD — over-testing wastes time and creates maintenance burden.
- Implementation-testing AS: "Test that the database query uses an index" — test behavior, not internals.
- Duplicate AS: two scenarios verifying the same behavior with trivially different inputs.
- Framework-testing AS: "Test that the router handles the path" — test YOUR logic, not the framework.

### Spec Section Guidelines

Include only sections that apply:
- **Data Model** — skip if feature has no persistent data or entities.
- **Constraints & Invariants** — skip if no rules must always hold.
- **What Already Exists** and **Not in Scope** — always include.

### Consistency Check (after drafting)

| # | Check | On failure → |
|---|-------|-------------|
| CC1 | Every story has at least 1 AS | Add missing AS |
| CC2 | Every AS belongs to exactly 1 story | Assign orphan AS or delete |
| CC3 | P0 stories have error path AS | Add error AS if missing |
| CC4 | No 2 AS test the same behavior | Merge or delete duplicate |
| CC5 | Constraints have AS verifying them | Add AS for uncovered constraints |
| CC6 | Story count ≤7, AS count ≤20 | Go back to Phase 1 and split |

All checks must pass before showing the draft to the user.

Show the draft to the user. Wait for confirmation before proceeding.

---

## Phase 3: Clarify Ambiguities

Before finalizing, scan the spec for gaps. Check BOTH the spec content AND the acceptance scenarios:

| Lens | What to look for |
|------|-----------------|
| Behavioral gaps | Missing user actions, undefined system responses, incomplete flows. Which stories lack an error path AS? |
| Data & persistence | Undefined entities, missing relationships, unclear storage/lifecycle |
| Auth & access | Who can do what is unclear, missing role definitions |
| Non-functional | Vague adjectives without metrics ("fast", "secure", "scalable") — add SC-NNN with concrete numbers |
| Integration | Third-party API assumptions, unstated dependencies, SLA gaps |
| Concurrency & edge cases | Multi-user scenarios, boundary conditions, error paths not addressed |
| AS completeness | Which AS is missing Given or Then? |
| AS overlap | Do 2 AS test the same behavior? |
| Story orphans | Which story has no AS? |
| Priority consistency | P0 story with only 1 happy path AS? |
| Constraint coverage | Which constraint has no AS verifying it? |

Identify the top 3-5 ambiguities (most impactful first). Present all at once using the `AskUserQuestion` tool (see Question Format at top). Example call:

```json
{
  "questions": [
    {
      "question": "Auth strategy not specified — spec mentions 'logged-in users' but no auth mechanism. RECOMMENDATION: Choose A — single-service app, session auth is simplest path.",
      "header": "Auth Strategy",
      "multiSelect": false,
      "options": [
        {"label": "A) Session-based auth (cookie) — traditional, simple server-side | (human: ~1d / CC: ~10m) | Completeness: 8/10 | Trade-off: simple setup vs. harder to scale across services"},
        {"label": "B) JWT (stateless tokens) — API-friendly, no server session | (human: ~1d / CC: ~15m) | Completeness: 7/10 | Trade-off: scalable vs. token revocation complexity"},
        {"label": "C) Defer — add auth story later when auth requirements are clearer | (human: ~0 / CC: ~0) | Completeness: 5/10 | Trade-off: unblocks now vs. may require spec rewrite later"}
      ]
    }
  ]
}
```

If 0 questions remain, you MUST state why — not just "spec is clear." Cite at minimum:
- **Edge cases checked:** which boundary conditions were considered and found covered.
- **Error paths checked:** which failure modes were verified to have AS.
- **Integration points checked:** which external dependencies were reviewed.
- One-line verdict per lens from the table above that had no findings.

Example: *"0 questions. Edge cases: cart-empty and cart-max covered by AS-003/AS-004. Error paths: payment failure covered by AS-006. Auth: single-role feature, no ambiguity. No third-party integrations."*

Don't manufacture ambiguity — but don't skip the justification either.

**Present all questions (or the 0-question justification) to the user. Wait for answers before continuing.**

Write clarifications back into the spec under `## Clarifications — <date>`.
Update any affected stories or AS to reflect the user's answers.
Then proceed to summary.

---

## Phase 4: Summary

Show:
- Story counts (P0/P1/P2)
- AS count
- Directory structure created
- Implementation order: which stories to implement first (by priority + dependency)
- Next steps: "Implement stories in order. Use `/mf-build` to verify each story. For complex specs, run `/mf-challenge` first."

**Suggest the HTML view (do NOT auto-render):**

`/mf-plan` only writes the spec markdown. Rendering the scannable HTML view is a separate skill (`/mf-spec-render`) the user invokes explicitly. After Phase 4 summary, point the user at it in 1-2 lines so they know the option exists. Match the user's conversation language.

Include:

- The skill command: `/mf-spec-render <feature>`
- One sentence on what it produces and why they might want it (sidebar TOC, story cards, collapsible AS, dark/light theme — fast human scanning)

Example wording (English — translate as needed):

> Want a scannable HTML view of this spec? Run `/mf-spec-render <feature>` — it generates `<feature>.html` next to the `.md` with a sidebar TOC, story cards with P-badges, collapsible Given/When/Then, and dark/light theme. The `.md` stays the source of truth either way.

Do not invoke `/mf-spec-render` from here. The user chooses when to render.

**Required outputs (add to every spec):**

**"What Already Exists"** — List code/flows that already partially solve sub-problems in this spec. Is the plan reusing or rebuilding them? If rebuilding → justify why. Write under `## What Already Exists` in the spec.

**"Not in Scope"** — List work that was considered but deliberately deferred, each with a one-line rationale. Prevents work from silently dropping. Write under `## Not in Scope` in the spec.

---

## Mode C: Update Flow

> **⛔ CRITICAL — MANDATORY ORDER:**
> Snapshot MUST be created **BEFORE** updating the spec.
> If you update the spec first then create a snapshot → the snapshot contains the new content, old version is lost.
> Correct order: C2 (classify) → C3 (snapshot) → C4 (report) → C5 (apply changes).
> NEVER reverse the order of C3 and C5.

### C0: Read current state

Read `<feature>.md`. This is the current truth.

### C1: Identify changes

Compare the requested changes against the current spec. List:
- Stories: added / modified / removed / unchanged
- AS: added / modified / removed / unchanged
- Constraints: added / modified / removed / unchanged

### C2: Classification

Walk through table M1-M6. If ANY condition is true → Major.

| # | Condition | Example |
|---|-----------|---------|
| M1 | New story added | Adding S-004: Subscription |
| M2 | Story removed | Removing S-002: Invoice |
| M3 | Story priority changed | S-002 from P1 → P0 |
| M4 | Story's main flow changed (Given or When changed) | AS-003 Given changes state, or When changes action |
| M5 | Expected behavior changed (Then changed) for a P0 story | AS-001 Then changes result |
| M6 | Constraint/invariant added or removed | Adding "balance must not be negative" |

Minor = NONE of M1-M6 apply. Examples: typo fix, rewording without meaning change, adding/editing Data fields, formatting, adding Source ref.

**Major → create snapshot before updating.**
**Minor → no snapshot. Update directly.**

> **⛔ MUST check ALL 6 conditions M1-M6.** Do not stop early.
> Common mistake: check M1 = false, M2 = false → conclude Minor without checking M3-M6.
> Correct: walk through M1 to M6 completely. If ANY is true → Major.

### C3: Snapshot (if Major)

If Major → create snapshot:

**Step 1:** Copy file using shell command (bit-perfect, not through LLM):

```bash
mkdir -p docs/specs/<feature>/snapshots
cp docs/specs/<feature>/<feature>.md docs/specs/<feature>/snapshots/<YYYY-MM-DD>.md
```

If ref available: `cp ... snapshots/<YYYY-MM-DD>-<REF>.md`
If same-day snapshot exists: `cp ... snapshots/<YYYY-MM-DD>-2.md`

**Step 2:** Prepend header to the snapshot file (using Edit):

```markdown
# Snapshot: <Feature Name>
**Date:** <YYYY-MM-DD>
**Ref:** <ticket/issue if available, "--" otherwise>
**Reason:** <M1|M2|M3|M4|M5|M6 — list which conditions triggered>

---

```

Header is added BEFORE the copied content. Do not modify any other content in the snapshot.

> **⛔ Why `cp` instead of LLM copy:** Specs require 101% accuracy. LLM text copy risks
> dropping lines, altering formatting, truncating long content. `cp` is bit-perfect.

**Step 3:** Rotate snapshots. Check the spec frontmatter for `Snapshot limit: N`. If absent, default to **5**.
After creating a new snapshot, if `snapshots/` contains more files than the limit:
- Sort by timestamp in filename.
- Delete oldest files until count equals the limit.
- Only delete snapshot files. Log deletion in Change Log: `"Snapshot <filename> rotated out"`.

If Minor: skip C3 entirely.

**Snapshots are immutable.** Never edit a created snapshot. Wrong snapshot → create a new one, delete the wrong one.

**mf-plan creates snapshots. Developers do not create them manually.** Developers do not decide, intervene, or skip.

### C4: Change report

Display to the user:

```markdown
## Change Report: <feature>
**Classification:** Major / Minor
**Snapshot:** Created <filename> / Not needed

### Changes
| Item | Action | Detail |
|------|--------|--------|
| S-002 | Priority change | P1 → P0 |
| AS-003 | Updated | Then changed |
| S-004 | Added | Subscription (P1) |

### Unchanged
S-001, S-003
```

Present the decision using the `AskUserQuestion` tool:

```json
{
  "questions": [
    {
      "question": "Apply these changes to <feature> spec? RECOMMENDATION: Choose A — <reason based on change count and complexity>.",
      "header": "Apply Changes",
      "multiSelect": false,
      "options": [
        {"label": "A) Apply all — accept the full change report as shown | (human: ~5m / CC: ~2m) | Completeness: 9/10 | Trade-off: fast vs. no per-item control"},
        {"label": "B) Review each — walk through changes one by one, accept/reject/modify | (human: ~15m / CC: ~5m) | Completeness: 10/10 | Trade-off: precise control vs. slower"},
        {"label": "C) Reject all — discard and start over | (human: ~0m / CC: ~0m) | Completeness: 3/10 | Trade-off: clean slate vs. loses work"}
      ]
    }
  ]
}
```

> **⛔ MUST wait for user confirmation before applying.**
> Do not show the report and apply in the same step.
> User has the right to reject or modify the change report.

### C5: Apply changes

- Update the spec directly.
- Update `Last updated`.
- Write to Change Log.
- New AS use the next sequential ID (never reuse deleted IDs).
- New AS follow the same Writing Instructions as Phase 2 (concrete values, one behavior per AS, no vague/duplicate/implementation-testing scenarios).

> **⛔ Change Log MUST be updated at this step.**
> Common mistake: update the spec, forget to write to Change Log.
> Every C5 execution → Change Log MUST have a new row. No exceptions.
> (Exception: non-semantic changes — C7 — do not write to Change Log.)

**Suggest re-rendering the HTML view (do NOT auto-render):**

After C5 applies changes, the `.md` is up to date but any previously generated `<feature>.html` is now stale. Don't render it automatically — point the user at `/mf-spec-render` so they invoke it when ready. Match the user's conversation language.

Example wording (English — translate as needed):

> Spec updated. If you have `<feature>.html` from a previous render, it's now stale — run `/mf-spec-render <feature>` to refresh it. If you've never rendered the HTML view for this spec, you can run the same command to generate it.

Do not invoke `/mf-spec-render` from here.

### C6: Consistency check

After updating, verify:

| # | Check | On failure → |
|---|-------|-------------|
| CC1 | Every story has at least 1 AS | Add missing AS |
| CC2 | Every AS belongs to exactly 1 story | Assign orphan AS or delete |
| CC3 | P0 stories have error path AS | Add error AS if missing |
| CC4 | No 2 AS test the same behavior | Suggest merge or delete duplicate |
| CC5 | Constraints have AS verifying them | Add AS for uncovered constraints |
| CC6 | Story count ≤7, AS count ≤20 | Suggest splitting spec (Phase 1) |

> **⛔ Consistency check is NOT optional.**
> Run CC1-CC6 after EVERY update (Major and Minor).
> Common mistake: finish update, looks fine → skip consistency check.
> CC6 (size check) is especially easy to skip — MUST check after every story/AS addition.

If any check fails → fix or report to user. NEVER skip.

### C7: Non-semantic changes

If the change is only typo, formatting, or wording that does NOT change behavior:
- Edit directly, do not run C2-C6.
- Do not write to Change Log.
- Do not create snapshot.

Criteria for "non-semantic": Given, When, Then, priority, constraint **DO NOT** change in meaning.

> **⛔ When in doubt whether "non-semantic or behavioral?" → treat as behavioral.**
> Common mistake: LLM classifies a Then change as "rewording" to avoid snapshot overhead.
> Test: if a developer reads the AS before and after the change and would write different code → it is behavioral.

### C8: Archival (all stories removed)

If a Mode C update results in ALL stories being removed from a spec:

1. Create a snapshot per C3 (this is a Major change — M2 applies).
2. Move the entire feature directory to `docs/specs/_archived/`:
   ```bash
   mkdir -p docs/specs/_archived
   mv docs/specs/<feature> docs/specs/_archived/$(date +%Y-%m-%d)-<feature>
   ```
3. The archived directory retains all snapshots and the final spec state.
4. Log in Change Log before archiving: `"Feature archived — all stories removed"`.

Archived specs are read-only. To resurrect a feature, copy from `_archived/` back to `docs/specs/` and run `/mf-plan` in Mode A.

---

## Naming Convention

```
docs/specs/<feature>/              ← kebab-case, 2-3 words
  <feature>.md                     ← same name as directory
  snapshots/
    YYYY-MM-DD.md
    YYYY-MM-DD-<REF>.md
```

- Feature name, not module name: `user-auth/` not `AuthService/`
- Sub-specs when splitting: `<feature>-<sub>.md` in the same directory
- No prefix/suffix: `user-auth.md` not `spec-user-auth.md`

**ID rules:**
- `S-NNN` Story — sequential per spec, starting from S-001
- `AS-NNN` Acceptance Scenario — sequential per spec, across all stories, starting from AS-001
- `FR-NNN` Functional Requirement — if needed
- `SC-NNN` Success Criteria — if needed
- Deleted IDs must never be reused
- **Sub-spec numbering is local.** Each sub-spec starts its own S-001, AS-001 sequence.
  Sub-specs are self-contained (Phase 1 rule), so IDs need not be globally unique.
- **Cross-references between sub-specs** use the sub-spec name as prefix:
  `billing-refund:AS-002` refers to AS-002 in `billing-refund.md`.
  Avoid cross-references where possible — if you need many, the split may be wrong.

---

## Rules

1. **Spec-first.** Code serves the spec, not the other way around.
2. **Single file = current truth.** `<feature>.md` always reflects the current state.
3. **Codebase-aware.** Don't plan features that already exist.
4. **Actionable.** Every AS must be clear enough to implement directly.
5. **Proportional.** Simple feature = simple spec. Don't over-engineer CRUD.
6. **Traceable.** Every AS belongs to 1 story. No orphan AS.
7. **Bounded.** Spec exceeding 7 stories or 20 AS must be split.
8. **Snapshot = mf-plan's job.** Developers do not create, delete, or edit snapshots.
9. **Classification = checklist.** Major/Minor decided by table M1-M6, not judgment.
10. **ID immutable.** Assigned IDs never change, never get reused.

---

## Traps — Common Mistakes That MUST Be Avoided

| # | Trap | Consequence | Rule violated |
|---|------|-------------|--------------|
| TRAP-1 | Update spec BEFORE creating snapshot | Snapshot contains new content, old version lost | Order C3→C5 |
| TRAP-2 | Check M1-M2 then stop, skip M3-M6 | Major change classified as Minor, snapshot missed | Classification M1-M6 |
| TRAP-3 | Skip consistency check (CC1-CC6) | Story without AS, P0 missing error path, spec bloat undetected | C6 Consistency |
| TRAP-4 | Classify behavioral change as "non-semantic" | Important change not snapshotted, not logged | C7 Non-semantic |
| TRAP-5 | Apply changes without waiting for user confirmation | User loses control, wrong changes can't be rolled back | C4 Change report |
| TRAP-6 | Update spec but forget to write Change Log | Change history lost, no one knows what happened | C5 Apply |
| TRAP-7 | Reuse deleted ID (S-003 deleted then assigned to new story) | Confusion with old references in code, commits, conversations | ID rules |
| TRAP-8 | LLM copies spec content instead of using `cp` for snapshot | Lines dropped, formatting altered, truncation — inaccurate snapshot | C3 Snapshot |
| TRAP-9 | Skip Phase 1 (Scope & Split) for large features | Spec bloats >7 stories, hard to maintain, hard to review | Phase 1 |
| TRAP-10 | Write P2-depth AS for a P0 story | P0 story lacks Given/When/Then/Data, developer can't implement | AS Depth |
