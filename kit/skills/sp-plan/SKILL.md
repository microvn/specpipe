---
description: |
  Generate spec with acceptance scenarios (Given/When/Then) from a description
  or update an existing spec. Outputs docs/specs/<feature>/<feature>.md ready for /sp-build.
  Use when asked to "write the spec", "viết spec", "tạo spec", "plan this feature",
  "generate acceptance scenarios", "lên kế hoạch tính năng", or "update spec X with changes Y".
  Proactively invoke this skill (do NOT write code or spec directly) when the user
  has a clear feature description and wants it formalized, or after /sp-explore
  confirms requirements.
  Per project rules: never write code before the spec exists, and never auto-modify
  specs from code — /sp-plan is the only path that touches specs.
  Skip if a current spec already exists and matches the request — go straight to /sp-build.
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
| Business rules | Constraints & Invariants. **A business rule that must hold across MORE THAN ONE endpoint/surface (idempotency / at-most-once / money-conservation / exactly-once / authorization) → a Constraint carrying `scope:`/`surfaces:` (cross-surface invariant); the Scenario Derivation "Cross-surface invariant pass" then forces per-surface coverage (CC5).** |
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
| UI sketches (explore ASCII, E/N/X-annotated) | **sp-plan PARSES the legend and routes by tag**: <br>• `[N]` components → `## UI Notes` Component Tree (build targets, with disciplined hierarchy + ordering + conditional rules — NOT markup) <br>• `[E]` components → `## What Already Exists § UI Inventory` (one row each, with `file:path` evidence from explore's Verify step — `[E]` with no path is a planning error, demote it to `[X]` and emit a Gap) <br>• `[X]` components → `## Gaps (status: open)` (UI surface unclear; explore must clarify before build) <br>If a prototype URL exists, cite it in `## UI Notes` and mark it canonical on conflict — but the prototype is for naming/shape only and is NEVER evidence for `[E]`. If sketch carries no E/N/X legend, treat all as `[N]` and emit a Clarification flagging the assumption. If neither sketches nor prototype URL exist for a UI-bearing feature → emit `GAP-NNN (status: open)` about UI structure. ASCII stays in explore doc as provenance. |

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
2. **THEN if phasing is forbidden by the source** (e.g. SRD chốt "ship together, no phase"): try **scope-by-layer** — produce sibling specs along an orthogonal axis (typically backend + frontend, or service + client) that ship together on the same release branch. This is NOT phasing (both ship in the same PR/release), and it usually duplicates far less than sub-spec-by-flow because BE Data Model and FE Component Notes are different surfaces. Each sibling spec is self-contained; cross-spec contract refs use `<sibling-spec>:S-NNN` / `<sibling-spec>:AS-NNN`. Document the "ships together" intent in each spec's Overview. **Scope-by-layer is the seam-risk path** — the two sides build in isolation, so every cross-spec field MUST become a Linked Field carrying a build-time **seam integration test** (not just the static pin); see §Linked Fields. This is exactly why it ranks below phasing and below keeping the behaviour whole (vertical slice): prefer those to avoid the seam risk.
3. **ONLY IF neither phasing nor scope-by-layer works** → split into sub-specs by flow as last resort. Duplication is accepted but must be called out in each sub-spec's `## What Already Exists`.

This precedence lets T5/T6 protect tight coupling while T1/T2 still bound scope — phasing or scope-by-layer is the route that respects both before file-duplication is forced.

**Linked fields — pin cross-spec contracts when you split.**

Whenever a split produces sibling / sub-specs along a producer↔consumer line (scope-by-layer BE/FE, service/client, or by-flow where one spec reads what another writes), each split protects internal consistency but opens a new failure mode: a field one spec READS but another spec PRODUCES can mismatch on **surface** (read on the list, served only on single-get) or on **lifecycle** (read after refetch, served only in a transient create-response). Both sides pass their own consistency checks — only integration shows the field arriving absent / wrong-shape / silently empty.

So every field / endpoint / contract that one spec reads but another produces is a **linked field**, and you MUST pin it on BOTH sides before the split is done — internal self-consistency is not enough:

- **Consumer side:** name the exact surface it reads the field on (list / single-get / feed-row / event payload / create-response …) AND when (persisted + served on later reads, or only transient in one response).
- **Producer side:** there MUST be an AS (or Constraint) delivering THAT field on THAT surface at THAT time. List the surfaces by name — never "every response".

Record the pins explicitly so Mode C reviewers and `/sp-build` can see them — add a `## Linked Fields` block to each spec on the producer/consumer split (see Spec Template), e.g.:

```
## Linked Fields
- `matchupStatus` — consumed by appointments-fe:AS-012 on the appointment-list row
  (persisted, served on every list fetch). Produced by appointments-be:AS-004 on the
  list surface. ✔ surface + lifecycle match.
- `assignedTrainer` — consumed by appointments-fe:AS-014 on single-get (read after refetch).
  Produced by appointments-be:AS-007 only in the transition response. ✘ lifecycle mismatch → GAP-003.
```

Two traps to flag, never pass:

| Trap | What it looks like | Why it slips |
|------|--------------------|--------------|
| **"Every response"** | Producer prose says "carries X on every matchup response" but its AS only list 2 of 3 surfaces. | Prose wider than the AS is NOT coverage. Only AS-listed surfaces count; the unlisted surface is undelivered. |
| **Lifecycle** | Field appears in the create / transition response; consumer reads it on a later get / refetch. | "Transient-in-response" ≠ "persisted + served". A field present once at create is not readable later unless an AS says it is persisted and served on the read surface. |

When a spec writes "consumes the additive fields defined in `<sibling>` Data Model", VERIFY each named field actually exists in that sibling's `## Data Model` — do not trust the reference. A field listed but not defined there is a concrete spec error.

**Every linked-field mismatch is a spec bug**, fixed by editing the spec (add the producer AS on the right surface, or narrow / correct the consumer side), never by patching code — the code usually already matches its own spec. CC11 enforces this; this subsection pins the form.

**Beyond the static pin, each linked field MUST designate a consumer-side *seam integration AS*** — an AS that `/sp-build` runs as a REAL integration (producer side built + running), asserting the field actually arrives on the consumer's named surface at the named lifecycle. The pin proves the *spec* is internally consistent; the seam test proves the *running system* is. A linked field with a paper pin but no seam test is exactly the hole that ships the absent-field / empty-list bug — the FE↔BE analogue of the cross-surface invariant gap. These seam AS are real-dependency tests, **never mocked** (a mocked seam is vacuous — mocking hides the very surface/lifecycle mismatch). In a layer-split, the controller (not a single-side build) runs the cross-spec seam tests after both sides are built.

**Mode applicability:** the *pinning step above* runs whenever a split is produced — Mode A, or Mode B if a spec it touches participates in a split. The *coverage check* (CC11) runs in **every mode's** consistency pass: Phase 2 for Mode A/B, C6 for Mode C — Mode C is where producer/consumer drift most often enters (a new sibling spec, a new story that reads a field, or a `Then` whose surface changes). Mode B/C audit only the linked fields added or modified this run, never untouched legacy ones (same backward-compat rule as CC7/CC8/CC9).

**G1 vs T2/CC6 precedence — when "no AS gộp" pushes count above 20:**

T2 (>20 AS MUST split) and CC6 (≤20 AS) are **soft targets** for reviewability, not principles. The principle is **no bloat — AS count tracks atom count** (each AS = exactly one stated atom). When G1 (no multi-case AS) forces splitting a merged AS into N atoms, the count goes up but atom count is unchanged — that is NOT bloat, and forcing a re-merge to fit ≤20 produces a *worse* spec.

**Priority when G1 conflicts with T2/CC6:**

1. **G1 always wins.** Never re-merge AS to fit a count target.
2. **CC5 always wins.** Never drop AS coverage of a constraint to fit a count target.
3. **T2/CC6 are documented exceptions, not hard caps**, in the range 20 < N ≤ 30 AS (or 7 < N ≤ 10 stories).

**G1-driven overage requires a justification trail** — written into the spec body's `## Spec Sizing Notes` section (see Spec Template). The trail names every G1 split that pushed AS count above the soft target, so future Mode C reviewers don't "fix" the overage by re-merging:

```
## Spec Sizing Notes

Stories=8 (target 7, in G7 overage range ≤10). AS=27 (target 20, in G7 overage range ≤30).

G1 splits producing the excess AS:
- S-006 reassign: 4 AS for 4 atoms (on-platform happy, off-platform happy, reassign-to-same refused, reassign-from-Requested refused).
- S-008 backfill: 4 AS for 4 atoms (one-match, no-match, ambiguous-with-warning, empty).

No bloat — each AS traces to one stated atom.
```

For specs at or under the soft target (≤7 stories, ≤20 AS), omit the `## Spec Sizing Notes` section entirely.

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

### Story shape — vertical slice (one behaviour, all its layers)

A story is a **vertical slice**: its AS describe ONE behaviour end-to-end across every layer it touches — backend + frontend together where both exist, grouped by the behaviour, not by a layer. **Do NOT split one behaviour into a separate FE-only story and a BE-only story** — that orphans the **seam** (the field one side produces and the other consumes): `/sp-build` then builds the two halves in isolation, each half's own tests pass, and the integration silently breaks (field on the wrong surface / wrong lifecycle). `Execution.files` of a vertical-slice story legitimately spans both `back-end/...` and `front-end/...`.

**Layer-split is a LAST RESORT, not the per-story default.** Splitting a feature into sibling BE/FE specs (scope-by-layer, Phase 1) happens ONLY when the feature is genuinely oversize (hard cap >30 AS / >10 stories) AND phasing is forbidden by the source. When it does, every cross-spec field becomes a **Linked Field carrying a build-time seam test** (Phase 1 §Linked Fields). Within one spec, keep the behaviour whole.

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
**Applies Constraints:** [OPTIONAL — the `C-NNN` cross-surface invariants this story's behaviour can exercise (e.g. `C-002`). A binding, NOT a new ID. Each bound constraint must be covered by an AS (or Gap) in THIS story at the surface it touches — see CC5. Omit if none apply.]

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
[rules that must ALWAYS hold.

A constraint that must hold across MORE THAN ONE story/surface — a **cross-surface invariant**
(idempotency / at-most-once / money-conservation / exactly-once / authorization) — carries two
OPTIONAL fields so its coverage is checked at every surface, not once globally:
- `scope:` the stories whose behaviour can exercise it (e.g. `S-003, S-007`)
- `surfaces:` the named operations it must hold at (e.g. `createIntent, pay, webhook`)
Per CC5, such a constraint then needs an `AS-###` (or `GAP-###`) PER listed surface — one AS somewhere
does NOT satisfy it. Omit both fields for an ordinary single-point constraint (CC5 then needs ≥1 AS, as before).
OPTIONAL metadata: legacy specs and single-point constraints stay valid without it.

C-001: <ordinary rule>. (AS-###)
C-002: <cross-surface rule — e.g. a repeated submit causes at most one charge>.
  - scope: S-003, S-007
  - surfaces: createIntent, pay
  - coverage: createIntent → AS-014, pay → GAP-003]

## Linked Fields
[OPTIONAL — include ONLY when this spec is one side of a producer/consumer split
(sibling specs from scope-by-layer, service/client, or sub-spec-by-flow). Omit entirely
for a standalone spec with no cross-spec field dependency.

One bullet per linked field. Each names the consuming side (`<sibling>:AS-NNN` + surface + lifecycle)
and the producing side (`<sibling>:AS-NNN` or `C-NNN` + surface), then a ✔/✘ verdict. A ✘ must
point to a `GAP-NNN`. See Phase 1 §"Linked fields — pin cross-spec contracts when you split".

- `<field>` — consumed by `<sibling>:AS-NNN` on <surface> (<persisted+served | transient-in-response>).
  Produced by `<sibling>:AS-NNN` on <surface>. ✔ match. | ✘ <surface|lifecycle> mismatch → GAP-NNN.]

## UI Notes
[OPTIONAL — include for UI-bearing features. Converts the explore doc's `UI sketches` (free ASCII) into a disciplined Component Tree the build can consume without re-deriving structure.

**Scope**: this section lists ONLY components to build (`[N]` tags from the explore sketch). Pure-existing components used as-is (`[E]` tags) belong in `## What Already Exists § UI Inventory` with an evidence path, NOT here. An existing component that gets modified or annotated by this feature can appear here in italics with a "(reuse)" marker for context, but the row in `UI Inventory` is the authoritative reuse contract.

**Format**: nested markdown list of component names + hierarchy + ordering, with italic annotations for conditional visibility, empty states, reuse markers. NOT JSX, NOT CSS, NOT HTML tags. Component names only.

**Precedence on conflict**: AS / Constraints > Prototype URL > this Component Tree. UI Notes is structural reference; if it contradicts an AS, the AS wins and `/sp-build` raises a Spec Signal so the conflict is resolved through /sp-plan, not in code.

**Carve-out from G5 impl-vocab ban**: this section is allowed to name components, sections, and design tokens (because it's structural reference, not behavioural assertion). It is NOT allowed to contain JSX, HTML tags, CSS class names, function names, file paths, or any vocabulary banned in AS — those still belong in `Execution.files` of the owning story.

Example:
- `AppointmentsPage`
  - `PendingMatchupsInbox` *(pinned top, collapsible, hidden when empty per C-NNN)*
    - `PendingMatchupRow`: trainee + context + `[Assign Trainer]`
  - `AwaitingResponseInbox` *(pinned below, viewer-conditional)*
    - `AwaitingMatchupRow`: trainee + context + `[Accept]` `[Decline]`
  - `AppointmentList` *(existing feed; each card gains `MatchupStatusBadge`)*

> Source-of-truth: prototype URL `<url>` (canonical on conflict). Tree above is build-time summary.]

## What Already Exists

[Two subsections — keep them visually distinct so `/sp-build` can scan each without the section becoming a junk drawer.]

### UI Inventory
[Existing UI components reusable for this feature. Populated from explore sketch `[E]` tags. Each row MUST carry an evidence path — `[E]` without a path is a planning error.]

| Component | Path | Reuse plan |
|---|---|---|
| `AgentPicker` | `components/shared/agent-picker.tsx` | reuse as-is; add optional prop `excludeUserIds` |

[Omit this subsection entirely when the feature has no FE surface.]

### System Impact & Technical Risks
[Existing non-UI code/flows that partially solve sub-problems — reusing or rebuilding? Includes technical risks from explore (sensitive layers, irreversible mutations, never-integrated paths). Populated from explore's `Impact on existing system` + `Technical risks` fields, NOT from UI sketch tags.]

## Not in Scope
[work considered but deferred — each item with one-line rationale]

## Gaps
[behaviour the description triggers but leaves unspecified — NOT acceptance scenarios.
GAP-NNN (status: open | deferred | resolved): <trigger from the text> — outcome not stated. Source: "<quoted phrase>".
Every gap carries a mandatory **status**: `open` (needs a decision), `deferred` (accepted on purpose — name owner + reason), or `resolved` (became AS-NNN — note which). `/sp-build`'s Spec Coverage Gate lists every non-`resolved` gap so none is silently dropped. Resolving a gap is a spec edit (Phase 3 / Mode C), never an in-code decision. Omit this section only if there are no gaps.]

## Spec Sizing Notes
[OPTIONAL — include only when a G1-driven overage applies (count > soft target but ≤ hard cap).
Documents WHY this spec exceeds the 7-story / 20-AS soft target so future Mode C reviewers
do not "fix" the overage by re-merging G1 splits.

Format:
- Stories=N (target 7), AS=N (target 20). State whether each is under target, at soft target,
  or in G7 overage range (≤10 / ≤30).
- For each over-target dimension: name the G1 splits that produced the excess AS. One bullet
  per affected story, listing the atoms.
- Closing line: "No bloat — each AS traces to one stated atom."

Omit this section entirely when stories ≤7 AND AS ≤20.]

## Change Log

| Date | Change | Ref |
|------|--------|-----|
| <$(date +%Y-%m-%d)> | Initial creation | -- |
```

### Execution Metadata (per story)

Every story carries an `**Execution:**` block. This is what `/sp-build` reads to order, parallelize, and dispatch work autonomously. Keep it machine-readable — one field per line, lowercase keys.

| Field | Values | How to set it |
|-------|--------|---------------|
| `depends_on` | list of `S-NNN`, or `none` | Story B depends on A if B's Given assumes A's Then already happened, or B edits code A creates. Drives build order. |
| `parallel_safe` | `true` \| `false` | **Default `false`; `true` needs evidence.** Set `true` only when `files` is a concrete file list (not `unknown`, not a bare directory like `src/api/`), AND those files are disjoint from every sibling's, AND you verified shared infra (router/index/schema/barrel files) is not co-edited. Directory-level hints, `unknown`, any overlap, any `depends_on`, any doubt → `false`. Two stories both editing `routes/index.ts` are NOT parallel even if their "main" files differ. |
| `files` | path hints, or `unknown` | Best-effort list of files/dirs the story touches (from Phase 0 scan). Used both for parallel-safety and to seed the build subagent's context. `unknown` is allowed but forces `parallel_safe: false`. |
| `autonomous` | `true` \| `checkpoint` | `checkpoint` = the story touches a sensitive/irreversible layer a human should inspect: auth, payment/billing, data migration, deletion, anything not safely revertible. `/sp-build` auto-mode pauses at these. Default `true`. |
| `verify` | command/steps, or omit | How to confirm this story works on its own (the spec-kit "Independent Test"). A concrete command is best — `/sp-build` Gate 1 runs it without reading the diff. **P0 stories SHOULD provide one** (it's the cheap gate that keeps the field from dying unused); P1/P2 may omit. |

**Checkpoint criteria — when to set `autonomous: checkpoint`.** This is the safety gate `/sp-build` actually pauses on; mark it whenever ANY of the following is true for the story:

- **Permissions** restrict the story to admin / privileged role *AND* the action is destructive or irreversible (delete, payout, overwrite shared state).
- **Data impact** includes a migration, backfill, or any irreversible mutation of existing rows.
- **External integration** with a **third-party-controlled** service or store that holds user state — payment / billing (Stripe, etc.), auth / identity (OAuth providers), or any vendor system the team does not own. Merely *handling* PII inside a system you control (your own S3 bucket, your own email pipeline carrying user data) does NOT trigger this on its own — that's normal data flow, not an external-trust boundary.
- **Technical risk** flagged irreversible, never-integrated, or "spike-needed" in the explore doc.
- **Complexity signal = high** AND the story touches any of the above surfaces.

Otherwise the default is `autonomous: true`. Under-marking checkpoint means `/sp-build` auto-mode proceeds without human review on exactly the stories that need it; over-marking means noise. **When in doubt for a one-way action, lean toward checkpoint.**

**Derivation order:** set `files` first (from Phase 0), then `depends_on`, then `parallel_safe` falls out of the two. Don't hand-set `parallel_safe: true` without checking file disjointness — that is the field most likely to cause a build conflict.

**Backward compatibility:** specs written before this block existed are still valid. A missing `**Execution:**` block falls back to a safe sequential build — the exact default values are owned by `/sp-build` (its Auto-Mode A1 step), the single source of truth; don't duplicate them here. Mode B/C: add the block only to stories you add or modify this run, never mass-migrate untouched legacy stories.

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

**Cross-surface invariant pass (run after the atom list).** For every constraint stated as a system-wide rule (or carrying `scope:`/`surfaces:` in `## Constraints & Invariants`), enumerate EVERY story whose `When` can exercise it. Each such story binds it via `**Applies Constraints:**` and carries an AS asserting the invariant's OUTCOME at that surface. **For a stated cross-surface invariant the minimal-safe outcome (at-most-once: a repeat at this surface causes ≤1 effect) IS assertable** — it is the stated invariant applied to the surface, not a new requirement — so write the outcome AS; do NOT downgrade the whole surface to a bare Gap. If the surface's *mechanism* is unstated (e.g. a provider idempotency-key vs a server-side guard), attach a `GAP-NNN` from that AS for the mechanism detail — outcome asserted, mechanism deferred. A surface becomes a *bare* Gap (no AS) only when no minimal-safe outcome is assertable at all. This removes the AS-vs-Gap coin-flip: a money/effect surface under a stated invariant ALWAYS gets an outcome AS (+ a mechanism Gap if needed), never a bare Gap by default. This does NOT invent the invariant — it is already stated; it forces a stated invariant to be acknowledged at every surface it reaches, closing the "stated once, silently dropped at a second endpoint" hole (an idempotency rule that guarded one endpoint but not a second one — the class of bug this pass exists to kill). Still derive-or-Gap for any genuinely unstated outcome: never a guessed one.

**Do NOT add a universal canned edge checklist** (always-ask concurrency / duplicate-submit / deleted-item / stale-session) to every story — that manufactures requirements the text never stated, the exact fabrication this section forbids. Only stated atoms + stated constraints drive AS derivation here. The non-obvious adversarial cases are `/sp-challenge`'s job (its Failure-Mode lens); code-path/branch (if/else) depth is `/sp-build`'s Coverage Map. Three skills, three different questions — `/sp-plan` owns only what the spec states.

### Writing Instructions

**DO:**
- Write AS that test one specific behavior each. If it fails, the developer knows exactly what broke.
- **Make "one specific behavior" mechanical (no multi-case AS):**
  - **No multi-path:** if the AS title OR `When` contains `or` / `hoặc` / `/` / `+` (e.g. "A or B", "via X or shortcut") → SPLIT into separate AS, one per path.
  - **No multi-case formatting:** NEVER write `Given case A/B`, `Then case A/B`, `sub-case`, `variant`. Each AS covers exactly one case.
  - **No mixed intent:** do not combine a primary transition with a secondary property in the same AS (e.g. "Accept transition" is one AS; "Accept is idempotent on retry" is a *separate* AS; two validation gates with different refusal reasons are two AS). The downstream `/sp-build` writes one test node per AS (sp-build §"one test node per primary AS") — gộp ở AS-level đẩy lỗi xuống test-level.
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
| CC5 | Every constraint AND every stated rule/outcome is covered by ≥1 AS — or, if unspecified, by a `GAP-NNN`. Coverage must be explicit: each `C-xxx` line ends with `(AS-###, ...)` or `(GAP-###)`. Story refs `(S-002)` are NOT coverage. `Execution.verify` lines NEVER count. **A constraint carrying `scope:`/`surfaces:` is covered PER listed surface — each surface needs its own `AS-###`/`GAP-###`; one global AS does NOT satisfy a cross-surface invariant.** Follow the CC5 enforcement procedure below | Add the AS (per surface), or record the Gap |
| CC6 | Story count ≤7, AS count ≤20 — these are SOFT TARGETS for reviewability, not principles. Principle is "AS count tracks the atom count (rules + triggers + outcomes) — far more AS than atoms = bloat". **G1-driven overage up to 30 AS / 10 stories is allowed** when each excess AS comes from a G1 split (no AS gộp) and Phase 1 assessment carries the justification trail. Above 30 AS / 10 stories is a hard cap — must split regardless | Add the G1 justification (see Phase 1 §G1 vs T2/CC6 precedence), OR prune padded AS, OR split |
| CC7 | Every story has an `**Execution:**` block; `parallel_safe: true` only if `files` is concrete (not `unknown`/dir-hint) AND disjoint from siblings AND `depends_on: none` | Fix the block — flip to `false` on any overlap/dependency/uncertainty |
| CC8 | Every `depends_on` ID resolves to a story in this spec; the graph is a DAG (no cycles) | Fix the ref or break the cycle — `/sp-build` deadlocks on either |
| CC9 | Every story has a `**Source:**` line anchoring it to a requirement clause (or ticket); no AS has a Then that is only "see GAP-NNN" | Add the Source; convert any gap-shell AS into a pure Gap |
| CC10 | When a `docs/explore/<feature>.md` was used as input, every **non-empty** explore field listed in the Explore → Spec mapping has either produced spec content or been recorded as a `GAP-NNN` / Clarification. Empty explore sections do not fail this check | Re-walk the mapping; if a non-empty explore field has no destination, route it (or record it as a Gap) — closes the "format compliance hides meaning leak" risk |
| CC11 | **(producer/consumer splits only)** Every linked field a consumer side reads has a producer AS (or Constraint) delivering it on the SAME surface at the SAME lifecycle point; the `## Linked Fields` block pins both sides; every "consumes fields defined in `<sibling>`" reference resolves to a real field in that sibling's `## Data Model`; **AND each linked field designates a consumer-side seam integration AS (tested as a real integration, not mocked)**. Skip entirely for a standalone spec with no cross-spec field dependency | Pin both sides (Phase 1 §"Linked fields"); on surface/lifecycle mismatch record a `GAP-NNN` and fix the producer AS or correct the consumer — never code. Verify each named field exists in the sibling Data Model. Add the seam AS if missing |

**CC5 enforcement procedure (mandatory, no exceptions):**
1. Enumerate every `C-xxx` line in `## Constraints & Invariants`.
2. For EACH constraint, append explicit IDs at end of line: `(AS-###, AS-###)` for stated outcomes, OR `(GAP-###)` if unspecified. Story refs `(S-002)` are NOT coverage.
2b. **If the constraint carries `scope:`/`surfaces:`** (cross-surface invariant) — require one `AS-###` (or `GAP-###`) PER listed surface, written `surface → AS-###`. A surface with neither AS nor Gap = FAIL (this is the cross-surface-invariant gate — the createIntent class). For every story in `scope`, confirm its `**Applies Constraints:**` lists this constraint. **An AS counts for a surface ONLY if it actually ASSERTS the invariant at that surface** — a story that binds the constraint but whose AS do not assert it there ⇒ that surface needs an AS or a `GAP-###`, NOT "covered" by binding alone. **Prefer the outcome AS:** for a stated cross-surface invariant the per-surface at-most-once outcome is a stated atom (the invariant applied to the surface), so it MUST be an AS; a *bare* Gap (no AS) at a surface is correct only when even the minimal-safe outcome is genuinely unassertable — otherwise write the outcome AS plus, if the mechanism is unstated, a Gap from it. (This makes the per-surface catch mechanical AND deterministic — no AS-vs-Gap coin-flip between runs.)
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
- Implementation order: derive directly from each story's `depends_on` + priority (the same wave logic `/sp-build` Auto-Mode A1 uses) so the summary matches the actual build order — don't infer order from prose
- Next steps: "Implement stories in order. Use `/sp-build` to verify each story. For complex specs, run `/sp-challenge` first."

**Suggest the HTML view (do NOT auto-render):**

`/sp-plan` only writes the spec markdown. Rendering the scannable HTML view is a separate skill (`/sp-spec-render`) the user invokes explicitly. After Phase 4 summary, point the user at it in 1-2 lines so they know the option exists. Match the user's conversation language.

Include:

- The skill command: `/sp-spec-render <feature>`
- One sentence on what it produces and why they might want it (sidebar TOC, story cards, collapsible AS, dark/light theme — fast human scanning)

Example wording (English — translate as needed):

> Want a scannable HTML view of this spec? Run `/sp-spec-render <feature>` — it generates `<feature>.html` next to the `.md` with a sidebar TOC, story cards with P-badges, collapsible Given/When/Then, and dark/light theme. The `.md` stays the source of truth either way.

Do not invoke `/sp-spec-render` from here. The user chooses when to render.

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
| M6 | Constraint/invariant added or removed; or a constraint's `scope`/`surfaces` widened (it now must hold at a new surface → new coverage obligation) | Adding "balance must not be negative"; adding `pay` to C-002's `surfaces` |

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

**sp-plan creates snapshots. Developers do not create them manually.** Developers do not decide, intervene, or skip.

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

After C5 applies changes, the `.md` is up to date but any previously generated `<feature>.html` is now stale. Don't render it automatically — point the user at `/sp-spec-render` so they invoke it when ready. Match the user's conversation language.

Example wording (English — translate as needed):

> Spec updated. If you have `<feature>.html` from a previous render, it's now stale — run `/sp-spec-render <feature>` to refresh it. If you've never rendered the HTML view for this spec, you can run the same command to generate it.

Do not invoke `/sp-spec-render` from here.

### C6: Consistency check

After updating, verify:

| # | Check | On failure → |
|---|-------|-------------|
| CC1 | Every story has at least 1 AS | Add missing AS |
| CC2 | Every AS belongs to exactly 1 story | Assign orphan AS or delete |
| CC3 | P0 stories have error path AS | Add error AS if missing |
| CC4 | No 2 AS test the same behavior | Suggest merge or delete duplicate |
| CC5 | Every constraint AND every stated rule/outcome is covered by ≥1 AS — or, if unspecified, by a `GAP-NNN`. Coverage must be explicit: each `C-xxx` line ends with `(AS-###, ...)` or `(GAP-###)`. Story refs `(S-002)` are NOT coverage. `Execution.verify` does NOT count. **Constraint with `scope:`/`surfaces:` → covered PER surface (each surface its own `AS-###`/`GAP-###`); one global AS is NOT enough.** Follow the CC5 enforcement procedure (Phase 2 §Consistency Checks above). | Add the AS (per surface), or record the Gap |
| CC6 | Story count ≤7, AS count ≤20 (soft target — G1-driven overage up to 30 AS / 10 stories allowed when documented; see G1 vs T2/CC6 precedence in Phase 1) | Add the G1 justification line in Phase 1 assessment, OR split spec |
| CC7 | Touched stories have a valid `**Execution:**` block; `parallel_safe` consistent with `files`/`depends_on` | Fix the block (no mass-migration of untouched stories) |
| CC8 | No `depends_on` anywhere in the spec points to a removed/missing story ID; graph stays a DAG | Fix dangling refs — **when removing a story, scan the WHOLE spec for `depends_on` pointing to its ID** (justified exception to "no mass-migration": a dangling ref deadlocks `/sp-build`) |
| CC10 | When this Mode C update was driven by a `docs/explore/<feature>.md` (e.g. new explore content), every non-empty explore field used as input has produced spec content (in touched stories/sections) or been recorded as a `GAP-NNN` / Clarification. Empty explore fields and untouched-this-run sections do not fail this check | Re-walk the Explore → Spec mapping (Phase 0); route any non-empty explore field that has no destination, or record it as a Gap |
| CC11 | **(producer/consumer splits only)** For every linked field this run ADDS or MODIFIES — a new/changed consumer read, a new/changed producer AS, or a `Then` whose surface or lifecycle moves — a producer AS still delivers it on the SAME surface at the SAME lifecycle point, the `## Linked Fields` block reflects the change, **and a consumer-side seam integration AS (real integration, not mocked) exists for it**. Untouched legacy linked fields are not re-audited. Skip if the spec has no cross-spec field dependency | Re-pin the touched field both sides (Phase 1 §"Linked fields"); on surface/lifecycle mismatch record a `GAP-NNN` and fix the producer AS or correct the consumer — never code; add the seam AS if the touched field lacks one. A linked-field change is behavioural (M4/M5 if it moves a Given/When/Then) → classify Major and snapshot |

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

Archived specs are read-only. To resurrect a feature, copy from `_archived/` back to `docs/specs/` and run `/sp-plan` in Mode A.

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
8. **Snapshot = sp-plan's job.** Developers do not create, delete, or edit snapshots.
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
