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
| P0-2b | **Explore doc** | Derive feature name from `$ARGUMENTS` as kebab-case (same convention as `docs/specs/<feature>/`). Check `docs/explore/<feature-name>.md`. If no exact match, list `docs/explore/` and fuzzy-match by keywords. If found → read it. Log: "Explore findings found for '<feature>' — using as primary input. Skipping P0-3, P0-4 (already covered)." Continue with P0-5, P0-6. Full field-to-section mapping + Mode A/B/C scope: see **Explore → Spec mapping** subsection right after this table. |
| P0-3 | **Dependency scan** | `ga_architecture` for the module map and `ga_importers` / `ga_callees` on touched symbols to see what this code reaches. Manual import-grep is a fallback. |
| P0-4 | **Reusable utilities** | `ga_symbols` (fuzzy match) on names like `validate`, `format`, `parse`, `<domain>Helper` to find existing helpers; `ga_hubs` to surface the most-connected utilities worth reusing. |
| P0-5 | **Project patterns** | Identify test framework, naming conventions, directory structure from existing code. |
| P0-6 | **Change Log** | If the feature exists, read its Change Log to understand evolution. |

**Tooling rule:** when GA is available (per the probe above), prefer it — `ga_architecture`, `ga_symbols`, `ga_callers`, `ga_callees`, `ga_importers`, `ga_file_summary`, `ga_impact`, `ga_hubs` — over grep/glob/find for every step. Indexed symbol table + typed call/reference edges beat textual matching for discovery and dependency tracing. Use grep when GA is unavailable, or for free-text inside strings/comments.

Record findings as bullet points — carry them into Phase 2 (Data Model, Constraints) and Phase 3 (ambiguity check).

Don't plan in a vacuum. A spec that ignores existing code creates conflicts.

### Explore → Spec mapping

When P0-2b found a `docs/explore/<feature>.md`, route its fields into the spec like this. One-way: explore keeps a stable discovery vocabulary; this skill owns the spec format.

| Explore field | Spec destination + extra signals |
|---|---|
| Feature + Happy path | Overview + Stories (happy-path AS) |
| Unhappy paths + Edge cases + Input validation + External integration failure | Stories (error-path AS) via Scenario Derivation triggers. If the outcome lives in the explore's *Open questions* instead of being stated → emit a Gap, not a guessed AS |
| Business rules | Constraints & Invariants |
| Data impact | Data Model. A migration / irreversible mutation also flips its owning story to `autonomous: checkpoint` |
| Out of scope | Not in Scope |
| Permissions | Story description. Auth / payment / admin-only roles on a destructive story → `autonomous: checkpoint` |
| Notifications | Constraint (delivery promise) or Story (notify-on-event AS) |
| Impact on existing system + Technical risks | What Already Exists (note conflicts). A risk on a sensitive / irreversible layer → owning story `autonomous: checkpoint` |
| Multi-role flow | `Execution.depends_on` across cross-role steps. Cross-role state usually forbids `parallel_safe: true` even when file lists look disjoint |
| Phasing | Phase-1 stories → in this spec; deferred phases → Not in Scope with a one-line rationale (link the phase id). **Phase granularity is atomic: if a Phase-2 entry is "Purge + audit-log", the whole entry stays in Not in Scope even if the explore describes it in detail elsewhere — do not promote a sub-feature out of a deferred phase.** Within a phase: ordering → `Execution.depends_on` |
| Complexity signal | Phase 1 split assessment input. `high` + sensitive surface → `autonomous: checkpoint` on the affected stories |
| Decision rationale | `## Clarifications — <explore-date>` (preserve the "why" — do not re-ask in Phase 3) |
| Assumptions | `## Clarifications — <explore-date>` if behaviour-shaping and confirmed; otherwise `GAP-NNN (status: open)` |
| Open questions | `## Gaps` as `GAP-NNN (status: open)`, one per question, with `Source:` quoting the explore phrase |
| Success metrics + Non-functional (Scale/SLA/Availability/Security-compliance) | `SC-NNN` with the explore-stated number. Vague metric → Gap (not an invented number). PII / payment / audit-trail → owning story `autonomous: checkpoint` |
| Trigger + UI expectation | Fold into AS Given/When/Then content per story (no dedicated section) |

