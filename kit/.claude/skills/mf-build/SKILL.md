---
description: |
  TDD delivery loop — write failing tests from spec, implement story by story,
  drive to GREEN. One story → red → green → next story. For a multi-story spec,
  auto-mode orchestrates the whole spec to done by dispatching one subagent per
  story (keeps context lean, minimal human-in-loop), stopping only on blockers,
  spec drift, or checkpoint stories.
  Use when asked to "build this", "implement the spec", "code the feature",
  "triển khai", "làm tính năng", "code theo spec", "TDD this", "build hết spec",
  "build all stories", "implement the whole spec", or "build tự động".
  Proactively invoke this skill (do NOT write code directly) when the user has
  a spec ready in docs/specs/ and wants it implemented, or asks to start coding
  a planned feature.
  Requires a spec from /mf-plan or equivalent — if no spec exists, run /mf-plan
  first instead of jumping into code.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion, Agent, mcp__graphatlas__*
---
TDD delivery loop — write failing tests from spec AS, implement story by story, drive to GREEN.

This skill has two execution paths, both built on the same **Execution Procedure (Phase 0a–Phase 5)** below. **Inline** runs that procedure directly in the current context (classic behaviour — fine for one story or a small spec, but context grows with every story). **Auto-Mode** turns the current context into an orchestrator that drives a multi-story spec to completion by dispatching a fresh subagent per story — each subagent runs the same procedure scoped to its one story, so the controller's context stays lean. Run Mode Detection first.

---

## Mode Detection (run first)

1. Resolve the target spec at `docs/specs/<feature>/<feature>.md` (from `$ARGUMENTS` or the changed feature). Count the **in-scope** stories: those in `## Stories`, minus any already `done` in `.build-progress`, intersected with any `$ARGUMENTS` story filter. (So a resume with one story left counts as 1.)
2. Decide:
   - **No spec / no `## Stories` section** (e.g. ad-hoc build, bug-fix-style work, `$ARGUMENTS` is a bare file) → **Inline.** Run the Execution Procedure directly. No mode question.
   - **1 story in scope** (single-story spec, or `$ARGUMENTS` scopes to one `S-NNN`) → **Inline.** Run the procedure for that one story. No subagents (inline threshold = 1).
   - **≥2 stories in scope** → ask the user **once** via AskUserQuestion:

```json
{
  "questions": [{
    "question": "This spec has <N> stories. Run auto-mode (I orchestrate: one subagent per story, gate each, stop only on blockers / spec-drift / checkpoint stories), or inline (build all <N> in this context, classic, you watch each step)?",
    "header": "Build mode",
    "multiSelect": false,
    "options": [
      {"label": "Auto — build all <N> to done", "description": "Orchestrate with subagents; lean context; stop only on BLOCKED, spec signal S1/S2, or a checkpoint story"},
      {"label": "Inline — build all in this context", "description": "Classic single-context loop over every story; full visibility, but context grows per story"}
    ]
  }]
}
```

   - **Auto** → go to **Auto-Mode (Orchestrator)** below.
   - **Inline** → run the Execution Procedure, looping over the in-scope stories (resume from first `pending` in `.build-progress`).

---

## Auto-Mode (Orchestrator)

The current context is the **controller**. It does not implement — it orders, dispatches, gates, and routes. Keep controller context lean: read status and checklist ticks, never full diffs or full subagent bodies.

### A1 — Plan the run (read spec ONCE)

1. Read the spec once. Extract for every story: ID, priority, full text + its AS, and the `**Execution:**` block (`depends_on`, `parallel_safe`, `files`, `autonomous`, `verify`). Missing block → treat as `depends_on: none, parallel_safe: false, autonomous: true, files: unknown`.
2. Read `.build-progress` if present. In Auto-Mode it uses **three** states: `done`, `building`, `pending`. The controller flips a story to `building` right before dispatch (A2) and to `done` only after its gates clear (A4/A4b) — so a story interrupted mid-build is left as `building`, never silently `done`. **On resume:**
   - `building` story → it was in flight when interrupted. Check `git log --all --grep "S-NNN"` — this scans the FULL message including the `Story:` footer (A2 mandates it there). Do NOT use `git log --oneline | grep` — that only sees the subject and will miss the footer, giving a false "no commit" that overwrites finished work. Commit exists → the subagent finished but wasn't gated → gate it (A4) instead of rebuilding. No commit → re-dispatch it.
   - `pending` → untouched, build normally. `done` → skip.
   - **Stale worktrees from an interrupted prior run:** run `git worktree list`. For any leftover agent worktree (path under `.claude/worktrees/` or branch `worktree-agent-*`): if its story is `done` and its branch is merged → clean it up (`git worktree remove` + `git branch -d` + `git worktree prune`). If it is **locked** or its work is unmerged → do NOT force-remove; report it ("leftover worktree <path> from an interrupted run — remove with `git worktree remove -f -f` only if you're sure its agent is dead") and leave it. Never blindly `-f -f` on resume.
