# gates.md — verification, coverage gates, and summary (Phase 3 / 3.5 / 4.5 / 5)

> Phase numbering is a stable identity carried over from the single-file version, not a reading order. **Phase 4 (Fix Loop) is not here** — it belongs to the build loop in `core-loop.md`; its red-suite guardrails are restated in Phase 3 below. That is why this file jumps 3.5 → 4.5.

**Who reads this:** the **inline builder** (after Phase 2, over the whole spec), OR the **controller** (runs the identity gate at A7, the per-story falsifiability slice at A4). A **dispatched subagent NEVER reads this** — it runs only its filtered story tests and reports back; the controller owns full-suite + all gates + summary.

**Read only the gate sub-sections your spec triggers** (SKILL.md READ MAP):
- Base Spec Coverage Gate + Constraint-Clause Falsifiability → whenever a formal spec with AS/C exists.
- Behavior Matrix gate → only if the spec has `## Behavior Matrix`.
- Core Function Model gate → only if the spec has `## Core Function Model`.
- Sibling Surface Map gate → only if the spec has `## Sibling Surface Map`.
- Invariant Registry gate → only if the project has `docs/invariants/INV-*.md`.

If a section's trigger is absent, skip it entirely.

---

## Phase 3: Build and Run

This runs the full test suite after all stories are complete. Individual story tests were already verified in Phase 2.

Compile/typecheck first (tsc --noEmit, cargo check, go vet, swift build, etc.).

Then run all tests:
```
TEST_CMD
```
(Resolve `TEST_CMD` per `core-loop.md` § Test Command.)