**Provenance.** Every story / AS / GAP / SC derived from the explore doc gets a `Source:` pointing at the explore section it came from — `Source: docs/explore/<feature>.md#<nearest-heading>` (heading-level is enough; quote the phrase if the heading covers many bullets). CC9 enforces presence; this rule pins the form.

**Mode scope** (same backward-compat rule as CC7/CC8/CC9):

- **Mode A** — apply every row in full; the spec is being created from scratch.
- **Mode B** — apply only to stories you ADD this run. If the legacy spec has no `## Gaps` / `## Clarifications` / `SC-NNN` block yet, ADD that section for content sourced from explore — never rewrite legacy sections (Overview, Data Model, Constraints) unless they're explicitly being changed.
- **Mode C** — apply only to stories/sections you ADD or MODIFY this run. Each explore-driven change still goes through C2 classification: a new story = M1 (Major, snapshot); a new constraint = M6 (Major); a new `GAP-NNN (open)` is not in M1-M6 → Minor; an open gap that the explore answers this run is **resolved** (`status: resolved`) and the answer becomes a new AS in its owning story (Minor).

---

## Phase 1: Scope & Split Assessment

Before writing the spec, assess size.

**Input:** Feature description from user (Mode A) or current spec (Mode B).
Mode C does not run Phase 1 — it uses its own flow (see Mode C section).

**Split rules:**

| # | Condition | Action |
|---|-----------|--------|
| T1 | Feature has >7 expected stories | MUST split |
| T2 | Feature has >20 expected AS (soft target; up to 30 allowed when G1-driven, see precedence below). Hard cap at 30 | MUST split (or document G1-overage if 21-30) |
| T3 | Stories belong to different domains (e.g. payment + notification) | SHOULD split |
| T4 | A story can ship independently without depending on other stories | SHOULD split |
| T5 | Stories share a data model or state machine | DO NOT split |
| T6 | Splitting would duplicate >50% of context (entities, constraints) | DO NOT split |

"MUST" = mandatory split, inform user.
"SHOULD" = suggest split, present using **Question Format** with split vs. keep-together as options.
"DO NOT" = keep together, unless user requests split.

**Split-rule precedence — resolving T1/T2 vs T5/T6:**

When T1/T2 fire (oversize) AND T5/T6 also hold (shared data model / state machine / >50% duplication), do NOT jump straight to sub-spec splitting. The rules conflict because the feature is genuinely too big for one slice, not because file-split is the right answer. Resolve in this order:

1. **FIRST: apply Sizing & Phasing** to shrink Phase 1 scope until `stories ≤7` AND `AS ≤20`. Defer lower-value work into `## Not in Scope` as explicit Phase 2/3 items with a one-line rationale. Phase 2 spec is created later via Mode A, referencing the Phase 1 Data Model — no duplication.
2. **THEN if phasing is forbidden by the source** (e.g. SRD chốt "ship together, no phase"): try **scope-by-layer** — produce sibling specs along an orthogonal axis (typically backend + frontend, or service + client) that ship together on the same release branch. This is NOT phasing (both ship in the same PR/release), and it usually duplicates far less than sub-spec-by-flow because BE Data Model and FE Component Notes are different surfaces. Each sibling spec is self-contained; cross-spec contract refs use `<sibling-spec>:S-NNN` / `<sibling-spec>:AS-NNN`. Document the "ships together" intent in each spec's Overview.
3. **ONLY IF neither phasing nor scope-by-layer works** → split into sub-specs by flow as last resort. Duplication is accepted but must be called out in each sub-spec's `## What Already Exists`.

