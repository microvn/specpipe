# orchestration.md — Auto-Mode controller (A1–A7)

**Who reads this:** the **controller** only. You do NOT implement — you order, dispatch, gate, and route. You read `core-loop.md` **only** for §Phase 0a/0b/0.6 + §Test Command — the probe, foundation gate, and checklist derivation you own in A1 (A1.0/A1.3). You do NOT read its build steps (Phase 1/1.5/2/4) — those belong to your dispatched subagents. You read `gates.md` for the gates you run at A4/A7. Keep controller context lean: read status and checklist ticks, never full diffs or full subagent bodies.

**Token discipline (controller side):** the two dominant cost drivers are turn count per subagent (`n`) and how much static context each dispatch prompt carries (bloats your history). Attack both: keep stories small (A1.6 split guard), keep dispatch prompts lean (A2 — point, don't paste), and never re-read a diff you already gated.

### A1 — Plan the run (read spec ONCE)

**0. Foundation Gate + context check (before any dispatch).** Run the Phase 0b Foundation Gate once (`core-loop.md` § Phase 0b): if there is no runnable harness (no project markers / runner not invocable), STOP and report BLOCKED pointing to `/sp-scaffold` — never dispatch stories onto an empty repo. Also **sanity-check the harness's context management**, but do not misdiagnose it: on a large-context model (e.g. GLM-5.2 at 1M) a normal build sits far below the window, so auto-compaction correctly will NOT fire — that is not a bug, and there is no "compaction threshold %" to set (mainline opencode has no such key; auto-compaction is on by default and triggers only near window-full). The per-turn cost of a long build comes from **stale tool outputs riding along in the prefix every turn**, not from missing compaction. The real lever, if the harness offers it, is pruning those outputs (opencode: `compaction.prune: true` in `opencode.json`). Recommend enabling it for long builds; don't chase a threshold knob. Then:

1. Read the spec once. Extract for every story: ID, priority, full text + its AS, and the `**Execution:**` block (`depends_on`, `parallel_safe`, `files`, `autonomous`, `verify`). Missing block → treat as `depends_on: none, parallel_safe: false, autonomous: true, files: unknown`.
2. Read `.build-progress` if present. In Auto-Mode it uses **three** states: `done`, `building`, `pending`. The controller flips a story to `building` right before dispatch (A2) and to `done` only after its gates clear (A4/A4b) — so a story interrupted mid-build is left as `building`, never silently `done`. **On resume:**
   - `building` story → it was in flight when interrupted. Check `git log --all --grep "S-NNN"` — this scans the FULL message including the `Story:` footer (A2 mandates it there). Do NOT use `git log --oneline | grep` — that only sees the subject and will miss the footer, giving a false "no commit" that overwrites finished work. Commit exists → the subagent finished but wasn't gated → gate it (A4) instead of rebuilding. No commit → re-dispatch it.
   - `pending` → untouched, build normally. `done` → skip.
   - **No `.build-progress` at all** (fresh run, or the file was deleted): before treating every story as `pending`, run `git log --all --grep "Story: S-NNN"` per story. A matching commit means the story is already built (the footer proves it) → gate it (A4), don't re-dispatch. Only stories with no commit are truly `pending`. Without this check the controller re-builds committed work whenever the progress file is missing — pure wasted spend.
   - **Stale worktrees from an interrupted prior run:** run `git worktree list`. For any leftover agent worktree (path under `.claude/worktrees/` or branch `worktree-agent-*`): if its story is `done` and its branch is merged → clean it up (`git worktree remove` + `git branch -d` + `git worktree prune`). If it is **locked** or its work is unmerged → do NOT force-remove; report it ("leftover worktree <path> from an interrupted run — remove with `git worktree remove -f -f` only if you're sure its agent is dead") and leave it. Never blindly `-f -f` on resume.
3. **Derive the full checklist yourself now.** Dispatched subagents are barred from checklist derivation, so the controller owns it: run Phase 0.6 (`core-loop.md`) over the whole spec, give each line an `owner: S-NNN`, and write `.build-checklist`. (On resume, re-derive and diff per Phase 0.6's "checklist already exists" rules.) This must exist before the first dispatch, because A2 pastes each story's `owner` lines into its subagent prompt.

   **Flag visual-port stories (web/DOM only).** While reading the spec, mark any story that meets the `port.md` pixel-port criteria (web/DOM stack + must match a canonical design source 1:1). The controller keeps the **fidelity** half of such a story: dispatch the subagent to build only the behaviour + a structural draft (its AS tests), then after its gates pass run `/sp-port-webui` from the controller to drive that surface to 100% fidelity. Never bury a "match the prototype/Figma" obligation inside a subagent — a dispatched subagent can't invoke `/sp-port-webui` (no skill recursion) and would silently hand-code the port. If a port surfaces a data-gap, route it through `/sp-plan` and re-dispatch the owning story here.
4. **Validate the dependency graph FIRST.** Every `depends_on` ID must resolve to a story in this spec, and the graph must be a DAG. If any `depends_on` points to a missing/removed ID, or there is a cycle (or at any later point pending stories remain but none is ready) → STOP with `🛑 BLOCKED: dependency cycle or dangling ref between <stories>` and tell the user to fix it via `/sp-plan`. Do not loop.
5. **Compute waves** from priority + `depends_on`:
   - A story is ready when all its `depends_on` are `done`.
   - Within a ready set, order by priority (P0 → P1 → P2). **Process the ready set in priority order: run sequential-eligible stories first (one at a time), then dispatch the parallel group.** Never run an inline sequential build at the same time as a worktree wave — finish the sequential story, then start the group.
   - A set of ready stories runs **in parallel only if** every one is `parallel_safe: true` AND none is `autonomous: checkpoint` (checkpoint stories always run sequentially so the A5 pause fires) AND their `files` are concrete (not `unknown`, not a bare directory hint) AND pairwise disjoint. Any overlap, any `unknown`, any directory-level hint, any dependency, any doubt → that story drops to sequential. A wave can mix: dispatch the parallel-eligible group (in batches, see the concurrency cap below), build the rest one at a time.
   - **Two implementer subagents must never share one working tree** — git index, `HEAD`, and the build dir are shared even when file *contents* are disjoint. Parallel dispatch therefore uses worktree isolation; see A2 (dispatch) + A4b (integration) for the exact procedure. If `isolation="worktree"` is unavailable in this environment, fall back to sequential for that wave.
   - **Concurrency cap — never more than 3 implementer subagents at once.** If a parallel-eligible group has >3 stories, dispatch in batches of ≤3: a batch's branches integrate (A4b) before the next batch starts. More than ~3 burns context/tokens in parallel and risks rate limits, while the *sequential* A4b integrate is the real bottleneck — extra concurrency buys little. The cap drops with the context tier (A6): **3** at PEAK, **2** at GOOD, **1 (sequential)** at DEGRADING or worse. It is a ceiling, not a target — 2 disjoint stories run as 2, never padded to 3.
6. **Story-size guard (cost control — `n` is set here, not at build time).** For each in-scope story, count its primary AS and the distinct file/dir areas its `files` touches. A story's build cost is quadratic in the turns it takes, and turns scale with AS count. **If a story has >~4 primary AS, or its `files` span >~3 distinct areas, it is oversize** — one subagent will thrash through a huge turn count on it (this is the S-001-with-7-AS pathology). Handle before dispatch:
   - Preferred → **STOP and route the split upstream:** `🛑 BLOCKED (oversize): S-NNN has <n> AS — run /sp-plan to split into ~3-4-AS stories, then resume /sp-build.` Story sizing is `/sp-plan`'s job; splitting there fixes it once, in the spec.
   - If the spec's Sizing Notes already flag it (`/sp-plan` knew but didn't split) → same signal, cite the note.
   - Only if splitting upstream is impossible right now → dispatch the story as **sequential** sub-tasks yourself: build its AS in ≤4-AS batches within one subagent's brief is NOT enough (same context); instead dispatch the story once but instruct the subagent to keep strictly to Token Discipline, and accept the higher cost. Log `OVERSIZE_UNSPLIT: <S-NNN>` in the summary so it's visible.

### A2 — Per-story dispatch (point, don't paste)

Before dispatching, check the story's `autonomous` field: if it is `checkpoint`, pause and let the human inspect before proceeding (A5) — do not dispatch it silently. Then mark the story (or each member of a parallel group) `building` in `.build-progress` so an interruption is recoverable (A1).

**Dispatch shape:**
- **Sequential story** → dispatch one **general-purpose subagent** via the Agent tool, working in the current tree.
- **Parallel-eligible group** (from A1.5) → first capture the wave base: `EXPECTED_BASE=$(git rev-parse HEAD)`. Then dispatch each member subagent with `isolation="worktree"` so each gets its own worktree + branch off HEAD — **at most the A1.5 concurrency cap (≤3) at a time**; if the group is larger, do it in batches, integrating each batch (A4b) before dispatching the next. They run concurrently within a batch; the controller integrates their branches afterward (A4b).

**Keep the dispatch prompt lean.** The prompt is stored in YOUR history for the rest of the run — every line you paste is a recurring cost. Point to files on disk; paste only what the subagent cannot derive. The prompt MUST contain:

1. **Point** the subagent to its procedure — the small file, NOT the 900-line manual: *"Read `<skill-dir>/core-loop.md` and follow it for EXACTLY the one story below. Read `<skill-dir>/port.md` too ONLY if your story is a visual pixel-port. Do NOT read `SKILL.md`, `orchestration.md`, or `gates.md`. Do NOT invoke the sp-build skill (no recursion), do NOT re-enter Mode Detection, do NOT read or build any other story."* (Resolve `<skill-dir>` and pass it as an **absolute** path. A worktree-isolated subagent only sees committed repo files, so a skill installed outside the repo tree must still resolve from inside the worktree — verify the path resolves before a parallel/worktree dispatch, else fall back to sequential.)
2. **The dispatched-subagent contract** (paste verbatim — this keeps the controller the single owner of cross-story state):
   - Build only your assigned story; the Phase 2 loop runs exactly once.
   - **Token discipline is mandatory** (also at the top of `core-loop.md`): batch independent tool calls in ONE turn — never one-tool-per-turn; `Write` a new file once instead of building it with many `Edit`s; verify RED once and GREEN once per story, do NOT re-run tests after every edit; never re-read a file you already read; truncate noisy output. Your build cost is dominated by turn count — keep it low.
   - Name every test with the `AS-NNN` it covers (`AS-NNN: <scenario>`), one test node per primary AS — the controller's Spec Coverage Gate counts coverage by that ID, so an untagged test is invisible to it.
   - If your pasted checklist contains `BM.<AS-NNN>.<surface>` lines, treat each as a cell-level test obligation. Your test evidence must include the AS id and exercise that exact surface/source/timing cell. Do not satisfy a BM line with a mock of the boundary named by the cell.
   - If your pasted checklist contains `C-<NNN>.<clause>` lines (a decomposed multi-clause constraint), each clause is its OWN test obligation — one assertion per clause, ticked independently. Naming a test after the constraint but asserting only one clause does NOT cover the others (the C-010 trap). For each `C-*` clause and each reject/deny rule, report the assertion + the mutation that would turn it red (A3 `Constraint falsifiability`); if you cannot name a red-turning mutation, the clause is not done. A reject rule needs its accept-side partner test (Boundary-Pair Rule); if the spec has no accept AS to pair it with, return it as `Spec signal: S1`.
   - Do NOT write `.build-progress` or `.build-checklist` — the controller owns them. Report your checklist ticks in the contract instead.
   - Do NOT run Phase 3 (full-suite), Phase 4.5 (cross-story checklist review), or Phase 5 (summary/cleanup), and do NOT read `gates.md` — those are the controller's job. Run only your story's filtered tests.
   - Do NOT surface a spec signal to the user or edit the spec — return it in the `Spec signal` field.
   - Commit your own work as ONE commit, conventional format, with a `Story: S-NNN` footer line (sp-commit's story-link convention):
     ```
     feat(scope): <short desc>

     Story: S-NNN
     ```
     The footer is how the controller finds your work on resume (`git log --grep`) — mandatory, not cosmetic.
   - **If you are running in a git worktree** (parallel dispatch): before any edit, assert `git symbolic-ref HEAD` is your own per-agent branch, NOT a protected ref (`main`/`master`/`develop`/`release/*`) — if it is protected, STOP and report BLOCKED, never `git update-ref` your way onto it. Then confirm your branch was cut from `EXPECTED_BASE` (passed in your prompt); if `git merge-base HEAD <EXPECTED_BASE>` differs from `EXPECTED_BASE`, `git reset --hard <EXPECTED_BASE>` before starting. Stay inside your worktree; touch only your `files`.
3. **Paste only the minimum the subagent cannot derive:** the story's full text + its AS + the `files` hints + relevant Constraints + **the `.build-checklist` lines whose `owner` is this story** (so the subagent reports ticks against the controller's real line IDs, not IDs it invented) + **`EXPECTED_BASE` if this is a worktree (parallel) dispatch**. Do NOT paste the whole spec, the whole checklist, other stories, or the procedure — the subagent reads the procedure from `core-loop.md` and has the story from here.
4. Demand the **report contract** in A3.

### A3 — Report contract (what the subagent returns)

```
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Story: S-NNN
Files changed: [...]
Tests added: [exact test names]
Checklist: [lines ticked — one per C-NNN.<clause> line, never one tick for a whole multi-clause constraint]
Constraint falsifiability: [per C-* line and reject rule: assertion (file:test-name) + the mutation that turns it red; note any mutate-run-revert actually performed]
Edge compliance: [the 8-row table for this story — each ✓ or N/A+reason] (depth forcing-function; the controller aggregates these into Phase 5)
Behavior Matrix evidence: [BM lines covered with test refs; BM lines partial with destinations; mocked-boundary concerns]
Spec signal: none | S1 <gap> | S2 <conflict> | S3 <added guard>
```

Controller reads this report only — not the diff. (Spec signal definitions = `gates.md` § Phase 5 "Spec Update Signal".)

### A4 — Two gates per story (both must pass to continue)

**Gate 1 — Verification.** The controller runs the cheap checks directly: the story's filtered tests + its `verify` command if present (these emit pass/fail, not a diff to read). For the review, **dispatch a reviewer subagent** (sp-review-style, spec-compliance scoped to the story's commit) that reads the diff and returns a one-line verdict — so the controller never loads the diff itself. **Instruct that reviewer to run the Constraint-Clause Falsifiability Gate (`gates.md`) for this story's `C-*` lines and reject rules**: per line, return the assertion (`file:test-name` + what it asserts) AND the mutation that turns it red, actually running the mutate-run-revert for security/integrity/release-critical constraints. A line with no red-turning mutation is vacuous → the story is not done for that clause (reopen it, same as a failing check). Any check fails → re-dispatch the implementer subagent **once** with the specific failure. (The subagent already spends its own internal 3-attempt budget per Phase 4 — the controller does not add 3 more on top; that would blow past the project's "max 3 fix loops" rule. One corrective re-dispatch, then stop.) Still failing → BLOCKED.