**If the full suite is red** (applies to inline builder AND controller at A7): find the cause, then respect the Fix-Loop guardrails — this is EXISTING code that regressed, NOT new TDD GREEN. **NEVER:** fix existing production code without an `AskUserQuestion` first; delete or weaken existing tests; add `skip`/`xit`/`@disabled` to hide a failure; use a mock solely to dodge a real failure. Max 3 fix attempts, then stop and report. **Controller:** do not fix production code yourself — re-dispatch the owning implementer once with the specific failure (A4's one-retry-then-BLOCKED rule), which runs the full Phase 4 loop from `core-loop.md`.

### Linked-Field Seam Gate (cross-spec)

*Applies only if either the current spec or a sibling spec has a `## Linked Fields` block — else skip.* Each linked field's seam is a **real-integration test against the ACTUAL producer, never a mocked consumer** — a mocked seam hides exactly the mismatch it exists to catch (field on the wrong surface: list vs single-get; or wrong lifecycle: transient-in-response vs persisted+served). A single-side subagent cannot see the seam, so the **controller** runs the cross-spec seam tests on the integrated tree after both sibling specs are built (A4b/A7). Do NOT mark a consumer story `done` on a mocked seam.

---

## Phase 3.5: Spec Coverage Gate (deterministic — the actual guarantee)

Everything else (checklist ticks, per-story counts, reviewer grep) is LLM judgement and can drift. This gate is the one place coverage is **counted by a command, not hoped for** — it makes "every spec case has ≥1 test" an invariant: the build does not pass while any AS/C is uncovered.

It works because **tests embed their `AS-NNN`/`C-NNN` in the test name** (Phase 1 quality check). The gate is a set-difference: spec IDs minus IDs found in the test files.

```bash
SPEC=docs/specs/<feature>/<feature>.md
TESTDIR=<test dir>            # e.g. tests/ or src/ (resolve like TEST_CMD)

# Obligations from the spec: every AS-NNN and C-NNN under ## Stories / Constraints.
# -owE is portable and exact (NOT \b — \b is a GNU-ism; on BSD/macOS it yields phantom
# short IDs like "AS-01" out of "AS-010").
# Strip the **Execution:** metadata lines FIRST — their `verify:` hints (e.g. -t "AS-0")
# hold AS-id-shaped substrings that are NOT acceptance scenarios; counting them prints a
# phantom uncovered id and false-BLOCKs a complete build.
grep -vE '\*\*Execution:\*\*' "$SPEC" | grep -owE '(AS|C)-[0-9]+' | sort -u > /tmp/spec-ids.txt
# Covered: IDs that actually appear in a test file (tests embed the ID in their name)
# -h is REQUIRED with -r: without it grep prefixes each match with "file:" and the
# set-difference never matches (gate would falsely report everything uncovered).
grep -rowhE '(AS|C)-[0-9]+' "$TESTDIR" | sort -u > /tmp/covered-ids.txt
# Uncovered = in spec, not in any test
comm -23 /tmp/spec-ids.txt /tmp/covered-ids.txt
```

- **Any line printed → BLOCKED.** Those AS/C have no test carrying their ID. List them; do not mark the build DONE. (Single-story / no-formal-spec builds: skip — log `COVERAGE_GATE: no spec`.)
- **Open gaps:** `grep -E 'GAP-[0-9]+' "$SPEC"` whose status is not `resolved` → list them in the summary as "unresolved gaps (not blocking, but visible)". A gap is never silently dropped: it is either resolved into an AS (via `/sp-plan`, then it gets counted) or shown as open.

**What this gate does and does NOT prove.** It proves identity presence (necessary): no AS is missing a test. It does NOT alone prove the test is meaningful — that's the per-AS rules: one test node per primary AS, with a real assertion (Phase 1), and the strong form, **falsifiability** — negating an AS's Then should turn its test red. Identity gate = cheap and deterministic (run it every build); full mutation testing across *every* AS = the north-star, still optional/advanced. But falsifiability is **NOT optional for the high-risk band** — see the next gate.

### Constraint-Clause Falsifiability Gate (required — not the optional north-star)

*Applies only if the story/spec has `C-NNN` constraints or reject/deny rules — else skip.*

Identity presence is exactly what shipped the partial C-010 (hash-verify clause named in a test, never asserted), the deterministic C-002 key (no test asserted randomness), and the lazy C-013 boot-validation (no test failed without it). Those tests carry the ID and pass the identity gate while asserting nothing that the missing clause would break. So for the high-risk band — **every `C-NNN`/`C-NNN.<clause>` line and every reject/deny rule** (NOT every AS; that is the cost bound) — the review/verify step MUST, per line, state:

1. **The exact assertion** that covers it: `file:test-name` + the concrete thing it asserts (a value, a state, an effect — not "checks the behaviour").
2. **The mutation that turns it red:** the specific production change that would make that assertion fail — `"delete the read-back-and-compare branch in put() → S-005:C-010.verify-hash test fails"`. If you cannot name a code change that breaks the test, **the test is vacuous → treat the line as `[ ]`, not `[x]`** (this is the falsifiability check; "no change would break it" is a fail even when a `C-NNN` test exists).

**Strong form — actually run the mutation (REQUIRED for security / data-integrity / release-critical constraints; recommended otherwise).** Don't just claim the mutation; perform it: comment out the guard/branch the clause depends on, run that ONE filtered test, confirm it goes RED, then revert. This is bounded mutation testing scoped to the constraint band (one mutate-run-revert per clause — cheap, deterministic), not a full-suite mutation run. A clause whose test stays GREEN under its own mutation is not covered — reopen it. C-018's over-rejection would have surfaced here too: mutating "reject any `<!DOCTYPE>`" to "accept" leaves the (missing) benign-SVG accept test unable to go red, exposing that only the reject side was tested (see the Boundary-Pair rule).

**Auto-mode:** the controller runs the identity gate at A7 (finish) over the whole spec, and may run the per-story slice after each story's gates (A4). The A4 Gate-1 reviewer subagent runs the Constraint-Clause Falsifiability Gate for the story's `C-*` lines and reject rules and returns the assertion+mutation pair per line (it reads the diff; the controller does not). Dispatched subagents are told (A2 contract) to embed `AS-NNN` in every test name so the identity gate can see their work.

### Behavior Matrix Coverage Gate

*Applies only if the spec contains `## Behavior Matrix` — else skip.*

The AS/C gate proves every acceptance scenario has at least one test. It does not prove every state/viewer/surface cell was tested, because several cells can share one AS id. The Behavior Matrix gate is the stricter cell-level check.

Required evidence for each matrix cell:
- For `Coverage = AS-NNN`: a `.build-checklist` line named `BM.<AS-NNN>.<surface>` is `[x]`.
- That line includes a concrete test reference (`file:test-name`) and the test name contains the cell's `AS-NNN`.
- The referenced test exercises the named surface/source/timing boundary, not a mock of that boundary.
- If the cell is a terminal lifecycle/cascade cell, the referenced evidence includes a named cascade test per the Terminal Lifecycle Cascade Test Rule.
- For `Coverage = GAP-NNN`: a normal `GAP-NNN — BM cell unresolved: ...` checklist line exists. It stays visible in the open-gaps summary and is not a test obligation until `/sp-plan` resolves it into an AS.
- For `Coverage = N/A`: an `[N/A] BM.NA.<surface>` checklist line exists with a concrete reason.

Minimal shell check (identity only; still review the checklist line for surface/boundary evidence):

```bash
CHECKLIST=docs/specs/<feature>/.build-checklist

# Any BM.AS line not ticked is an uncovered matrix test obligation.
grep '^\[ \] BM\.AS\|^\[~\] BM\.AS' "$CHECKLIST" || true

# Any ticked BM.AS line without a test reference is suspicious and must be reviewed.
grep '^\[x\] BM\.AS' "$CHECKLIST" | grep -vE '[[:alnum:]_./-]+:[[:alnum:]_ -]+' || true
```

- **Any `[ ] BM.AS...` line → BLOCKED.** The QA cell has no test.
- **Any `[~] BM.AS...` line → DONE_WITH_CONCERNS**, unless the destination is a concrete future story/Known-Gap and the feature is not release-critical.
- **Any `[x] BM.AS...` line with only mocked-boundary evidence → treat as `[~]`**, not done.
- **Any terminal lifecycle BM line without a named cascade test → treat as `[~]` or BLOCKED**, depending on release criticality.
- **Any `GAP-NNN — BM cell unresolved` line → visible open gap, not a build test failure.** Do not implement or test that cell until `/sp-plan` resolves it.

### Core Function Model Gate

*Applies only if the spec contains `## Core Function Model` — else skip.*

- Confirmed entry points, seams, provider/external contracts, invariants, and optional/absent inputs must be represented by AS/GAP/BM/Constraint lines.
- Optional/absent inputs named by the model need a regression AS or GAP.
- External/provider semantics that affect behavior need AS if stated or GAP if unknown.
- Any verified code seam claimed in the model must have test evidence at the correct boundary.
- **No-vacuous-boundary rule:** do not mock the seam the test claims to verify. Mock outside dependencies only.
- A model entry with no AS/GAP/BM/Constraint coverage means `/sp-plan` did not finish. Emit a Spec Signal and mark DONE_WITH_CONCERNS or BLOCKED depending on release criticality.

### Sibling Surface Map Gate

*Applies only if the spec contains `## Sibling Surface Map` — else skip.*

- Confirmed sibling surfaces must be covered indirectly by AS/GAP/BM lines. If a confirmed surface has no AS/GAP/BM coverage, emit a Spec Signal and mark DONE_WITH_CONCERNS or BLOCKED depending on release criticality.
- Candidate rows are not build gates. Do not implement a candidate solely because it was discovered.
- A high/medium candidate without `cover`, `GAP-NNN`, or `ignore(reason)` means `/sp-plan` did not finish disposition. Emit a Spec Signal; do not silently choose behavior in code.

### Invariant Registry Gate

*Applies only if the project has `docs/invariants/INV-*.md` — else skip.*

Use the invariant registry README/schema as base knowledge; README examples are not runtime entries.

- `status: enforced` with `test_ref` → the referenced test, or an equivalent regression named in the build summary, must be present and run. Missing evidence → BLOCKED.
- `status: confirmed` → not a hard build gate by itself; verify the spec has AS/GAP/BM coverage when this build touches the component.
- `status: candidate` → advisory only; do not invent requirements. If the build confirms it, emit a Spec Signal to promote it via `/sp-plan` or `/sp-fix`.
- `status: retired` → ignore unless this build revives the component.

This gate prevents "memory exists but is never enforced" while avoiding false requirements from noisy candidate entries.

---

## Phase 4.5: Pre-Summary Review

Walk `.build-checklist` before writing the summary. This is in-place verification — it prevents the user from having to re-run the skill just to audit.

**For each line not marked `[x]`:**

1. **`[~]` partial:** verify the destination still exists.
   - Story ID → `grep "<story-id>"` in the plan/spec → must match
   - Known-Gap row → grep in `<feature>.md` → must match
   - No match → FAIL: destination has vanished (moved/deleted), must re-bind before closing the build.

2. **`[ ]` untouched but this build was supposed to cover it** (lines with `owner: S-NNN` belonging to closed stories):
   - This is NOT vague "self-investigation". Concrete evidence is required:
     - Grep the owner story's test file → any assertion matching the Then clause?
     - Grep the owner story's production diff → any code emitting this output?
   - Both absent → the owner story shipped incomplete. **Reopen the story** (revert to `pending` in `.build-progress`), add test+code, OR convert to `[~]` with a concrete destination.
   - A dev may NOT convert `[ ]` → `[~] scope drift` without commit SHA / diff evidence showing the requirement changed mid-build. "scope drift" without evidence = miss.

3. **`[N/A]`** needs no action (declared out-of-scope upfront).

**The output of this phase flows straight into Phase 5 Summary** (see format below).

---

## Phase 5: Summary

**STATUS** — one of:
- `DONE` — all stories green, checklist 100% `[x]`/`[N/A]`, no open signal.
- `DONE_WITH_CONCERNS` — green but has `[~]` carve-outs, a coverage/edge gap, an S3, a P2 risk, or a critical `[→E2E]` left unwritten.
- `BLOCKED` — can't proceed (say what blocked + what was tried).
- `NEEDS_CONTEXT` — missing info (say what + why).

Report style: terse, one fact per line, dev-log not prose. **Omit any line that is empty / N/A** — a simple build's report is a few lines, not twenty. Result tokens: `PASS` · `BLOCKED: <ids>` · `CONCERNS: <ids>` · `S1|S2|S3: <ids>` · `skip`. Gates that didn't trigger: leave out entirely.

```
status      DONE_WITH_CONCERNS
tests       5 added / 0 changed — all green
stories     S-001 ✓  S-002 ✓  S-003 ✗ blocked-oversize
files       src: percent.js   tests: percent.test.js
tdd         S-001 RED(no split()) → GREEN  [AS-001 AS-002 AS-003]
coverage    PASS                              # else  BLOCKED: AS-007 C-012
constraints PASS                              # else  BLOCKED: C-010.sum-exact  /  S1: C-001.no-float
gates       BM skip · CFM skip · sibling skip · invariant skip · seam skip
checklist   5/6 [x] · 1 [N/A] · 0 [~] · 0 open
edge        8/8 considered                    # else list only the non-✓/non-N/A rows
signals     🚩 S1: C-010 bundles 2 clauses, no per-clause AS
open        —                                 # else  gaps/E2E-deferred/eval/manual, one token each
```

**Progress file cleanup:**
- All stories done AND checklist is 100% `[x]`/`[N/A]` → delete `docs/specs/<feature>/.build-progress` and `.build-checklist`
- Stories remaining OR any `[~]` carve-outs → leave both files. Log: "Progress + checklist saved — resume with `/sp-build`"

### Spec Update Signal

**Relationship with Phase 0.6 Checklist:**
- Checklist is an **evidence artifact** (what got done / deferred).
- S1/S2/S3 are **action signals** (user must run `/sp-plan`).
- Both fire when their conditions are met — they do not suppress each other.

Mapping:
- Checklist `[~]` with destination = new Known-Gap row → also fires **S3** (new constraint not yet documented)
- Checklist `[ ]` on a closed owner story, plus any `[STALE]` lines = code drift from spec → fires **S2**
- A new test with no matching AS in the checklist (caught by reverse-map in Phase 2 Step 4) → fires **S1**

The summary must show both the checklist stats AND the signal block — do not merge them.

After every build, check against these conditions. If ANY is true → **must** signal.

**Signal when (MUST):**

| # | Condition |
|---|-----------|
| S1 | A new test covers behavior, edge case, or error path with no corresponding AS in the spec |
| S2 | Code behavior no longer matches the Given/When/Then of an existing AS (spec is stale) |
| S3 | Implementation adds a new constraint or guard not documented in any AS or Constraints section |

**Do not signal when:**
- Pure refactor — behavior unchanged, all existing AS still map correctly
- Performance fix — same output, just faster
- Fix to match spec — code was wrong, spec was right, no new behavior added

**Signal format:**
```
🚩 SPEC-SIGNAL: run `/sp-plan docs/specs/<feature>/<feature>.md '<describe change>'`
Reason: [S1 | S2 | S3] — <one line: what is missing or mismatched>
```

If S1 applies to a failing test: state **"This failure suggests a missing acceptance scenario."** Describe the gap and prompt to run `/sp-plan` before re-running `/sp-build`. Do not silently add the test without the AS.
