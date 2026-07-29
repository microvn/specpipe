# controller-prep.md — Auto-Mode planning setup (Session Isolation + Foundation Gate + Checklist derivation)

**Who reads this:** the **controller** (Auto-Mode A1 — runs the Session Isolation Gate at A1.0, then the Foundation Gate, then derives `.build-checklist` at A1.3 before the first dispatch), and the **inline builder** (runs all three once before its story loop). A **dispatched subagent NEVER reads this** — the controller already ran the gates and pasted the subagent's checklist lines into its prompt. **A subagent running Phase 0a would nest a worktree inside a worktree.**

These sections were split out of `core-loop.md` so the controller can read exactly what it owns without dragging the build steps (Phase 0/0.5/1/1.5/2/4) into its context. `TEST_CMD` resolution lives in `test-command.md` (shared) — read that for the Foundation Gate's marker check.

---

## Phase 0a: Session Isolation Gate (one run = one worktree = one branch)

Runs **first**, before the Foundation Gate. Without it a run builds in whatever tree the session was launched in, so two concurrent sp-build sessions share one git index, one `HEAD`, and one current branch: session A's commit sweeps up session B's half-written files, and A2's `EXPECTED_BASE` moves under both of them. Story-level isolation (A2) does not cover this — it isolates subagents *within* one run, not runs from each other.

**One run = one worktree = one branch**, named off the feature so the name itself is the mutual exclusion — no lock file, no pid, no registry. Pass `EnterWorktree` the name `sp-build-<feature>`; Claude Code derives both paths from it:

```
EnterWorktree name:  sp-build-<feature>
worktree:            .claude/worktrees/sp-build-<feature>
branch:              worktree-sp-build-<feature>      ← note the worktree- prefix
```

The `worktree-` prefix is Claude Code's, not ours — use the full branch name in every `git merge` / PR command you print. Do **not** put a `/` in the name: a slash is legal but gets slugified to `+` in the path (`sp-build/auth` → `.claude/worktrees/sp-build+auth`), which makes the paths you report wrong.

**Authorization (read this before step 2 — it is why this gate silently no-ops otherwise).** The `EnterWorktree` tool refuses to run unless working in a worktree was requested by the **user** or by **project instructions in `CLAUDE.md` / memory** — a skill file is not on that list. So a project that wants isolated sp-build runs must carry one line in its `CLAUDE.md`:

```markdown
`/sp-build` runs each build in its own git worktree (sp-build Phase 0a).
```

Without it, a compliant controller correctly declines to call `EnterWorktree`, and the run lands on whatever branch the session was on — which is the exact collision this gate exists to prevent. Step 5 turns that into a visible outcome instead of a silent one.

### Steps

**1. Already isolated?**

```bash
[ "$(git rev-parse --git-dir)" != "$(git rev-parse --git-common-dir)" ]
```

True → this session is already in a worktree (a resume, or the user ran `git worktree add`/`claude --worktree` themselves). **Do not nest** — go straight to step 4, then Phase 0b.

**2. Enter the run's worktree.**

```bash
EXPECTED_BASE=$(git rev-parse HEAD)
git symbolic-ref --short HEAD    # must NOT be main/master/develop/release/*
```

On a protected ref → `🛑 BLOCKED: refusing to build directly on <branch> — checkout a working branch first.` (Same rule A2 applies to subagents, lifted to the run.)

Then `EnterWorktree name: sp-build-<feature>`. If that name already exists, Claude Code **reopens** the existing worktree instead of creating one — which is exactly the resume path, since `.build-progress`/`.build-checklist` live inside it under `docs/specs/`.

**3. Assert the base (keep even when `worktree.baseRef` is set).**

```bash
[ "$(git merge-base HEAD "$EXPECTED_BASE")" = "$EXPECTED_BASE" ] || git reset --hard "$EXPECTED_BASE"
```

