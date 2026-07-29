# core-loop.md — single-story TDD build loop

**Who reads this:** an **inline builder** (loops over every in-scope story, owns `.build-progress`/`.build-checklist`, runs Phase 3/3.5/4.5/5 from `gates.md`), OR a **dispatched Auto-Mode subagent** (builds EXACTLY its one assigned story under the contract pasted into its prompt — Phase 2 loop runs once; does NOT derive/write `.build-progress`/`.build-checklist`; skips Phase 3/3.5/4.5/5; returns spec signals in its report).

**Also read `test-command.md`** (shared — how to resolve `TEST_CMD`/`E2E_CMD` and verify filter patterns) before your first RED run. **Inline builder also reads `controller-prep.md`** once (Foundation Gate + checklist derivation) before Phase 0.5. **Do NOT read `orchestration.md` (controller-only) or `gates.md` (verification — inline reads it after Phase 2; a dispatched subagent never does).** Read `port.md` only if your story is a visual pixel-port (see Phase 0.5). Wherever a step says "derive/store `.build-checklist`", "mark done in `.build-progress`", "tick `.build-checklist`", "run full suite", or "Phase 5" — a dispatched subagent skips it and works against the pasted checklist lines, reporting ticks back to the controller.

---

## Token Discipline (read first — applies to every phase)

This loop's cost is set by turn count and per-turn context growth, not by any cache flag. Every rule below cuts one of those. They are standing instructions, not one-time steps.

- **Batch independent tool calls in ONE turn.** When calls do not depend on each other (multiple reads, several greps, a read + a list), issue them together, never one-at-a-time. Turn count is the dominant cost term — one-tool-per-turn is the single most expensive habit.
- **Write once, don't edit N times.** For a NEW file, compose the whole thing and `Write` it in one shot. Do not build a file up with a dozen incremental `Edit`s — each edit's old/new text and result accumulate in context for the rest of the run.
- **Test in batches, not after every edit.** Verify RED once (per "Filter pattern verification"), implement the story fully, verify GREEN once. Do not re-run the filtered suite after each small edit. One RED run, one GREEN run per story is the target.
- **Never re-read a file you already read this session.** It is already in context. Re-reference it from memory, or `grep` a specific line range for the one detail you need. Large files read in full are debt that never leaves the prefix.
- **Truncate noisy output.** When a command dumps a lot, keep only what you need: failing lines + first ~20 lines of a trace. Do not paste whole green test output or full file dumps into your reasoning.
- **Read only the skill files your story triggers** (SKILL.md READ MAP). A spec with no `## Behavior Matrix` never opens the BM machinery.

These are not optional polish. A 7-AS story that thrashes through 100+ one-tool turns costs an order of magnitude more than the same story built in ~20 batched turns.

---

## Execution Procedure (Phase 0a–Phase 5)

Phases 3, 3.5, 4.5, 5 live in `gates.md`. This file carries Phase 0a → Phase 2 plus the Phase 4 fix loop — everything needed to build one story to GREEN.

## Phase 0a — Graphatlas probe (run once)

Before Phase 0:

1. Call `mcp__graphatlas__ga_architecture` with `max_modules: 1`.
2. Interpret:
   - Returns `modules` → **GA available.** Use `ga_*` for locate / call-graph / impact below. Grep is fallback.
   - Error `STALE_INDEX` → call `mcp__graphatlas__ga_reindex` (mode `"full"`), retry once, then treat as available.
   - Tool not found / connection error / any other failure → **GA unavailable.** Use grep/glob throughout. Do not re-probe.
3. After edits, the graph goes stale. Don't reindex on a schedule — instead, when a later `ga_*` call returns `STALE_INDEX`, call `mcp__graphatlas__ga_reindex` (mode `"full"`) once then retry. On large repos a full reindex is not cheap, so reindex on demand, not per story.

---

## Phase 0: Build Context