**Gate 2 — Spec signal** (runs in parallel with Gate 1, enforces the project rule "only /sp-plan touches specs"):
- `S1` (behaviour/edge case with no AS) or `S2` (code must contradict an AS) → **STOP the run.** Surface the signal and the exact command: `🚩 SPEC-SIGNAL (drift): run /sp-plan docs/specs/<feature>/<feature>.md '<change>', then resume /sp-build.` Do not auto-edit the spec, do not skip the story. **STOP = stop dispatching NEW stories; let any in-flight sibling subagents finish their current story (do not kill them mid-write).** Keep already-committed/merged work — S1/S2 mean the spec is stale, not that the code is wrong; leave those stories `done`, leave their commits, and just don't advance. Resume after `/sp-plan`.
- `S3` (added guard/constraint not in spec) → record it for the final report, continue.

Only when both gates clear: tick `.build-checklist`, mark the story `done` in `.build-progress`, move on.

For a **sequential** story the subagent committed in the current tree, so gate it directly here. For a **parallel wave**, integrate first (A4b), then gate each story on the integrated tree.

### A4b — Integrate a parallel wave (parallel dispatch only)

After every member of a parallel group returns `DONE` (handle any non-DONE per A5 first), merge their worktree branches into the working branch — the controller does this, sequentially, deterministic order (ascending `S-NNN`):