This precedence lets T5/T6 protect tight coupling while T1/T2 still bound scope — phasing or scope-by-layer is the route that respects both before file-duplication is forced.

**G1 vs T2/CC6 precedence — when "no AS gộp" pushes count above 20:**

T2 (>20 AS MUST split) and CC6 (≤20 AS) are **soft targets** for reviewability, not principles. The principle is **no bloat — AS count tracks atom count** (each AS = exactly one stated atom). When G1 (no multi-case AS) forces splitting a merged AS into N atoms, the count goes up but atom count is unchanged — that is NOT bloat, and forcing a re-merge to fit ≤20 produces a *worse* spec.

**Priority when G1 conflicts with T2/CC6:**

1. **G1 always wins.** Never re-merge AS to fit a count target.
2. **CC5 always wins.** Never drop AS coverage of a constraint to fit a count target.
3. **T2/CC6 are documented exceptions, not hard caps**, in the range 20 < N ≤ 30 AS (or 7 < N ≤ 10 stories).

**G1-driven overage requires a justification trail** in Phase 1 assessment, naming the splits:

```
AS count = 21. Target 20. +1 from G1-split (AS-019 split into AS-019a
zero-match-case + AS-019b ambiguous-match-case, each one atom). No bloat
— every AS traces to exactly one stated atom.
```

**Hard cap remains at 30 AS / 10 stories.** Above that, even with G1 justification, the spec is too big to review — MUST phase or scope-by-layer or sub-spec split, regardless of G1.

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

**Mode B:** Read existing spec, add `## Stories` section with AS following depth rules. Give each story you add its `**Execution:**` block; leave untouched legacy stories alone (CC7/CC8 apply to added/modified stories only).

### Story eligibility — NO foundation / scaffold / infrastructure stories

Every story must describe a behavior visible at the system boundary. Do NOT create stories whose Description / AS necessarily use implementation vocabulary (migration, schema/table/column, backfill, stub, scaffold, module/router/service, framework/library) — those stories will always violate the Writing Instructions ban on impl-vocab.

If you believe you need "foundation" work:
- Put structure details in `## Data Model` and reuse notes in `## What Already Exists`.
- Attach the prerequisite work to the real behavior story that owns it via `Execution.files` (and `depends_on` if a sequencing constraint exists).
- If it includes migration / backfill / irreversible data change, set that real behavior story's `autonomous: checkpoint` (see Checkpoint criteria).