1. **Find what changed:**
   ```
   BASE=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||') || BASE="main"
   git diff --name-only "$BASE"...HEAD
   ```
   If `$ARGUMENTS` provided → scope to that file or feature only.
   This scan exists for **regression detection** on code the branch already changed — a fresh build from spec legitimately has no diff yet, which is fine: proceed to step 2. Only stop with "Nothing to build — specify a spec, feature, or file" when there is no spec/`## Stories`, no `$ARGUMENTS` scope, AND no diff.

   **Regression auto-detect:** List lines removed or modified from existing code (not pure additions):
   ```
   git diff "$BASE"...HEAD -- <src> | grep -E "^-[^-]" | head -50
   ```
   For each modified function identified, evaluate whether behavior changed. Classify each change:
   - **Behavior changed** → regression test REQUIRED covering the old behavior path (see REGRESSION RULE in Phase 1.5).
   - **Pure refactor** (rename, format, extract helper, comment, type-only) → no new test required; add 1-line note in summary `REFACTOR_ONLY: <file:line> — <why no behavior change>`.

   Do not skip this classification silently. If unsure whether a change is behavior-changing, treat it as behavior-changing.

2. **Read the spec** at `docs/specs/<feature>/<feature>.md` — but **scope the read to what you build, do not slurp the whole file.** The spec stays resident and is re-billed every turn, so for a large spec (say >200 lines) read only your in-scope `## Stories` block(s) + their AS, the `## Overview`, and the `## Constraints` referenced by those stories; `grep` for other sections on demand. Read the whole file only when it is small or you genuinely build every story. The `## Stories` AS are your roadmap; `## Overview`/`## Constraints` carry the INTENT. (Dispatched subagent: your story text + AS + relevant Constraints + checklist lines were pasted into your prompt — do not re-read the whole spec; grep it only for a specific section you're missing.)

3. **Check build progress:** Look for `docs/specs/<feature>/.build-progress`.
   - If found → read it, find the first line marked `pending` → resume from that story.
     Log: "Resuming from S-00X (previous session progress found)."
   - If not found → start from S-001 as normal.

   File format:
   ```
   S-001 done
   S-002 done
   S-003 pending
   ```

4. **Locate related code.** **If GA available (per Phase 0a):** `ga_symbols` on the main function/type names from the spec → definitions; `ga_callers`/`ga_callees` → dependency chain; `ga_impact(symbol=...)` → blast radius + affected tests; `ga_architecture` → confirm module/layer (auth, payment, core); `ga_file_summary` before reading a file in full. **If GA unavailable:** grep for the main function/type names in the changed files. Batch these locate calls (Token Discipline).

5. **Read existing tests** for the changed files — find patterns, fixtures, naming conventions. Don't duplicate.

---

## Phase 0b: Foundation Gate → moved to `controller-prep.md`

The Foundation Gate (runnable-harness precondition) is owned by the controller (Auto-Mode A1.0) and run once by the inline builder before the loop. It lives in `controller-prep.md` now so the controller reads it without pulling these build steps. A **dispatched subagent skips it** — by the time it runs, the harness is guaranteed. (Inline builder: read `controller-prep.md` once before Phase 0.5.)

---

## Phase 0.5: Implementation Risk Check

Run after Phase 0. Takes 2 minutes. Checks only what is visible at implementation time
(sp-challenge already reviewed the spec adversarially — this catches code-level issues only).

- **N+1:** For each story involving a list/loop — will implementation query DB inside the loop? Flag before writing the test.
- **DRY:** Grep for similar logic in existing code. If found, reuse — don't duplicate.
- **Error paths:** For each story — what can go wrong? (null, empty, network fail, invalid input) Note these upfront so they land in the Coverage Map, not as afterthoughts.
- **Pattern:** What's the existing pattern for this type of operation in the codebase? Follow it unless there's a reason not to.
- **UI Notes + UI Inventory (FE stories only):** Read TWO sections before writing the failing test:
  1. `## What Already Exists § UI Inventory` — list of existing components with paths the spec marked reusable for this feature. **Skim this FIRST** to find reuse candidates before assuming a Component Tree entry needs new scaffolding. Each row in UI Inventory carries a `file:path` you can open to check the actual API.
  2. `## UI Notes` Component Tree — components this story must produce. Use it to shape layout / section order / hierarchy.
  **Precedence: AS / Constraints > Prototype URL > UI Notes.** If you detect a contradiction (e.g. AS says "notify user" but the Component Tree has no notification surface, OR Component Tree shows a button the AS never references), STOP and raise a Spec Signal — do NOT build to the UI Notes and ignore the AS. UI Notes is structural reference; the AS is the contract.

  **Visual pixel-port stories → read `port.md`.** If a story requires the built UI to **match a canonical design source 1:1** (spec's `Prototype URL`, an HTML prototype path, or a Figma URL/node) AND the stack is **web/DOM** (React/Vue/Svelte/HTML), it is a visual port: read `port.md` for the split between behaviour (owned here) and pixel fidelity (owned by `/sp-port-webui`). Do NOT hand-code the surface from prose. Backend-only, behaviour-only-with-no-canonical-design, and native-mobile stories are NOT ports — build them inline here and ignore `port.md`.

Output: 2-3 line summary. Feeds into Phase 1.5 Coverage Map.

---

## Phase 0.6: Spec Checklist → moved to `controller-prep.md`

Checklist derivation is owned by the controller (Auto-Mode A1.3) and the inline builder — it lives in `controller-prep.md` now. A **dispatched subagent skips derivation**: the controller already derived `.build-checklist` and pasted this story's lines into your prompt; work against those line IDs and report ticks back. (Inline builder: read `controller-prep.md` § Phase 0.6 once before Phase 1.)

---

## Phase 1: Decide What to Test

Test behavior, not implementation. If the internals change but behavior stays the same, tests should still pass.

**What NOT to test:**
- Private/internal methods (test through public API)
- Framework behavior (test YOUR handler, not that Express routes work)
- Trivial getters/setters (unless they have validation)
- Implementation details (HOW it works — test WHAT it does)

**Edge cases to consider per story** (these are the rows of the Edge Case Compliance Table below — the depth check, separate from AS-ID coverage):
- Null/undefined · empty · invalid type · boundary (min/max) · error path · race/concurrency · large data · special chars (unicode/SQL).

For each, add the assertion **inside the owning AS's test** when that AS's behaviour reaches it. This is test DEPTH, not coverage — coverage (every AS has a test) is the Spec Coverage Gate's job; this forces you not to skip edge thinking within a test. A genuinely-missed edge the spec never captured = a **spec signal (S1)**, not a quiet tick.

**Quality check for each test:**
- Does it test one concept? If it fails, do you know exactly what broke?
- Is it independent? No test depends on another running first.
- Is it deterministic? No random, no time-dependent, no external service calls.
- **Name embeds the AS-NNN it covers**, then the scenario: `AS-007: returns 403 when role missing`. The ID makes coverage machine-checkable (Spec Coverage Gate); the description keeps it readable. One test node covers exactly one primary AS — shared setup is fine, a shared assertion standing in for several AS is not (it masks under-coverage).

**Completeness Principle:**

AI writes tests significantly faster than humans. When deciding test scope:

| Task type | Human | CC | Compression |
|-----------|-------|----|-------------|
| Boilerplate tests | 2 days | 15 min | ~100x |
| Edge case + error paths | 1 day | 15 min | ~50x |
| Feature | 1 week | 30 min | ~30x |
| Bug fix | 4 hours | 15 min | ~20x |

Rule: Default to writing the complete test set. AskUserQuestion only when the gap genuinely affects design choice (not effort). Do NOT use self-estimated effort as a justification to skip — LLMs under-estimate when motivated to move on.

**Edge Case Compliance Table (per story) — a THOROUGHNESS forcing-function, NOT a coverage claim.**

This is orthogonal to the Spec Coverage Gate (`gates.md`), not a rival: the gate guarantees every AS has a test (breadth, counted on AS-IDs); this table forces each story's tests to consider edge DEPTH — because agents reliably skip edge cases when left to their own judgement, and the gate cannot see that (a test named `AS-005` that only checks the happy path still passes the gate). An `N/A` here means "considered, doesn't apply" — it is never a coverage gap; coverage is the gate's job alone.

Fill this table in the Phase 5 summary for each story. Every row is `✓` (an assertion exists, inside the owning AS's test) or `N/A + 1-line reason`. Blank rows are not allowed.

| Edge case | Status | Test name / Reason if N/A |
|-----------|--------|---------------------------|
| Null/Undefined input | | |
| Empty array/string | | |
| Invalid types | | |
| Boundary values | | |
| Error paths | | |
| Race conditions | | |
| Large data | | |
| Special characters | | |

`N/A` is valid only with a reason (e.g. "N/A — function takes an enum, invalid type impossible at the type layer"). The context-dependent rows (race, large data, special characters) will often be `N/A` for a given story — that is expected and honest, not gaming. The cheap-and-usually-relevant rows (null, empty, boundary, error) should rarely be `N/A`. If filling a row would mean a junk test for behaviour the AS can't reach, mark `N/A + reason` — don't manufacture the test; and if you find a real edge the spec never captured, raise it as a **spec signal (S1)**, don't just tick it here.

**Engineering instincts — apply when deciding test scope:**
- **Systems over heroes:** Design tests for a tired dev at 3am, not your best engineer. If a test requires knowing internals to understand, it will fail the wrong person at the worst time.
- **Blast radius instinct:** For each Coverage Map GAP — if this path breaks in prod, how many users/systems are affected? High blast radius → mandatory test, no deferral.
- **Make the change easy, then make the easy change:** If writing a test is hard, the production code is tangled. Refactor structure first (separate commit), then add the test.
- **Reversibility preference:** When two approaches have equal coverage, pick the one easier to delete when behavior changes. Brittle tests are technical debt disguised as coverage.

---

## Phase 1.5: Coverage Map

Before writing tests, trace all paths and draw a diagram to see gaps upfront — not after.

**Step 1 — Trace code paths:** For each changed function/component, follow data through every branch: if/else, switch, guard clause, early return, try/catch, error boundary. Trace into helper functions if they have untested branches.

**Step 2 — Trace user flows:** For multi-step features, trace the user journey. Edge cases: double-click/rapid resubmit, navigate away mid-op, submit stale data (session expired), slow connection, concurrent actions (2 tabs open).

**Step 2b — Trace Behavior Matrix cells (ONLY if the spec has `## Behavior Matrix`):** copy every non-N/A cell into the Coverage Map before drawing the diagram. Each cell is a QA-visible obligation, not just prose. Classify the test level by the cell's surface:
- Same-process logic/state cell → unit or integration is acceptable if it observes the public boundary.
- Cross-surface parity cell (list/detail/feed/API/dashboard/worklist) → integration/E2E over the real producer/consumer path.
- External/provider surface (calendar/email/payment/identity) → contract/integration against the verified boundary or provider fake that is itself verified; never a pure mock of the boundary under test.
- Timing/source cell (`realtime`, `refresh-required`, `persisted+served`, `transient`) → the test must assert that lifecycle point, not just the immediate action response.

**Step 2c — Trace Core Function Model (ONLY if the spec has `## Core Function Model`):** copy confirmed entry points, internal seams, external contracts, invariants, optional/absent inputs, and unknown semantics into the Coverage Map. Each item must point to `AS-NNN`, `C-NNN`, `GAP-NNN`, or BM coverage. A model item without coverage is a Spec Signal, not permission to invent behavior. Provider/external semantics require a real boundary assertion at the named seam; do not mock the seam the test claims to verify.

In the diagram, prefix Behavior Matrix rows with `[BM]` and keep the AS id visible:

```
BEHAVIOR MATRIX COVERAGE
========================
[BM] Confirmed × trainer × worklist — AS-004
    ├── [GAP] [→E2E] assigned trainer sees updated item
    └── [GAP] [→E2E] non-runner does not see item
```

**Step 3 — Draw the diagram:**

```
CODE PATH COVERAGE
===========================
[+] src/services/example.ts
    │
    ├── processX()
    │   ├── [★★★ TESTED] Happy path + error — example.test.ts:42
    │   ├── [GAP]         Network timeout — NO TEST
    │   └── [GAP]         Invalid input — NO TEST
    │
    └── helperY()
        ├── [★★  TESTED] Normal case — example.test.ts:89
        └── [★   TESTED] Smoke check only — example.test.ts:101

USER FLOW COVERAGE
===========================
[+] Checkout flow
    │
    ├── [★★★ TESTED] Complete purchase — checkout.e2e.ts:15
    ├── [GAP] [→E2E] Double-click submit — needs E2E, not unit
    ├── [GAP]         Navigate away mid-op — unit sufficient
    └── [GAP] [→EVAL] Prompt template change — needs eval

─────────────────────────────────
COVERAGE: 3/7 paths tested (43%)
  Code paths: 2/4 (50%)
  User flows: 1/3 (33%)
QUALITY:  ★★★: 1  ★★: 1  ★: 1
GAPS: 4 paths need tests (1 need E2E, 1 need eval)
─────────────────────────────────
```

**Legend:**
- `[★★★ TESTED]` = test covers edge cases AND error paths; include `file:line`
- `[★★  TESTED]` = test covers happy path only; include `file:line`
- `[★   TESTED]` = smoke test / trivial assertion; include `file:line`
- `[GAP]` = no test — **MUST write in Phase 2**
- `[GAP] [→E2E]` = needs E2E test: flow spans 3+ components, auth/payment/data-destruction
- `[→MANUAL]` = Non-testable layer (view, template, styling). Note the visual check needed (e.g., "confirm error banner appears on invalid input"). Always test the logic backing it.
- `[GAP] [→EVAL]` = needs eval: prompt template or LLM output changed. When flagged: define capability + regression evals before implementing, run baseline and capture failure signatures, implement minimum passing change, re-run and report pass@1 and pass@3. Release-critical paths should target pass@3 stability before merge.

**E2E Decision Matrix:**

| Use E2E `[→E2E]` when | Use unit test when |
|---|---|
| Flow spans 3+ components/services | Pure function, clear inputs/outputs |
| Mocking hides real failures (API→queue→worker→DB) | Internal helper, no side effects |
| Auth / payment / data destruction | Single-function edge case (null, empty) |

**E2E is AUTHORED, not just flagged.** A `[→E2E]` path is NOT a TODO you list and move on. For **critical flows — auth, payment, data-destruction, and each story's primary cross-component happy path** — you WRITE the E2E test and drive it RED→GREEN on `E2E_CMD` (see `test-command.md`), exactly like a unit test. Modern E2E is cheap and scriptable (Playwright/Cypress/Detox) — "it spans components" is a reason to write the E2E, not skip it. Only a **non-critical** `[→E2E]` flow may be DEFERRED to Phase 5 "E2E" with a one-line reason (budget/env). A **critical** `[→E2E]` left unwritten makes the build **DONE_WITH_CONCERNS**, never DONE. (Mocking a critical cross-component flow at unit level is the vacuous-test trap — the decision matrix routed it to E2E precisely because mocks hide its failures. The same applies to a Linked-Field seam: real E2E/integration, never mocked.)

**Testability Classification — classify by what the code does, not what framework it uses:**

| Code category | Examples | Strategy | Tag |
|---|---|---|---|
| Logic | Service, ViewModel, Presenter, Utils, Parser, Validator | Unit test directly — inputs, outputs, state transitions | (default) |
| View / Template | UI render, layout, data binding, template markup | Extract logic to testable layer; mark view code `[→MANUAL]` | `[→MANUAL]` |
| Pure presentation | Styling, spacing, animation, theming | Visual verification only | `[→MANUAL]` |
| Glue / Wiring | Dependency injection, route registration, config binding | Test through integration or E2E | `[→E2E]` or skip |

Rule: If a view/template contains conditional logic (if/else, loops with filtering, computed display values) — extract that logic into the testable layer (ViewModel, Presenter, helper) and unit test there. The view becomes a thin binding with no logic to test.

**Diagram is mandatory.** Even when all paths are covered, you must still produce the diagram with `[★★★ TESTED]` / `[★★ TESTED]` / `[★ TESTED]` entries including `file:line` references for each. Do not replace it with "All paths covered ✓". The diagram is the evidence — a one-line claim is not.

If every path is already covered, the diagram will have zero `[GAP]` rows — that is fine. Write it anyway and proceed to Phase 2.

**REGRESSION RULE:** If the diff changes existing behavior AND no test covers that path → a regression test is a **CRITICAL requirement. No asking. No skipping.**

**BOUNDARY-PAIR RULE (reject/deny rules — catches over-rejection).** *Applies only if a story has an AS or constraint whose outcome is refused / rejected / blocked / denied — else skip.* A single negative test is not coverage — reject-everything passes a reject-only test. The path needs a **pair**: (1) a **negative** test — the bad input is rejected, AND (2) a **positive** test — the nearest *valid* input is ACCEPTED. This is exactly the C-018 miss: "reject SVG entity-bombs" was built as "reject ANY `<!DOCTYPE>`", and because the only test data was a bomb, no test asserted that a benign SVG (including one with a legitimate `<!DOCTYPE>`) is accepted — the over-rejection shipped as a user-visible defect. If the spec has a reject AS but no matching **accept** AS to pair it with, that is an upstream gap → **raise a spec signal (S1)** so `/sp-plan` adds the accept-side AS (CC5b); do not silently build only the reject half. The accept partner is a checklist obligation, not optional depth.

**LINKED-FIELD SEAM RULE.** *Applies only if the spec has a `## Linked Fields` block — else skip.* It is one side of a producer/consumer split; each linked field's **seam AS is a real-integration test** — run it against the ACTUAL producer (build the producer side first; the consumer spec's seam tests run against it), **never a mocked consumer**. A mocked seam is a vacuous test: the mismatch it exists to catch — field on the wrong surface (list vs single-get) or wrong lifecycle (transient-in-response vs persisted+served) — is exactly what the mock hides. Do NOT mark a consumer story `done` on a mocked seam. **Auto-Mode:** a single-side subagent cannot see the seam — the controller runs the cross-spec seam tests after both sibling specs are built (A4b/A7).

**BEHAVIOR MATRIX NO-VACUOUS-MOCK RULE.** *Applies only if the spec has `## Behavior Matrix` — else skip.* If a `## Behavior Matrix` cell names a surface/source/timing boundary, the test for that cell must not mock the boundary it is meant to verify. Examples:
- API list vs single-get parity → do not assert against fabricated response fixtures only; exercise the real read serializers/handlers or an integration path that uses them.
- Calendar/email parity → do not mock both email and calendar recipients from the same test fixture; verify the mapping into each outbound contract or a verified provider fake.
- Worklist/feed/dashboard cascade → do not mock the read model that should be updated; verify the persisted/read-model result after the state transition.

A mocked dependency is allowed only outside the boundary under test. If you cannot test the boundary with the current harness, mark the BM checklist line `[~]` with a concrete destination (`/sp-scaffold` E2E harness, contract-test story, or Known-Gap). Do not mark it `[x]`.

**TERMINAL LIFECYCLE CASCADE TEST RULE.** *Applies only if a Behavior Matrix cell or AS describes a terminal lifecycle action* (`done`, `completed`, `cancelled`, `declined`, `log outcome`, `terminal outcome`, `overdue outcome`, `reschedule creates replacement`) that removes, cancels, replaces, or advances pending work — else skip. The owning checklist MUST include a named cascade test. The test name or evidence must contain the word `cascade` and assert the downstream work surface changed, not only the primary record. Examples:
- Pending matchup terminal outcome → assert pending matchup queue/assignment affordance is removed or cancelled.
- Reschedule/next appointment → assert old and new appointment state, runner/owner carry-forward, and affected calendar/worklist surfaces.
- Outcome-created tracker/todo/FNA/production records → assert the downstream record is visible to the required viewer(s) with the expected role fields.

Do not satisfy this rule with a unit test that only checks `is_done`, status text, or a returned DTO. If the downstream surface cannot be exercised in the current harness, mark the BM line `[~]` with a concrete cascade-test destination. A terminal lifecycle BM line without a cascade test is not DONE.

---

## Test Command → see `test-command.md`

`TEST_CMD`/`E2E_CMD` resolution and the mandatory **Filter pattern verification** (a filtered run matching 0 tests exits 0 = false green) live in `test-command.md` — shared, single copy. Read it before your first RED run so your filtered runs are trustworthy.

---

## Phase 2: Story Loop (RED → GREEN → REFACTOR)

Work through stories one at a time from the spec's `## Stories` section (a dispatched subagent runs this loop exactly once, for its one story). Follow the project's existing test patterns. Apply Token Discipline throughout: batch reads, write test files in one shot, one RED run + one GREEN run per story.

**For each story:**

### Step 1 — RED: Write test, verify it fails

Write tests for the story's acceptance scenarios. Compose the whole test file and `Write` it once — do not add tests one Edit at a time.

First, verify the filter pattern matches the new test (see `test-command.md` § Filter pattern verification). Then run once:
```
TEST_CMD --filter "<story test name>"
```

**Capture and paste the raw failure output** (stack trace / assertion diff / first 20 lines) into your notes — this is the evidence for the `RED → GREEN` claim in Phase 5. A summary like "3 fails" without the raw text is not sufficient evidence. (Keep it to the failing lines + ~20 lines of trace — Token Discipline; do not paste the whole run.)

- **FAILS** → correct. The test describes behavior that doesn't exist yet. Continue to Step 2.
- **PASSES** → the behavior already exists. Either the test is wrong (assertions too weak) or the code already handles this case. Investigate before continuing. If already covered, mark story `done` and move to the next story.
- **0 TESTS MATCHED** → filter pattern did not register. Fix test name / file location. Do NOT proceed.

### Step 2 — GREEN: Implement minimal production code

Write the production code that makes **ALL** the story's failing tests pass — every AS test and every edge assertion you wrote in RED. **"Minimal" = the YAGNI guard** (no speculative code, no gold-plating, no handling for a case that no test exercises) — it is **NOT "the least to pass one test"**. Completeness comes from the **test set being complete** (Phase 1 + the Coverage Map already wrote a test for every case); the code then rises to satisfy all of them. If you find yourself wanting to write code for a case that has *no test*, STOP — that is a missing test: go back to RED (or it's a Phase-1 / Coverage-Map gap, or an S1 spec gap). Never silently over-build past the tests, and never under-build below them.

> **TDD GREEN vs "NEVER fix production code" (Phase 4) — disambiguation:**
> - Writing NEW production code to satisfy a NEW failing TDD test: **REQUIRED** (this is GREEN).
> - Modifying EXISTING production code because an EXISTING test started failing in Phase 3/4: **requires AskUserQuestion first** (this is the "NEVER" rule).
> The difference is: TDD writes code toward a test written moments ago. Fix Loop touches code that was already green. Don't confuse the two.

Implement the whole story, THEN run once (filtered):
```
TEST_CMD --filter "<story test name>"
```
Do not re-run after each incremental edit (Token Discipline) — implement fully, run once.

- **PASSES** → continue to Step 3.
- **FAILS** → fix production code (not the test). Max 3 attempts, then stop and report per Phase 4.

### Step 3 — REFACTOR (optional)

If the implementation introduced duplication, unclear naming, or violated existing patterns — refactor now while tests are green. Run tests after refactoring to confirm nothing broke.

### Step 4 — Update progress

**Dispatched subagent: skip this whole step** — do not write `.build-progress`/`.build-checklist`; report your ticks + test names in your report contract instead. The rest is for the inline builder.

Mark the story `done` in `.build-progress`:
```bash
# Example after S-002 passes:
# S-001 done
# S-002 done
# S-003 pending
```
Write the full file each time (overwrite, not append) to keep state clean.

**Test count assertion (MANDATORY):** Confirm tests were actually added by diff-counting:
```
git diff --stat <test-dir>
```
Record for the Phase 5 summary: `S-00X added N tests: <list exact test names>`. Test names must be grep-able in the test file.

- **N ≥ 1** → normal case. Story is `done`.
- **N = 0** → only acceptable if the story is a pure refactor AND existing tests already cover the changed path. Record: `S-00X added 0 tests: REFACTOR_ONLY — covered by existing <file:test name>`. Otherwise, story is NOT `done` — add tests first.

**Checklist update (MANDATORY):** Open `.build-checklist` and tick the lines this story covers:

```
[x] AS-012.T1 — covered by affected_tests_test.rs:test_convention_match
[~] AS-012.T2 — PARTIAL: query wired, emit deferred → M3 S-008
[x] BM.AS-012.appointment-list — covered by appointment_reschedule_e2e.ts:AS-012 list row parity
```
For `[x]`, record `file:test-name`. For `[~]`, record the destination.

If a checklist line starts with `BM.`:
- The `file:test-name` must include the AS id from the BM line.
- The test must assert the exact cell surface/source/timing from the Behavior Matrix row.
- Before ticking `[x]`, apply the Behavior Matrix No-Vacuous-Mock Rule. If the test mocks the named boundary, mark `[~]` with a concrete destination instead.

**Carve-out scan on the story diff:**
```
git diff <story-files> | grep -nE "TODO|FIXME|XXX|HACK"
```
Each match not already in the checklist → add a new `[~]` line with destination. Matches without a concrete destination → the story is NOT `done`; either (a) create a new story in the plan, or (b) add a Known-Gap row to the spec, before closing.

**Concrete destination** = one of these grep-able sources (priority order):
1. Story ID in `docs/specs/<feature>/<feature>.md` (section `## Stories` — grep `S-NNN` or `M<X> S-NNN`)
2. Row in `<feature>.md` Known-Gaps / Not-in-Scope section
3. Issue tracker ID if the project declares one (GitHub `#NNN`, JIRA `ABC-NNN`) — verify with `gh issue view` or URL regex; no online check required if the author confirms
4. External plan file if the project declares `plan_file: <path>` in CLAUDE.md

Not accepted: TODO.md, free-form code comments, "future work", "later", "Phase X" without a corresponding row.

**If the project does not use a formal spec/plan** (bug fix single story, no /sp-plan): skip the destination rule for this build, replace with a lighter rule "each TODO in diff must have a 1-line justification in the summary" — log in Phase 5 output as `CARVE_OUT_RELAXED: no spec context`.

**Reverse-map check (catch orphans — code exists, spec does not):**

For each "artifact" newly appearing in the story diff (not only TODOs):
- New file under `src/` production (not tests)
- New publicly exported function/class/type
- New DDL/schema object (table/index/enum) — detect in a language-agnostic way by grepping the declarative keywords this project uses
- New public API endpoint / CLI command
- New config key / feature flag

For each artifact → ask: "which checklist line (AS/Constraint) requires this artifact to exist?"

- Maps to ≥1 checklist line → OK
- No mapping → FLAG ORPHAN. Three ways to handle:
  (a) Artifact is genuinely required → add a checklist line sourced from the AS/Constraint that requires it. If no AS requires it → the spec is missing coverage; add a Known-Gap or run `/sp-plan` to add an AS
  (b) Artifact is infrastructure for a later story → convert to `[~] <artifact> — deferred use → <future story/gap>`
  (c) Orphan (legacy/experiment) → remove or justify in the spec

This rule is **language-agnostic**: the dev decides what counts as an "artifact" based on the diff. The skill does not grep DDL or parse ASTs. It only requires "everything new has a documented reason".

**Ordering gate:** tick the checklist BEFORE marking the story `done` in `.build-progress`. If a checklist line with `owner: <this-story>` is not yet ticked or converted to `[~]`/`[N/A]` → story is NOT `done`. One-way sync: progress = f(checklist).

**Then proceed to the next story.** (Phase 4 below is the fix loop invoked when a story's tests won't go GREEN — it belongs to this build loop. Phase 3/3.5/4.5/5 — full suite, coverage gates, summary — live in `gates.md`; the numbering is a stable identity carried over from the single-file version, not a reading order.)

---

## Phase 4: Fix Loop

If tests fail:
1. Read error output. Is the test wrong or the production code wrong?
2. If production code seems wrong → use `AskUserQuestion`:

```json
{
  "questions": [
    {
      "question": "Test expects <X> but code does <Y>. Which is correct?",
      "header": "Test vs Code Mismatch",
      "multiSelect": false,
      "options": [
        {"label": "Fix production code — the test is correct (human: ~30m / CC: ~10m) | Completeness: 10/10"},
        {"label": "Adjust the test — the code behavior is intentional (human: ~10m / CC: ~5m) | Completeness: 7/10"}
      ]
    }
  ]
}
```
3. Fix test code only. Re-run. Max 3 attempts, then stop and report.

**NEVER (applies to Fix Loop — existing tests that regressed; does NOT apply to TDD GREEN in Phase 2):**
- Fix existing production code without asking
- Delete or weaken existing tests
- Add `skip`/`xit`/`@disabled` to hide failures
- Use mocks solely to avoid a real failure

---

## Hand-off (after the build loop above)

**Before handing off, verify** (inline run only — a dispatched Auto-Mode subagent stops after its one story and reports back; the controller runs the full suite + gates):
- [ ] All public functions have unit tests
- [ ] All API endpoints have integration tests
- [ ] Edge cases covered (null, empty, invalid, boundary)
- [ ] Error paths tested (not just happy path)
- [ ] Tests are independent (no shared state)
- [ ] Assertions are specific and meaningful

**Inline builder: now read `gates.md`** and run Phase 3 → 3.5 → 4.5 → 5 over the whole spec.
**Dispatched subagent: STOP here** and return your report contract to the controller — do NOT read `gates.md`.