3. **Derive the full checklist yourself now.** Dispatched subagents are barred from Phase 0.6, so the controller owns derivation: run Phase 0.6 over the whole spec, give each line an `owner: S-NNN`, and write `.build-checklist`. (On resume, re-derive and diff per Phase 0.6's "checklist already exists" rules.) This must exist before the first dispatch, because A2 pastes each story's `owner` lines into its subagent prompt.
4. **Validate the dependency graph FIRST.** Every `depends_on` ID must resolve to a story in this spec, and the graph must be a DAG. If any `depends_on` points to a missing/removed ID, or there is a cycle (or at any later point pending stories remain but none is ready) → STOP with `BLOCKED: dependency cycle or dangling ref between <stories>` and tell the user to fix it via `/mf-plan`. Do not loop.
5. **Compute waves** from priority + `depends_on`:
   - A story is ready when all its `depends_on` are `done`.
   - Within a ready set, order by priority (P0 → P1 → P2). **Process the ready set in priority order: run sequential-eligible stories first (one at a time), then dispatch the parallel group.** Never run an inline sequential build at the same time as a worktree wave — finish the sequential story, then start the group.
   - A set of ready stories runs **in parallel only if** every one is `parallel_safe: true` AND none is `autonomous: checkpoint` (checkpoint stories always run sequentially so the A5 pause fires) AND their `files` are concrete (not `unknown`, not a bare directory hint) AND pairwise disjoint. Any overlap, any `unknown`, any directory-level hint, any dependency, any doubt → that story drops to sequential. A wave can mix: dispatch the parallel-eligible group (in batches, see the concurrency cap below), build the rest one at a time.
   - **Two implementer subagents must never share one working tree** — git index, `HEAD`, and the build dir are shared even when file *contents* are disjoint. Parallel dispatch therefore uses worktree isolation; see A2 (dispatch) + A4b (integration) for the exact procedure. If `isolation="worktree"` is unavailable in this environment, fall back to sequential for that wave.
   - **Concurrency cap — never more than 3 implementer subagents at once.** If a parallel-eligible group has >3 stories, dispatch in batches of ≤3: a batch's branches integrate (A4b) before the next batch starts. More than ~3 burns context/tokens in parallel and risks rate limits, while the *sequential* A4b integrate is the real bottleneck — extra concurrency buys little. The cap drops with the context tier (A6): **3** at PEAK, **2** at GOOD, **1 (sequential)** at DEGRADING or worse. It is a ceiling, not a target — 2 disjoint stories run as 2, never padded to 3.

### A2 — Per-story dispatch (approach b — point, don't paste the procedure)

Before dispatching, check the story's `autonomous` field: if it is `checkpoint`, pause and let the human inspect before proceeding (A5) — do not dispatch it silently. Then mark the story (or each member of a parallel group) `building` in `.build-progress` so an interruption is recoverable (A1).

**Dispatch shape:**
- **Sequential story** → dispatch one **general-purpose subagent** via the Agent tool, working in the current tree.
- **Parallel-eligible group** (from A1.5) → first capture the wave base: `EXPECTED_BASE=$(git rev-parse HEAD)`. Then dispatch each member subagent with `isolation="worktree"` so each gets its own worktree + branch off HEAD — **at most the A1.5 concurrency cap (≤3) at a time**; if the group is larger, do it in batches, integrating each batch (A4b) before dispatching the next. They run concurrently within a batch; the controller integrates their branches afterward (A4b).

The prompt MUST contain:

1. **Point** the subagent to the procedure: *"Read `.claude/skills/mf-build/SKILL.md` and follow the **Execution Procedure (Phase 0a–Phase 5)** for EXACTLY the one story below. Do NOT invoke the mf-build skill (no recursion), do NOT re-enter Mode Detection, do NOT read or build any other story."*
2. **The dispatched-subagent contract** (paste verbatim — this is what keeps the controller the single owner of cross-story state):
   - Build only your assigned story; the Phase 2 loop runs exactly once.
   - Name every test with the `AS-NNN` it covers (`AS-NNN: <scenario>`), one test node per primary AS — the controller's Spec Coverage Gate (Phase 3.5) counts coverage by that ID, so an untagged test is invisible to it.
   - Do NOT write `.build-progress` or `.build-checklist` — the controller owns them. Report your checklist ticks in the contract instead.
   - Do NOT run Phase 3 (full-suite), Phase 4.5 (cross-story checklist review), or Phase 5 (summary/cleanup) — those are the controller's job. Run only your story's filtered tests.
   - Do NOT surface a spec signal to the user or edit the spec — return it in the `Spec signal` field.
   - Commit your own work as ONE commit, conventional format, with a `Story: S-NNN` footer line (mf-commit's story-link convention):
     ```
     feat(scope): <short desc>

     Story: S-NNN
     ```
     The footer is how the controller finds your work on resume (`git log --grep`) — mandatory, not cosmetic.
   - **If you are running in a git worktree** (parallel dispatch): before any edit, assert `git symbolic-ref HEAD` is your own per-agent branch, NOT a protected ref (`main`/`master`/`develop`/`release/*`) — if it is protected, STOP and report BLOCKED, never `git update-ref` your way onto it. Then confirm your branch was cut from `EXPECTED_BASE` (passed in your prompt); if `git merge-base HEAD <EXPECTED_BASE>` differs from `EXPECTED_BASE`, `git reset --hard <EXPECTED_BASE>` before starting. Stay inside your worktree; touch only your `files`.
3. **Paste** the story's full text + its AS + the `files` hints + relevant Constraints + **the `.build-checklist` lines whose `owner` is this story** (so the subagent reports ticks against the controller's real line IDs, not IDs it invented) + **`EXPECTED_BASE` if this is a worktree (parallel) dispatch**. The subagent should not have to re-derive scope.
4. Demand the **report contract** in A3.

Do not paste the whole procedure into the prompt — the subagent reads it from disk.

### A3 — Report contract (what the subagent returns)

```
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Story: S-NNN
Files changed: [...]
Tests added: [exact test names]
Checklist: [lines ticked]
Edge compliance: [the 8-row table for this story — each ✓ or N/A+reason] (depth forcing-function; the controller aggregates these into Phase 5)
Spec signal: none | S1 <gap> | S2 <conflict> | S3 <added guard>
```

Controller reads this report only — not the diff. (Spec signal definitions = Phase 5 "Spec Update Signal".)

### A4 — Two gates per story (both must pass to continue)

**Gate 1 — Verification.** The controller runs the cheap checks directly: the story's filtered tests + its `verify` command if present (these emit pass/fail, not a diff to read). For the review, **dispatch a reviewer subagent** (mf-review-style, spec-compliance scoped to the story's commit) that reads the diff and returns a one-line verdict — so the controller never loads the diff itself. Any check fails → re-dispatch the implementer subagent **once** with the specific failure. (The subagent already spends its own internal 3-attempt budget per Phase 4 — the controller does not add 3 more on top; that would blow past the project's "max 3 fix loops" rule. One corrective re-dispatch, then stop.) Still failing → BLOCKED.

**Gate 2 — Spec signal** (runs in parallel with Gate 1, enforces the project rule "only /mf-plan touches specs"):
- `S1` (behaviour/edge case with no AS) or `S2` (code must contradict an AS) → **STOP the run.** Surface the signal and the exact command: `⚠️ Spec drift — run /mf-plan docs/specs/<feature>/<feature>.md '<change>'` then resume `/mf-build`. Do not auto-edit the spec, do not skip the story. **STOP = stop dispatching NEW stories; let any in-flight sibling subagents finish their current story (do not kill them mid-write).** Keep already-committed/merged work — S1/S2 mean the spec is stale, not that the code is wrong; leave those stories `done`, leave their commits, and just don't advance. Resume after `/mf-plan`.
- `S3` (added guard/constraint not in spec) → record it for the final report, continue.

Only when both gates clear: tick `.build-checklist`, mark the story `done` in `.build-progress`, move on.

For a **sequential** story the subagent committed in the current tree, so gate it directly here. For a **parallel wave**, integrate first (A4b), then gate each story on the integrated tree.

### A4b — Integrate a parallel wave (parallel dispatch only)

After every member of a parallel group returns `DONE` (handle any non-DONE per A5 first), merge their worktree branches into the working branch — the controller does this, sequentially, deterministic order (ascending `S-NNN`):

1. For each branch: `git merge --no-ff <branch>`. Files were declared pairwise-disjoint, so a clean merge is expected.
2. **On conflict** → the story's `files`/`parallel_safe` was wrong (it overlapped a sibling — often a shared router/index/schema). Do NOT resolve by force: `git merge --abort`, then **rebuild that story sequentially** on top of the already-integrated base (re-dispatch it as a sequential story in the current tree). Record a warning and a spec-fix hint: `⚠️ parallel_safe wrong for <S-NNN> — run /mf-plan to set parallel_safe: false / fix files`. This is the self-correcting safety net for an over-optimistic `parallel_safe`.
3. After all branches are integrated, run the A4 gates for each story **on the integrated tree** (not on the isolated branch) so cross-story breakage surfaces. If a gate fails here, re-dispatch that implementer **sequentially in the integrated tree** (its worktree may already be gone) under the same one-retry-then-BLOCKED rule. Then mark each `done`.
4. Tear down each worktree **explicitly** — a worktree the subagent committed to is *changed*, and `isolation="worktree"` only auto-cleans *unchanged* ones, so cleanup is yours. Per member, after its branch is merged: `git worktree remove <path>` → `git branch -d <branch>` (plain `-d`, which only succeeds once merged — a failure means it wasn't integrated, so stop and investigate, do NOT `-D`) → finally `git worktree prune`. **Do not `git worktree remove -f -f` a *locked* worktree** — a lock (`claude agent … pid`) means the agent is still live or the run was interrupted; force-removing it can destroy in-flight work. If a worktree is still locked when you reach teardown, the subagent has not actually returned — wait for it (or treat as BLOCKED), don't force.

### A5 — Stop conditions (otherwise: do NOT pause)

Run continuously. Do **not** ask "continue?" or print progress summaries between stories. Stop only when:
- a story is `autonomous: checkpoint` → pause via `AskUserQuestion` **twice**: (1) BEFORE dispatch — "S-NNN is a checkpoint (sensitive: <why>). Build it now / skip for now / stop?" and do not dispatch until the user approves; (2) AFTER its gates pass, before marking `done` — show what changed and ask "looks right / needs changes?". A bare text note is not a pause — you must actually stop and wait for the answer,
- a subagent returns `NEEDS_CONTEXT` → surface its question to the human and answer it, then re-dispatch the SAME story. Do NOT mark it `done` and do NOT skip it,
- `BLOCKED` you cannot resolve (subagent's 3 internal attempts + your 1 re-dispatch exhausted),
- a dependency cycle / dangling ref / no-ready-but-pending state (per A1) → `BLOCKED`,
- spec signal `S1`/`S2`,
- all stories `done`.

### A6 — Context budget (controller self-monitoring)

- Read frontmatter/status/checklist, never full SUMMARY/diff bodies, unless on a ≥500k-token model and a decision needs it.
- Track usage tiers: <50% normal; 50–70% economize, frontmatter-only, warn the user "context getting heavy — consider checkpointing"; 70%+ checkpoint progress to `.build-progress` immediately and stop.
- Watch for degraded subagent output (vagueness like "appropriate handling", reported items fewer than the story's AS) → re-verify against the checklist, don't trust the report.

### A7 — Finish

When all stories `done`: run the full suite once, **then run the Spec Coverage Gate (Phase 3.5) over the whole spec** — any uncovered AS/C → not DONE, reopen the owning story. Then the Phase 5 summary (aggregate: stories built, coverage-gate result, open gaps, S3 signals, deferred items). Delete `.build-progress`/`.build-checklist` only if the gate passed AND checklist is 100% `[x]`/`[N/A]`.

---

## Execution Procedure (Phase 0a–Phase 5)

This procedure builds the story (or stories) in scope.

- **Inline run** (main context): loops over every in-scope story; owns `.build-progress`/`.build-checklist`; runs Phase 3 (full suite) and Phase 5 (summary/cleanup) normally.
- **Dispatched Auto-Mode subagent**: builds EXACTLY its one assigned story under the dispatched-subagent contract (see A2) — Phase 2 loop runs once; does NOT derive or write `.build-progress`/`.build-checklist` (the controller owns them and pastes this story's checklist lines into the prompt); skips Phase 3 and Phase 5; returns spec signals in its report instead of surfacing them. Wherever a step below says "derive/store `.build-checklist` (Phase 0.6)", "move to the next story", "mark done in `.build-progress`", "tick `.build-checklist`", "run full suite", or "Phase 5 cleanup" — a dispatched subagent skips it and instead works against the pasted checklist lines, reporting its ticks back to the controller.

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

2. **Read the spec** at `docs/specs/<feature>/<feature>.md` — the `## Stories` section with acceptance scenarios is your roadmap. The `## Overview` and `## Constraints` sections tell you the INTENT behind the code.

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

4. **Locate related code.** **If GA available (per Phase 0a):** `ga_symbols` on the main function/type names from the spec → definitions; `ga_callers`/`ga_callees` → dependency chain; `ga_impact(symbol=...)` → blast radius + affected tests; `ga_architecture` → confirm module/layer (auth, payment, core); `ga_file_summary` before reading a file in full. **If GA unavailable:** grep for the main function/type names in the changed files.

5. **Read existing tests** for the changed files — find patterns, fixtures, naming conventions. Don't duplicate.

---

## Phase 0.5: Implementation Risk Check

Run after Phase 0. Takes 2 minutes. Checks only what is visible at implementation time
(mf-challenge already reviewed the spec adversarially — this catches code-level issues only).

- **N+1:** For each story involving a list/loop — will implementation query DB inside the loop? Flag before writing the test.
- **DRY:** Grep for similar logic in existing code. If found, reuse — don't duplicate.
- **Error paths:** For each story — what can go wrong? (null, empty, network fail, invalid input) Note these upfront so they land in the Coverage Map, not as afterthoughts.
- **Pattern:** What's the existing pattern for this type of operation in the codebase? Follow it unless there's a reason not to.
- **UI Notes + UI Inventory (FE stories only):** Read TWO sections before writing the failing test:
  1. `## What Already Exists § UI Inventory` — list of existing components with paths the spec marked reusable for this feature. **Skim this FIRST** to find reuse candidates before assuming a Component Tree entry needs new scaffolding. Each row in UI Inventory carries a `file:path` you can open to check the actual API.
  2. `## UI Notes` Component Tree — components this story must produce. Use it to shape layout / section order / hierarchy.
  **Precedence: AS / Constraints > Prototype URL > UI Notes.** If you detect a contradiction (e.g. AS says "notify user" but the Component Tree has no notification surface, OR Component Tree shows a button the AS never references), STOP and raise a Spec Signal — do NOT build to the UI Notes and ignore the AS. UI Notes is structural reference; the AS is the contract.

Output: 2-3 line summary. Feeds into Phase 1.5 Coverage Map.

---

## Phase 0.6: Spec Checklist

Derive a checklist from the spec — each "promise" in this build's scope becomes one line. The checklist mirrors the spec; it does not invent new requirements.

**Sources (all in `docs/specs/<feature>/<feature>.md`) — anchor on IDENTITY, not nouns:**
- **Each `AS-NNN` → at least one line carrying that ID** (`AS-NNN`, or `AS-NNN.Tk` when one AS needs several assertions). This is the primary anchor: the checklist is keyed on the spec's case IDs, not on text it happens to mention. A Then with several fields/effects becomes several `AS-NNN.Tk` lines — but they all carry the same AS-NNN, so the AS is never lost.
- Each Constraint → one `C-NNN` line.
- Each open `GAP-NNN` (status not `resolved`) → one `[ ]` line tagged `GAP` (so a parked gap is visible, not silently dropped — see Spec Coverage Gate).
- Each Not-in-Scope row → one `[N/A]` line (prevents accidental ticking).

**Completeness invariant (checked, not hoped):** every `AS-NNN` and `C-NNN` in the spec's `## Stories`/Constraints MUST appear on ≥1 checklist line. An AS with no line = the checklist is wrong (re-derive), not the spec. Deriving from Then-nouns alone silently drops AS whose Then is verb-shaped ("retries", "must not send") or whose nouns collide with another AS — anchoring on the ID closes that.

**Granularity rule (so two devs produce the same checklist):**
- 1 line per **observable output field** (appears in Then result, independently assertable)
- 1 line per **side effect** (write to DB, emit event, external call)
- 1 line per **error path** declared in a Then clause
- Do NOT split adjectives (sorted/deduped/trimmed) into separate lines — roll them into the field line

Example: Then "returns sorted list of {file, confidence, edges}" → 3 lines (one per field), not 4.

**Stored at:** `docs/specs/<feature>/.build-checklist` (alongside `.build-progress`)

**Format** (owner column resolves multi-story AS):
```
[ ] AS-012.T1 — affected_tests includes convention-matched files     | owner: S-003
[ ] AS-012.T2 — affected_tests includes TESTED_BY edges              | owner: S-003
[ ] AS-012.T3 — output sorted by confidence                          | owner: S-004
[ ] C-003     — query completes under 50ms                           | owner: S-005
[N/A] AS-015  — out of scope (M3)                                    | owner: —
```

Owner = the story in this build planned to cover that line. If an AS spans multiple stories, each line gets its own owner. Use `owner: ?` when unknown upfront, resolve when reaching that story.

**Three checkbox states:**
- `[x]` — done: there is a test assertion AND production code emitting the behavior
- `[~]` — partial: carve-out with a concrete destination (story ID that exists in the plan, OR Known-Gap row in the spec). References like "future work", "later", "TODO.md", "Phase X (does not exist)" are NOT accepted
- `[ ]` — untouched: will be covered by a later story in this build, or out-of-scope already declared

**If checklist already exists** (resume build):
- Re-derive from the current spec. Diff against the old checklist.
- New line in spec, missing from checklist → append `[ ]`
- Line in checklist, no longer in spec → mark `[STALE]` (do not delete — keep audit trail)
- Line present in both BUT Then clause text has changed → reset to `[ ]` with note `RESET: spec text changed <date>`, re-verify. The old `[x]` may be stale — the previous assertion may no longer match.

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

This is orthogonal to the Spec Coverage Gate (Phase 3.5), not a rival: the gate guarantees every AS has a test (breadth, counted on AS-IDs); this table forces each story's tests to consider edge DEPTH — because agents reliably skip edge cases when left to their own judgement, and the gate cannot see that (a test named `AS-005` that only checks the happy path still passes the gate). An `N/A` here means "considered, doesn't apply" — it is never a coverage gap; coverage is the gate's job alone.

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

---

## Test Command

Resolve once before running tests. Auto-detect from project markers:

| Marker | Run all | Run filtered |
|--------|---------|-------------|
| vitest config / vitest in package.json | `npx vitest run` | `npx vitest run -t "<pattern>"` |
| jest config / jest in package.json | `npx jest --no-cache` | `npx jest --no-cache -t "<pattern>"` |
| pyproject.toml / pytest.ini | `python3 -m pytest -x` | `python3 -m pytest -x -k "<pattern>"` |
| Cargo.toml | `cargo test` | `cargo test "<pattern>"` |
| go.mod | `go test ./...` | `go test ./... -run "<pattern>"` |
| build.gradle | `./gradlew test` | `./gradlew test --tests "<pattern>"` |
| *.sln | `dotnet test` | `dotnet test --filter "<pattern>"` |
| Package.swift | `swift test` | `swift test --filter "<pattern>"` |
| Gemfile | `bundle exec rspec` | `bundle exec rspec -e "<pattern>"` |

All test commands below use `TEST_CMD` to mean the resolved command. For filtered runs, use the framework's native filter flag from the table above.

**Filter pattern verification (MANDATORY before trusting a filtered run):**

A filtered run that matches zero tests will exit 0 on many frameworks — that is a false green. Before trusting any `TEST_CMD --filter "<pattern>"` result, confirm the pattern matched ≥1 test case:

- vitest: `npx vitest list -t "<pattern>"` → output must list ≥1 test
- jest: add `--passWithNoTests=false` → exits 1 if no tests match
- pytest: `-k "<pattern>" --collect-only -q` → output must list ≥1 test
- cargo: `cargo test "<pattern>" -- --list` → output must list ≥1 test
- go: `go test -run "<pattern>" -list ".*" ./...` → output must list ≥1 test
- gradle / dotnet / swift / rspec / other: if no equivalent listing command is known, fall back to verifying by `grep -r "<test name>" <test-dir>` — the test string must exist in source. Log `FILTER_VERIFY: fallback-grep` in the summary.

If the verification shows 0 matches → the test you just wrote did not register (wrong name, wrong file location, framework did not pick it up). Fix before proceeding. Do NOT interpret 0-match as "PASSES". **Max 3 retry attempts** on filter-match failure; if still 0 after 3, stop and report BLOCKED (test infrastructure issue, not a TDD issue).

---

## Phase 2: Story Loop (RED → GREEN → REFACTOR)

Work through stories one at a time from the spec's `## Stories` section.
Follow the project's existing test patterns.

**For each story:**

### Step 1 — RED: Write test, verify it fails

Write tests for the story's acceptance scenarios.

First, verify the filter pattern matches the new test (see "Filter pattern verification" in the Test Command section). Then run:
```
TEST_CMD --filter "<story test name>"
```

**Capture and paste the raw failure output** (stack trace / assertion diff / first 20 lines) into your notes — this is the evidence for the `RED → GREEN` claim in Phase 5. A summary like "3 fails" without the raw text is not sufficient evidence.

- **FAILS** → correct. The test describes behavior that doesn't exist yet. Continue to Step 2.
- **PASSES** → the behavior already exists. Either the test is wrong (assertions too weak) or the code already handles this case. Investigate before continuing. If already covered, mark story `done` and move to the next story.
- **0 TESTS MATCHED** → filter pattern did not register. Fix test name / file location. Do NOT proceed.

### Step 2 — GREEN: Implement minimal production code

Write the minimum production code needed to make the failing tests pass. No more, no less.

> **TDD GREEN vs "NEVER fix production code" (Phase 4) — disambiguation:**
> - Writing NEW production code to satisfy a NEW failing TDD test: **REQUIRED** (this is GREEN).
> - Modifying EXISTING production code because an EXISTING test started failing in Phase 3/4: **requires AskUserQuestion first** (this is the "NEVER" rule).
> The difference is: TDD writes code toward a test written moments ago. Fix Loop touches code that was already green. Don't confuse the two.

Run (filtered):
```
TEST_CMD --filter "<story test name>"
```

- **PASSES** → continue to Step 3.
- **FAILS** → fix production code (not the test). Max 3 attempts, then stop and report per Phase 4.

### Step 3 — REFACTOR (optional)

If the implementation introduced duplication, unclear naming, or violated existing patterns — refactor now while tests are green. Run tests after refactoring to confirm nothing broke.

### Step 4 — Update progress

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
```
For `[x]`, record `file:test-name`. For `[~]`, record the destination.

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

**If the project does not use a formal spec/plan** (bug fix single story, no /mf-plan): skip the destination rule for this build, replace with a lighter rule "each TODO in diff must have a 1-line justification in the summary" — log in Phase 5 output as `CARVE_OUT_RELAXED: no spec context`.

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
  (a) Artifact is genuinely required → add a checklist line sourced from the AS/Constraint that requires it. If no AS requires it → the spec is missing coverage; add a Known-Gap or run `/mf-plan` to add an AS
  (b) Artifact is infrastructure for a later story → convert to `[~] <artifact> — deferred use → <future story/gap>`
  (c) Orphan (legacy/experiment) → remove or justify in the spec

This rule is **language-agnostic**: the dev decides what counts as an "artifact" based on the diff. The skill does not grep DDL or parse ASTs. It only requires "everything new has a documented reason".

**Ordering gate:** tick the checklist BEFORE marking the story `done` in `.build-progress`. If a checklist line with `owner: <this-story>` is not yet ticked or converted to `[~]`/`[N/A]` → story is NOT `done`. One-way sync: progress = f(checklist).

**Then proceed to the next story.**

---

**Before moving to Phase 3, verify** (inline run only — a dispatched Auto-Mode subagent stops after its one story and reports back; the controller runs Phase 3):
- [ ] All public functions have unit tests
- [ ] All API endpoints have integration tests
- [ ] Edge cases covered (null, empty, invalid, boundary)
- [ ] Error paths tested (not just happy path)
- [ ] Tests are independent (no shared state)
- [ ] Assertions are specific and meaningful

---

## Phase 3: Build and Run

This runs the full test suite after all stories are complete. Individual story tests were already verified in Phase 2.

Compile/typecheck first (tsc --noEmit, cargo check, go vet, swift build, etc.).

Then run all tests:
```
TEST_CMD
```

---

## Phase 3.5: Spec Coverage Gate (deterministic — the actual guarantee)

Everything else (checklist ticks, per-story counts, reviewer grep) is LLM judgement and can drift. This gate is the one place coverage is **counted by a command, not hoped for** — it makes "every spec case has ≥1 test" an invariant: the build does not pass while any AS/C is uncovered.

It works because **tests embed their `AS-NNN`/`C-NNN` in the test name** (Phase 1 quality check). The gate is a set-difference: spec IDs minus IDs found in the test files.

```bash
SPEC=docs/specs/<feature>/<feature>.md
TESTDIR=<test dir>            # e.g. tests/ or src/ (resolve like TEST_CMD)

# Obligations from the spec: every AS-NNN and C-NNN under ## Stories / Constraints
# Use -w (word match), NOT \b — \b is a GNU-ism; on BSD/macOS grep it produces
# phantom short IDs (e.g. "AS-01" out of "AS-010"). -owE is portable and exact.
grep -owE '(AS|C)-[0-9]+' "$SPEC" | sort -u > /tmp/spec-ids.txt
# Covered: IDs that actually appear in a test file (tests embed the ID in their name)
# -h is REQUIRED with -r: without it grep prefixes each match with "file:" and the
# set-difference never matches (gate would falsely report everything uncovered).
grep -rowhE '(AS|C)-[0-9]+' "$TESTDIR" | sort -u > /tmp/covered-ids.txt
# Uncovered = in spec, not in any test
comm -23 /tmp/spec-ids.txt /tmp/covered-ids.txt
```

- **Any line printed → BLOCKED.** Those AS/C have no test carrying their ID. List them; do not mark the build DONE. (Single-story / no-formal-spec builds: skip — log `COVERAGE_GATE: no spec`.)
- **Open gaps:** `grep -E 'GAP-[0-9]+' "$SPEC"` whose status is not `resolved` → list them in the summary as "unresolved gaps (not blocking, but visible)". A gap is never silently dropped: it is either resolved into an AS (via `/mf-plan`, then it gets counted) or shown as open.

**What this gate does and does NOT prove.** It proves identity presence (necessary): no AS is missing a test. It does NOT alone prove the test is meaningful — that's the per-AS rules: one test node per primary AS, with a real assertion (Phase 1), and the strong form, **falsifiability** — negating an AS's Then should turn its test red. Identity gate = cheap and deterministic (run it every build); falsifiability via mutation testing = the north-star, optional/advanced. The gate stops silent *absence*; the assertion rules stop silent *emptiness*.

**Auto-mode:** the controller runs this gate at A7 (finish) over the whole spec, and may run the per-story slice after each story's gates (A4). Dispatched subagents are told (A2 contract) to embed `AS-NNN` in every test name so the gate can see their work.

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

Start with one of:
- **DONE** — All stories green, implementation risks addressed, no signal needed, **AND checklist is 100% `[x]` or `[N/A]`**.
- **DONE_WITH_CONCERNS** — Green but: [P2 risks from Phase 0.5 / coverage gaps / spec signal / **any `[~]` carve-outs in checklist**]
- **BLOCKED** — Cannot proceed: [what's blocking, what was tried, 3-attempt limit hit]
- **NEEDS_CONTEXT** — Missing info to continue: [what's needed and why]

```
Tests: X added, Y modified, Z unchanged
Result: All passing ✓ / N failing ✗
Coverage: [critical uncovered paths if any]
Files changed: [production files touched]
Files tested: [test files touched]
Stories: [AS-001 ✓, AS-002 ✓, AS-005 new]
TDD evidence: [S-001: RED (paste 1st failing assertion raw) → GREEN ✓ | tests added: <names>, S-002: RED (raw output) → GREEN ✓ | tests added: <names>]
Checklist: X/Y [x], A/Y [~] (destinations: <story-id list or Known-Gap refs>), B/Y [ ] (reasons), C/Y [N/A]
Coverage gate (Phase 3.5): PASS — all AS/C carry a test | BLOCKED — uncovered: <AS/C ids>   (breadth)
Edge Case Compliance: [per-story table — every row ✓ or N/A+reason]   (depth)
Open gaps: [GAP-NNN not yet resolved, or "none"]
E2E needed: [→E2E gaps from Coverage Map, or "none"]
Eval needed: [→EVAL gaps from Coverage Map, or "none"]
Manual needed: [→MANUAL gaps from Coverage Map, or "none"]
```

**Progress file cleanup:**
- All stories done AND checklist is 100% `[x]`/`[N/A]` → delete `docs/specs/<feature>/.build-progress` and `.build-checklist`
- Stories remaining OR any `[~]` carve-outs → leave both files. Log: "Progress + checklist saved — resume with `/mf-build`"

### Spec Update Signal

**Relationship with Phase 0.6 Checklist:**
- Checklist is an **evidence artifact** (what got done / deferred).
- S1/S2/S3 are **action signals** (user must run `/mf-plan`).
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
⚠️ Spec Update Needed — run `/mf-plan docs/specs/<feature>/<feature>.md '<describe change>'`
Reason: [S1 | S2 | S3] — <one line: what is missing or mismatched>
```

If S1 applies to a failing test: state **"This failure suggests a missing acceptance scenario."** Describe the gap and prompt to run `/mf-plan` before re-running `/mf-build`. Do not silently add the test without the AS.

## Rules
1. **Behavior over implementation.** Test what code DOES, not how.
2. **Independent tests.** Each test sets up its own state, cleans up after.
3. **Spec stays upstream.** If a test reveals a spec gap (S1), signal and update the spec before adding the test. If code drifts from spec (S2), signal. If new constraint added (S3), signal.