`worktree.baseRef` defaults to `"fresh"` — branch from `origin/<default-branch>`, **not** local `HEAD`. Every sp-build worktree (this one *and* A2's story worktrees, which inherit the same setting) then starts from the remote's default branch and silently drops unpushed local work. Recommend `{"worktree": {"baseRef": "head"}}` in `.claude/settings.json`; this assert is the net for when it isn't set.

**4. Make the worktree runnable.** A worktree is a fresh checkout of **tracked files only** — no `.env`, no `node_modules`. Skipping this makes Phase 0b fail, or worse: tests read empty config and report a **false green**.

- **Gitignored config** → Claude Code copies files listed in a `.worktreeinclude` file at the project root (`.gitignore` syntax; only files that match *and* are gitignored are copied). If the repo has gitignored `.env*`/secrets files but no `.worktreeinclude`, emit `⚠️ WARN: no .worktreeinclude — <files> will be missing from every worktree` with the suggested file contents. Do not proceed silently. (Not processed when a `WorktreeCreate` hook replaces git creation, nor for a manual `git worktree add` — copy by hand in those cases.)
- **Dependencies** → install in the worktree (`npm ci` / `pnpm install` / …). cargo/go/pnpm use a global store so this is near-free; npm pays a real install. Do **not** symlink `node_modules` — native bindings compile against a path.

**5. Assert the outcome — never leave it unknown.** Steps 1–2 can fail to isolate the run without raising anything: `EnterWorktree` declines when the project never authorized it (see above), the user can deny the call, and the environment may not support worktrees at all. A skipped soft step is invisible; this assert makes every outcome visible.

```bash
git rev-parse --git-dir    # differs from --git-common-dir ⟺ isolated
```

- **Isolated** → proceed to Phase 0b.
- **Not isolated, and the project's `CLAUDE.md` carries the authorization line** → the isolation the project asked for did not happen. `🛑 BLOCKED: session isolation failed — still in the main working tree on <branch>. Do not build here: a concurrent sp-build session would collide.` Report why (`EnterWorktree` denied / unavailable) and stop.
- **Not isolated, and there is no authorization line** → the project has not opted in, so fall back to the pre-gate behaviour: build in the current tree on the current branch. This keeps existing projects working, but say so plainly, once:

  > ⚠️ WARN: building in the main working tree on `<branch>` — no worktree isolation. A second `/sp-build` session on this repo will fight over this branch and index. To isolate runs, add to `CLAUDE.md`: `` `/sp-build` runs each build in its own git worktree (sp-build Phase 0a). ``

  Then skip A8 (there is no run branch to hand back) and note it in the Phase 5 summary.

Never continue past this step without emitting one of the three outcomes.

Then run Phase 0b **inside the worktree**. A Phase 0b failure here means bootstrap, not a missing harness: report `🛑 BLOCKED: worktree bootstrap incomplete — <what is missing>`, not the `/sp-scaffold` message.

**Auto-Mode:** the controller runs this ONCE in A1.0. Dispatched subagents skip it entirely — A2 gives them their own worktree.

---

## Phase 0b: Foundation Gate (a runnable harness must exist)

Runs once, before any test work (Phase 0.5 onward). This is a **precondition, not a build step**: it refuses to enter the TDD loop on a repo with no runnable harness, where Phase 2's RED would error — or worse, report a **false green** (a filtered run matching 0 tests exits 0 on many frameworks; see `test-command.md` §"Filter pattern verification"). sp-build does **NOT** scaffold; that is `/sp-scaffold`'s job. This gate only checks, and points there.

**Check (cheap — NOT the full suite, that's Phase 3):**
1. **`TEST_CMD` resolves** from a project marker (per `test-command.md`). No marker at all → fail.
2. **The runner is invocable** — its list/collect command runs without "command not found" / "no config" (reuse the per-framework list commands from `test-command.md` §"Filter pattern verification"). A runner that can't even list tests is not a harness.
3. **Dependencies are present / installable** — the project's deps are installed, or `install` succeeds.

A fresh build from a spec legitimately has no diff yet — that's fine (Phase 0 already handles it). This gate is about the **harness**, not about whether code changed.

**Outcomes:**
- **Pass** (markers present, runner invocable) → proceed. For an existing project this is a fast no-op — nothing changes (backward compatible).
- **Fail** (no markers / runner not invocable / empty repo) → **STOP, report BLOCKED:**
  > "No runnable harness — the TDD loop can't start. Run `/sp-scaffold` first to stand up a runnable skeleton (brand-new project: `/sp-explore` greenfield → `/sp-scaffold`), then re-run `/sp-build`."

  Do NOT scaffold here, and do NOT proceed into Phase 2 — proceeding would produce false greens on an empty repo, which is exactly the failure this gate exists to stop.

**Recorded `TEST_CMD`:** if `/sp-scaffold` ran, it recorded the resolved `TEST_CMD` + run command (handoff / ARCHITECTURE §13). Use that as the expected marker — a mismatch (scaffold said `vitest`, the repo has none) is a fail, not something to paper over.

**Auto-Mode:** the controller runs this gate ONCE in A1 (before the first dispatch); dispatched per-story subagents assume the harness exists and skip it.

---

## Phase 0.6: Spec Checklist

**Who runs this:** the **inline builder**, and the **controller** (Auto-Mode A1.3 routes here to derive `.build-checklist` before the first dispatch). **Dispatched subagent: skip derivation** — the controller already derived `.build-checklist` and pasted this story's lines into your prompt; work against those line IDs, report ticks back, do NOT write `.build-checklist`.

Derive a checklist from the spec — each "promise" in this build's scope becomes one line. The checklist mirrors the spec; it does not invent new requirements.

**Sources (all in `docs/specs/<feature>/<feature>.md`) — anchor on IDENTITY, not nouns:**
- **Each `AS-NNN` → at least one line carrying that ID** (`AS-NNN`, or `AS-NNN.Tk` when one AS needs several assertions). This is the primary anchor: the checklist is keyed on the spec's case IDs, not on text it happens to mention. A Then with several fields/effects becomes several `AS-NNN.Tk` lines — but they all carry the same AS-NNN, so the AS is never lost.
- **Each Constraint → one line per obligation, keyed on the constraint ID.** A single-obligation constraint → one `C-NNN` line (unchanged — most constraints stay one line, so this does not bloat the common case). A constraint that carries a `clauses:` coverage map → one `C-NNN.<clause>` line per clause (like `AS-NNN.Tk`), each carrying the clause's mapped `AS-###`. A constraint whose *text* bundles several independently-falsifiable obligations (`writes X, verifies Y, refuses Z, atomically W`) but carries NO `clauses:` map and was NOT split upstream → still derive one `C-NNN.<clause>` line per obligation AND raise it as a spec signal (see the under-decomposition rule below): this is the C-010 trap — one line hiding four unbuilt clauses. Ticking one clause must never tick the constraint.
- Each `## Behavior Matrix` cell with `Coverage = AS-NNN` → one `BM.<AS-NNN>.<surface>` line carrying the referenced `AS-NNN`. This is a stricter obligation than the generic AS line: it preserves the exact state/viewer/surface cell that QA will test.
- Each `## Behavior Matrix` cell with `Coverage = GAP-NNN` → a normal `GAP-NNN` checklist line annotated `BM cell unresolved: <state>/<viewer>/<surface>`. It is visible, but it is NOT a BM test obligation.
- Each `## Behavior Matrix` cell with `Coverage = N/A: <reason>` → one `[N/A] BM.NA.<surface>` line with the reason.
- Each open `GAP-NNN` (status not `resolved`) → one `[ ]` line tagged `GAP` (so a parked gap is visible, not silently dropped — see Spec Coverage Gate).
- Each Not-in-Scope row → one `[N/A]` line (prevents accidental ticking).
- Each matching project-local invariant entry under `docs/invariants/INV-*.md` with `status: enforced` and a `test_ref` → one `INV-###` checklist line carrying the invariant id and test ref. `candidate` and `confirmed` entries are visible risks/spec obligations but not build gates unless the spec turned them into AS/GAP/BM lines. Use the invariant registry README/schema as base knowledge; README examples are not runtime entries.
- Each confirmed `## Core Function Model` entry point, seam, external contract, invariant, or optional/absent input is checked through AS/GAP/BM/Constraint coverage, not by a separate checklist line unless the spec names an `AS-NNN`/`C-NNN`. A model entry with no coverage is a Spec Signal.
- Each `## Sibling Surface Map` confirmed surface is checked through its AS/GAP/BM coverage, not by a separate checklist line. Candidate rows with `GAP-NNN` or `ignore(reason)` are visible context only. A candidate row with missing disposition is a spec signal, not a build requirement to implement.

**Completeness invariant (checked, not hoped):** every `AS-NNN` and `C-NNN` in the spec's `## Stories`/Constraints MUST appear on ≥1 checklist line. **Every clause of a `clauses:`-mapped or multi-obligation constraint MUST appear on its own `C-NNN.<clause>` line** — a single `C-NNN` line for a multi-clause constraint = the checklist is wrong (re-derive), because that is the exact line that let C-010's four unbuilt clauses pass. Every `Coverage = AS-NNN` Behavior Matrix cell MUST appear on exactly one `BM.AS-*` checklist line; every `Coverage = GAP-NNN` Behavior Matrix cell MUST appear on exactly one `GAP-* — BM cell unresolved` checklist line; every `Coverage = N/A` Behavior Matrix cell MUST appear on one `[N/A] BM.NA.*` checklist line. An AS with no line = the checklist is wrong (re-derive), not the spec. A Behavior Matrix cell with no line = QA coverage was dropped. Deriving from Then-nouns alone silently drops AS whose Then is verb-shaped ("retries", "must not send") or whose nouns collide with another AS — anchoring on the ID closes that.

**Under-decomposition signal (the C-010 backstop — routes the fix upstream where TDD can act on it).** While deriving constraint lines, read each constraint's text and count its independently-falsifiable obligations. If a constraint states >1 obligation but the spec gave it only one coverage `AS` (or a bare `(S-NNN)` story ref, or nothing) and no `clauses:`/split — the clauses that lack their own AS are unbuildable by TDD (no failing test forces them into code, which is precisely how C-013 boot-validation, C-002 random-material, and C-017 reconciliation were omitted). Derive the per-clause lines anyway (so the gap is visible), mark each clause with no backing AS `[ ]`, and **raise a spec signal S1** — the constraint needs per-clause AS from `/sp-plan`. A constraint is never "orphaned": no clause may sit with no AS, no GAP, and no signal. (Inline: surface S1 and stop per the S1 rule in `gates.md` § Phase 5. Auto-Mode subagent: return it in the `Spec signal` field; controller stops the run per A4 Gate 2.)

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
[ ] C-010.verify-hash   — reads back written bytes, compares hash, fails on mismatch | owner: S-005
[ ] C-010.refuse-overwrite — write to an existing key is refused, not silently clobbered | owner: S-005
[ ] BM.AS-012.appointment-list — Confirmed/trainer/list row parity    | owner: S-003
[ ] GAP-004   — BM cell unresolved: Requested/booker/reschedule action | owner: GAP
[N/A] BM.NA.cancelled-client-calendar — terminal state has no invite  | owner: —
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