1. For each branch: `git merge --no-ff <branch>`. Files were declared pairwise-disjoint, so a clean merge is expected.
2. **On conflict** → the story's `files`/`parallel_safe` was wrong (it overlapped a sibling — often a shared router/index/schema). Do NOT resolve by force: `git merge --abort`, then **rebuild that story sequentially** on top of the already-integrated base (re-dispatch it as a sequential story in the current tree). Record a warning and a spec-fix hint: `⚠️ WARN (parallel_safe): S-NNN overlapped a sibling — rebuilt sequentially; run /sp-plan to set parallel_safe: false / fix files.` This is the self-correcting safety net for an over-optimistic `parallel_safe`.
3. After all branches are integrated, run the A4 gates for each story **on the integrated tree** (not on the isolated branch) so cross-story breakage surfaces. If a gate fails here, re-dispatch that implementer **sequentially in the integrated tree** (its worktree may already be gone) under the same one-retry-then-BLOCKED rule. Then mark each `done`.
4. Tear down each worktree **explicitly** — a worktree the subagent committed to is *changed*, and `isolation="worktree"` only auto-cleans *unchanged* ones, so cleanup is yours. Per member, after its branch is merged: `git worktree remove <path>` → `git branch -d <branch>` (plain `-d`, which only succeeds once merged — a failure means it wasn't integrated, so stop and investigate, do NOT `-D`) → finally `git worktree prune`. **Do not `git worktree remove -f -f` a *locked* worktree** — a lock (`claude agent … pid`) means the agent is still live or the run was interrupted; force-removing it can destroy in-flight work. If a worktree is still locked when you reach teardown, the subagent has not actually returned — wait for it (or treat as BLOCKED), don't force.

### A5 — Stop conditions (otherwise: do NOT pause)

Run continuously. Do **not** ask "continue?" or print progress summaries between stories. Stop only when:
- a story is `autonomous: checkpoint` → pause via `AskUserQuestion` **twice**: (1) BEFORE dispatch — "S-NNN is a checkpoint (sensitive: <why>). Build it now / skip for now / stop?" and do not dispatch until the user approves; (2) AFTER its gates pass, before marking `done` — show what changed and ask "looks right / needs changes?". A bare text note is not a pause — you must actually stop and wait for the answer,
- a subagent returns `NEEDS_CONTEXT` → surface its question to the human and answer it, then re-dispatch the SAME story. Do NOT mark it `done` and do NOT skip it,
- `BLOCKED` you cannot resolve (subagent's 3 internal attempts + your 1 re-dispatch exhausted),
- a dependency cycle / dangling ref / no-ready-but-pending state (per A1) → `BLOCKED`,
- an oversize story that must be split upstream (A1.6) → `BLOCKED` pending `/sp-plan`,
- spec signal `S1`/`S2`,
- all stories `done`.

### A6 — Context budget (controller self-monitoring)

- Read frontmatter/status/checklist, never full SUMMARY/diff bodies, unless on a ≥500k-token model and a decision needs it.
- Track usage tiers: <50% normal; 50–70% economize, frontmatter-only, warn the user "context getting heavy — consider checkpointing"; 70%+ checkpoint progress to `.build-progress` immediately and stop.
- Watch for degraded subagent output (vagueness like "appropriate handling", reported items fewer than the story's AS) → re-verify against the checklist, don't trust the report.

### A7 — Finish

When all stories `done`: read `gates.md`, run the full suite once (respecting the red-suite Fix-Loop guardrails there), **run the Linked-Field Seam Gate if this or a sibling spec has a `## Linked Fields` block** (cross-spec seam tests against the real producer on the integrated tree — the controller owns this; a single-side subagent could not), **then run the Spec Coverage Gate over the whole spec** — any uncovered AS/C → not DONE, reopen the owning story. Then the Phase 5 summary (aggregate: stories built, coverage-gate result, open gaps, S3 signals, deferred items). Delete `.build-progress`/`.build-checklist` only if the gate passed AND checklist is 100% `[x]`/`[N/A]`.