**EXCEPTION — scaffold-as-side-effect is allowed.** A story whose AS describes user-visible behavior IS allowed even if its `Execution.files` introduces a new module / router / schema. The ban is on stories whose AS-text *itself* reads as scaffold (e.g. "S-001: Set up payment module" with AS about table creation). Module creation is a side effect of building behavior; it never belongs in the AS-text.

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
**Source:** [the requirement clause(s) this story derives from — quote or reference the description; a ticket/issue ref also counts. This is the story's provenance; its AS inherit it.]

**Execution:**
- `depends_on:` [S-NNN that must be done first, or `none`]
- `parallel_safe:` true | false
- `files:` [path hints this story will touch — or `unknown` if not yet clear]
- `autonomous:` true | checkpoint
- `verify:` [optional — command/steps to verify this story independently]

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
**Source:** [requirement clause(s) this story derives from, or a ticket/issue ref]

**Execution:**
- `depends_on:` [e.g. S-001, or `none`]
- `parallel_safe:` true | false
- `files:` [path hints]
- `autonomous:` true | checkpoint
- `verify:` [optional]

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

## Gaps
[behaviour the description triggers but leaves unspecified — NOT acceptance scenarios.
GAP-NNN (status: open | deferred | resolved): <trigger from the text> — outcome not stated. Source: "<quoted phrase>".
Every gap carries a mandatory **status**: `open` (needs a decision), `deferred` (accepted on purpose — name owner + reason), or `resolved` (became AS-NNN — note which). `/mf-build`'s Spec Coverage Gate lists every non-`resolved` gap so none is silently dropped. Resolving a gap is a spec edit (Phase 3 / Mode C), never an in-code decision. Omit this section only if there are no gaps.]

## Change Log

| Date | Change | Ref |
|------|--------|-----|
| <$(date +%Y-%m-%d)> | Initial creation | -- |
```

### Execution Metadata (per story)

Every story carries an `**Execution:**` block. This is what `/mf-build` reads to order, parallelize, and dispatch work autonomously. Keep it machine-readable — one field per line, lowercase keys.

| Field | Values | How to set it |
|-------|--------|---------------|
| `depends_on` | list of `S-NNN`, or `none` | Story B depends on A if B's Given assumes A's Then already happened, or B edits code A creates. Drives build order. |
| `parallel_safe` | `true` \| `false` | **Default `false`; `true` needs evidence.** Set `true` only when `files` is a concrete file list (not `unknown`, not a bare directory like `src/api/`), AND those files are disjoint from every sibling's, AND you verified shared infra (router/index/schema/barrel files) is not co-edited. Directory-level hints, `unknown`, any overlap, any `depends_on`, any doubt → `false`. Two stories both editing `routes/index.ts` are NOT parallel even if their "main" files differ. |
| `files` | path hints, or `unknown` | Best-effort list of files/dirs the story touches (from Phase 0 scan). Used both for parallel-safety and to seed the build subagent's context. `unknown` is allowed but forces `parallel_safe: false`. |
| `autonomous` | `true` \| `checkpoint` | `checkpoint` = the story touches a sensitive/irreversible layer a human should inspect: auth, payment/billing, data migration, deletion, anything not safely revertible. `/mf-build` auto-mode pauses at these. Default `true`. |
| `verify` | command/steps, or omit | How to confirm this story works on its own (the spec-kit "Independent Test"). A concrete command is best — `/mf-build` Gate 1 runs it without reading the diff. **P0 stories SHOULD provide one** (it's the cheap gate that keeps the field from dying unused); P1/P2 may omit. |

**Checkpoint criteria — when to set `autonomous: checkpoint`.** This is the safety gate `/mf-build` actually pauses on; mark it whenever ANY of the following is true for the story:

- **Permissions** restrict the story to admin / privileged role *AND* the action is destructive or irreversible (delete, payout, overwrite shared state).
- **Data impact** includes a migration, backfill, or any irreversible mutation of existing rows.
- **External integration** with a **third-party-controlled** service or store that holds user state — payment / billing (Stripe, etc.), auth / identity (OAuth providers), or any vendor system the team does not own. Merely *handling* PII inside a system you control (your own S3 bucket, your own email pipeline carrying user data) does NOT trigger this on its own — that's normal data flow, not an external-trust boundary.
- **Technical risk** flagged irreversible, never-integrated, or "spike-needed" in the explore doc.
- **Complexity signal = high** AND the story touches any of the above surfaces.

Otherwise the default is `autonomous: true`. Under-marking checkpoint means `/mf-build` auto-mode proceeds without human review on exactly the stories that need it; over-marking means noise. **When in doubt for a one-way action, lean toward checkpoint.**

**Derivation order:** set `files` first (from Phase 0), then `depends_on`, then `parallel_safe` falls out of the two. Don't hand-set `parallel_safe: true` without checking file disjointness — that is the field most likely to cause a build conflict.

**Backward compatibility:** specs written before this block existed are still valid. A missing `**Execution:**` block falls back to a safe sequential build — the exact default values are owned by `/mf-build` (its Auto-Mode A1 step), the single source of truth; don't duplicate them here. Mode B/C: add the block only to stories you add or modify this run, never mass-migrate untouched legacy stories.

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

### Scenario Derivation — enumerate from the text, assert only what it states

The rule that prevents fabricated tests: **you can enumerate WHEN something happens by reading the description (its triggers, conditions, modals), but you may only assert WHAT happens if the text states it.** Where the two diverge, write a Gap — not a guess.

Before writing AS, list the behavioural atoms the description actually states: triggers (events/actions), conditions ("if / when / unless / only"), rules (modals "must / cannot", thresholds), and stated outcomes. (A quick mental list for a simple feature; write it out when the feature is complex or ambiguous.) Every AS must recombine these atoms — an AS that introduces a noun/concept absent from them is fabrication.

Then cover a scenario class **only when its trigger appears in the text** — never as a fixed checklist to fill. Happy path and stated refusals/errors are already required by the AS rules above; **in addition**, add an AS for each of these *when, and only when, the text triggers it*:
- **alternate valid path** — the text gives another trigger/event that also succeeds;
- **state-dependence** — behaviour the text says differs by a named precondition/state;
- **recovery / rollback** — the story writes or mutates data → what happens on failure or partial write. If the text does NOT state the partial-failure behaviour, that is a **Gap**, not an AS — do not assert atomicity, rollback, or "neither happens without the other" unless the text says so (that is an inference, not a stated outcome).

A class with no trigger in the text → no AS. **Default is absent**: the burden is on *including* an AS (it must trace to a stated atom), never on excluding one. Looking thorough is not a reason to add a scenario.

Two kinds of "missing", handled differently:
- **Underspecified** — trigger present, outcome not stated → a **Gap** (`GAP-NNN`, see the Gaps section), not a guessed AS — and not an AS shell either: never write an AS whose Then is only "see GAP-NNN". If a minimal safe outcome IS assertable (e.g. "request refused, state unchanged"), write that as the AS and point to the Gap for the unspecified detail; if nothing concrete is assertable, it is a Gap alone. *Explore-doc case:* if a trigger appears in the description (Happy path / Edge cases / Permissions / Integration) but its outcome lives in the explore's `Open questions` or `Assumptions` rather than being stated, that is still Underspecified — emit `GAP-NNN (status: open)` with `Source:` quoting the explore phrase; do not invent an AS.
- **Out of scope** — no trigger at all → emit nothing. Don't invent "what about concurrent edits?" when the text never mentions concurrency.

### Writing Instructions

**DO:**
- Write AS that test one specific behavior each. If it fails, the developer knows exactly what broke.
- **Make "one specific behavior" mechanical (no multi-case AS):**
  - **No multi-path:** if the AS title OR `When` contains `or` / `hoặc` / `/` / `+` (e.g. "A or B", "via X or shortcut") → SPLIT into separate AS, one per path.
  - **No multi-case formatting:** NEVER write `Given case A/B`, `Then case A/B`, `sub-case`, `variant`. Each AS covers exactly one case.
  - **No mixed intent:** do not combine a primary transition with a secondary property in the same AS (e.g. "Accept transition" is one AS; "Accept is idempotent on retry" is a *separate* AS; two validation gates with different refusal reasons are two AS). The downstream `/mf-build` writes one test node per AS (mf-build §"one test node per primary AS") — gộp ở AS-level đẩy lỗi xuống test-level.
  - **No Gap-shell AS:** never write an AS whose `Then` is only "see GAP-NNN". Either write the minimal-safe outcome that IS assertable + point to the Gap for the unspecified detail, OR record the Gap alone (no AS). CC9 enforces.
- Anchor every story to its requirement clause(s) in the `**Source:**` line — that is provenance's single home; each AS derives from its story's source. If a behaviour has no clause to anchor to, don't write the AS — record a Gap. (Constraints→AS mapping and Gap source-quotes are useful extras, but the `**Source:**` line is the one place that must always be present.)
- Use concrete values in Given/When/Then — `Given: user with balance $50` not `Given: user with some balance`. When a value is genuinely undecided in the requirements, name it as a parameter (`Given: balance equals the <plan_limit>`) rather than inventing a number — the behaviour is specified, the value is deferred.
- Make every Then observable at the system boundary AND able to distinguish pass from fail — `Then: order status becomes Refunded` / `Then: request refused with "limit reached"`, never `Then: the system works correctly`. Litmus: if you replaced the system with a human doing the task by hand, would the Then still make sense?
- Name edge cases explicitly — `AS-005: Payment with insufficient funds` not `AS-005: Payment error`.
- Each AS should be independent — no AS depends on another running first.
- Include the boundary — `Given: cart with 0 items` and `Given: cart with 999 items`, not just `Given: cart with items`.

**DO NOT produce:**
- Vague AS: "Test that the feature works" — every AS must specify Given, When, Then (or a concrete flow for P2).
- Excessive AS: 30+ scenarios for simple CRUD — over-testing wastes time and creates maintenance burden.
- Implementation-vocabulary AS — **BAN**: HTTP status codes (`200`/`400`/`409`/`429`/etc.), DB error codes, library exception names, function names (e.g. `add_attendee_to_event`), command lines (e.g. "Run `alembic upgrade head`"), `null` / type names, thread / lock / race, timeout, cache, table / SQL / index, or any specific library. These assume a "how" the spec hasn't committed to and can't be reasoned about pre-code. **ALLOW**: domain numbers and units (`balance $50`, `24-hour window`, `3 retries`, `5 failed attempts`) — these describe behaviour, not protocol. Litmus: replace HTTP `400` with "request refused with <reason>"; replace `assigned_trainer_user_id = Sara.user_id` with "Sara is recorded as the assigned trainer". If the impl-vocab word is the only way to write the AS, it's a build-time concern → omit it or record a Gap. Schema/migration detail belongs in `## Data Model`, not in AS.
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
| CC5 | Every constraint AND every stated rule/outcome is covered by ≥1 AS — or, if unspecified, by a `GAP-NNN`. Coverage must be explicit: each `C-xxx` line ends with `(AS-###, ...)` or `(GAP-###)`. Story refs `(S-002)` are NOT coverage. `Execution.verify` lines NEVER count. Follow the CC5 enforcement procedure below | Add the AS, or record the Gap |
| CC6 | Story count ≤7, AS count ≤20 — these are SOFT TARGETS for reviewability, not principles. Principle is "AS count tracks the atom count (rules + triggers + outcomes) — far more AS than atoms = bloat". **G1-driven overage up to 30 AS / 10 stories is allowed** when each excess AS comes from a G1 split (no AS gộp) and Phase 1 assessment carries the justification trail. Above 30 AS / 10 stories is a hard cap — must split regardless | Add the G1 justification (see Phase 1 §G1 vs T2/CC6 precedence), OR prune padded AS, OR split |
| CC7 | Every story has an `**Execution:**` block; `parallel_safe: true` only if `files` is concrete (not `unknown`/dir-hint) AND disjoint from siblings AND `depends_on: none` | Fix the block — flip to `false` on any overlap/dependency/uncertainty |
| CC8 | Every `depends_on` ID resolves to a story in this spec; the graph is a DAG (no cycles) | Fix the ref or break the cycle — `/mf-build` deadlocks on either |
| CC9 | Every story has a `**Source:**` line anchoring it to a requirement clause (or ticket); no AS has a Then that is only "see GAP-NNN" | Add the Source; convert any gap-shell AS into a pure Gap |
| CC10 | When a `docs/explore/<feature>.md` was used as input, every **non-empty** explore field listed in the Explore → Spec mapping has either produced spec content or been recorded as a `GAP-NNN` / Clarification. Empty explore sections do not fail this check | Re-walk the mapping; if a non-empty explore field has no destination, route it (or record it as a Gap) — closes the "format compliance hides meaning leak" risk |

**CC5 enforcement procedure (mandatory, no exceptions):**
1. Enumerate every `C-xxx` line in `## Constraints & Invariants`.
2. For EACH constraint, append explicit IDs at end of line: `(AS-###, AS-###)` for stated outcomes, OR `(GAP-###)` if unspecified. Story refs `(S-002)` are NOT coverage.
3. If no AS exists yet:
   - Stated outcome → write a new AS (split if multi-case per Writing Instructions §"one specific behavior").
   - Trigger present, outcome unspecified → write `GAP-NNN (status: open)` and reference it.
4. `Execution.verify` lines NEVER count as CC5 coverage. The verify command is an implementation aid; the AS/GAP is the spec contract.

All checks must pass before showing the draft to the user. *(Mode B: apply CC7/CC8 to stories added or modified in this run, not untouched legacy stories — see backward-compat below.)*

Show the draft to the user. Wait for confirmation before proceeding.

---

## Phase 3: Clarify Ambiguities

**Gaps come first.** Each `GAP-NNN` from Scenario Derivation is a ready-made clarify question (its outcome is the unknown). Resolve each: the user's answer converts it into an AS (keeping provenance), or it stays a Gap if still undecided. Only after gaps, scan for further ambiguity below.

**Stay trigger-gated:** ask about a dimension only if the description triggered it. Do NOT manufacture speculative questions about classes the text never raised (no concurrency mention → don't ask about concurrent edits) — that is the out-of-scope case, and inventing it is the hallucination Scenario Derivation exists to prevent.

Scan the spec for remaining gaps. Check BOTH the spec content AND the acceptance scenarios:

| Lens | What to look for |
|------|-----------------|
| Behavioral gaps | Missing user actions, undefined system responses, incomplete flows. Which stories lack an error path AS? |
| Data & persistence | Undefined entities, missing relationships, unclear storage/lifecycle |
| Auth & access | Who can do what is unclear, missing role definitions |
| Non-functional | Vague adjectives without metrics ("fast", "secure", "scalable") — add SC-NNN with concrete numbers |
| Integration | Third-party API assumptions, unstated dependencies, SLA gaps |
| Concurrency & edge cases | Boundary conditions and error paths not addressed. Multi-user/concurrency ONLY if the description implies shared/contended resources — don't raise it otherwise |
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
- Implementation order: derive directly from each story's `depends_on` + priority (the same wave logic `/mf-build` Auto-Mode A1 uses) so the summary matches the actual build order — don't infer order from prose
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
| CC5 | Every constraint AND every stated rule/outcome is covered by ≥1 AS — or, if unspecified, by a `GAP-NNN`. Coverage must be explicit: each `C-xxx` line ends with `(AS-###, ...)` or `(GAP-###)`. Story refs `(S-002)` are NOT coverage. `Execution.verify` does NOT count. Follow the CC5 enforcement procedure (Phase 2 §Consistency Checks above). | Add the AS, or record the Gap |
| CC6 | Story count ≤7, AS count ≤20 (soft target — G1-driven overage up to 30 AS / 10 stories allowed when documented; see G1 vs T2/CC6 precedence in Phase 1) | Add the G1 justification line in Phase 1 assessment, OR split spec |
| CC7 | Touched stories have a valid `**Execution:**` block; `parallel_safe` consistent with `files`/`depends_on` | Fix the block (no mass-migration of untouched stories) |
| CC8 | No `depends_on` anywhere in the spec points to a removed/missing story ID; graph stays a DAG | Fix dangling refs — **when removing a story, scan the WHOLE spec for `depends_on` pointing to its ID** (justified exception to "no mass-migration": a dangling ref deadlocks `/mf-build`) |
| CC10 | When this Mode C update was driven by a `docs/explore/<feature>.md` (e.g. new explore content), every non-empty explore field used as input has produced spec content (in touched stories/sections) or been recorded as a `GAP-NNN` / Clarification. Empty explore fields and untouched-this-run sections do not fail this check | Re-walk the Explore → Spec mapping (Phase 0); route any non-empty explore field that has no destination, or record it as a Gap |

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
- `GAP-NNN` Gap — triggered-but-unspecified behaviour; sequential; carries a mandatory status (`open`/`deferred`/`resolved`). When resolved it converts to an AS (which takes the next `AS-NNN`); the gap's text stays in the Change Log trail.
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
