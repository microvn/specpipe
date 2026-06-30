---
description: Read-only root-cause investigation — OPTIONAL branch before /sp-fix. Produces an investigation report with potential root cause hypotheses, evidence, blast radius — no code changes. Use when bug is complex, ambiguous, production-critical, or user explicitly wants to diagnose before fixing (outage, data corruption, regression, unclear stack trace, "it was working yesterday"). Skip for trivial bugs — go straight to /sp-fix. Writes docs/investigate/<slug>-YYYY-MM-DD.md and hands off to /sp-fix.
allowed-tools: Read, Write, Bash, Glob, Grep, AskUserQuestion, mcp__graphatlas__*
---
Deep investigation — find root cause, map blast radius, report without changing code.

Target: $ARGUMENTS

---

## Scope

This skill **investigates only**. It does not write tests, fix code, or edit any file.

Output: a structured report with root cause hypothesis, evidence, blast radius,
and actionable next steps for whoever will fix it (human or `/sp-fix`).

```
Allowed:  Read, Grep, Glob, Bash (read-only: git log, git diff, git blame, find, cat, wc, etc.)
          Write — ONLY to docs/investigate/<slug>-<date>.md (the handoff report)
Blocked:  Edit (any existing file), Write outside docs/investigate/,
          Bash (any command that modifies source/config/data, installs packages, or touches shared state)
```

## Adaptive Depth

This skill auto-scales based on what it finds. No upfront mode selection needed.

```
Context signal (from $ARGUMENTS):
  - Mentions "production", "outage", "data loss", "corruption"
    → bias toward deeper investigation, full blast radius
  - Mentions "UI", "minor", "cosmetic", "styling"
    → bias toward early exit once root cause is clear

Phase 2 (Locate) finds root cause with HIGH confidence?
  → Skip Phase 3 (pattern match)
  → Jump to Phase 4 (form hypothesis) → Phase 5 (blast radius) → report
  → Investigation naturally short (~5 min)

Phase 2 unclear, Phase 3 pattern match helps?
  → Standard depth
  → Investigation ~10-15 min

Phase 3 also unclear, 3-strike rule hit?
  → Report INSUFFICIENT_EVIDENCE with everything gathered
  → Don't spin past 15 min total

Impact is clearly ISOLATED (1 function, ≤2 callers)?
  → Phase 5 simplified: skip diagram, list direct impacts only

Impact is MODULE or wider?
  → Phase 5 full: diagram + blast radius + similar risk scan
```

**Soft timebox guidance:** If stuck > 5 min on any single phase → consider moving
to next phase with partial findings. Don't let one phase consume the entire budget.

---

## Iron Law

**Follow the evidence. Never start with a theory.**

Premature hypotheses cause tunnel vision. Gather facts first, then form a theory that explains ALL facts — not just the convenient ones.

---

## Phase 0a — Graphatlas probe (run once, silently)

Before Phase 1, probe whether graphatlas (GA) is connected:

1. Call `mcp__graphatlas__ga_architecture` with `max_modules: 1`.
2. Interpret:
   - Returns `modules` → **GA available.** Use `ga_*` for every locate / blast-radius step below. Grep is fallback.
   - Error `STALE_INDEX` → call `mcp__graphatlas__ga_reindex` (mode `"full"`), retry once, then treat as available. (This skill is read-only, so no further reindex is needed during the run.)
   - Tool not found / connection error / any other failure → **GA unavailable.** Use grep/glob throughout. Do not re-probe.
3. Carry the outcome through Phases 1-5.

---

## Phase 1: Understand the Report

Parse what you're given. Clarify what you're not.

**Extract these from `$ARGUMENTS`:**

| Field | Required | If Missing |
|-------|----------|------------|
| Symptom | Yes | Cannot proceed — ask |
| Expected behavior | Yes | Cannot proceed — ask |
| Actual behavior | Yes | Cannot proceed — ask |
| Repro steps | Helpful | Attempt to infer from code; flag as assumption |
| Environment | Helpful | Assume production-like; flag as assumption |
| Frequency | Helpful | Assume consistent; flag if intermittent evidence found |

If 2+ required fields are missing → ask ONE question via `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "I need more context to investigate. What's happening?",
    "header": "Bug context",
    "multiSelect": false,
    "options": [
      {"label": "Describe behavior", "description": "What did you expect vs what actually happened"},
      {"label": "Paste error", "description": "Error message, stack trace, or screenshot description"},
      {"label": "Point to code", "description": "Specific file, function, or feature area to investigate"}
    ]
  }]
}
```

**Do NOT proceed past Phase 1 without clear symptom + expected + actual.**

### 1.5 — Behavior Matrix context

If the report mentions status/state, role/viewer, list/detail/worklist/dashboard/feed/API/email/calendar, notification, external provider, or cross-module inconsistency, look for a related spec with `## Behavior Matrix`. Use the invariant registry README/schema as base knowledge; README examples are not runtime entries. Then read project-local invariant entries if present:

- `docs/specs/<feature>/<feature>.md`
- `docs/invariants/INV-*.md`

Record the current mapping hypothesis. This is allowed to be partial until Phase 4:

```
BM CONTEXT
═══════════════════════════════
State/status:    <state or transition | unknown>
Viewer/role:     <actor/viewer/relationship | unknown>
Surface/path:    <list/detail/API/feed/calendar/etc. | unknown>
Matrix cell:     BM.AS-NNN.<surface> | GAP-NNN | N/A:<reason> | NO_CELL | unknown
Invariant match: <INV/C id + status | invariant text | none | no registry found>
```

If no spec or invariant registry exists, continue. Do not invent one during investigation; report the absence as a gap if it matters. If the bug confirms a repeated lifecycle/parity/cascade rule, end the report with `Invariant action needed: add/update invariant: ...`.

### 1.6 — Sibling Discovery Pass (candidate only)

Run this for lifecycle/parity/cascade bugs, existing-operation investigations, or any report whose symptom names one surface but the operation may exist on sibling entry-points.

Purpose: diagnose blast radius before deciding root cause. This produces candidates, not requirements or fixes.

1. Seed nouns/verbs from the raw symptom, touched component, related spec/BM context, and matching invariant entries.
2. Find shared-anchor callers (`ga_callers` if GA is available; otherwise grep) for helpers/constants/schemas that define the operation.
3. Fuzzy-search parallel names such as `create_from_*`, `*_from_<source>`, `send_*invite*`, `*_outcome*`, `reschedule*`, `book_next*`, `cancel*`, `delete*`, plus domain verbs from the symptom.
4. Inspect recent git co-change around touched files (`git log --name-only -- <seed-file>`) for repeatedly paired files/functions.

Record a `Sibling Candidate Table` in the investigation output:

| Candidate | Operation | Evidence | Confidence | Investigation disposition |
|---|---|---|---|---|
| `<surface/path/symbol>` | same create/update/delete/send/read op? | ga_callers / grep / co-change / invariant / symptom | high / medium / low | likely-related / needs-spec-GAP / ignore(reason) |

Do not auto-fix candidates. `likely-related` means the candidate belongs in the root-cause/blast-radius analysis. `needs-spec-GAP` means the report exposes an underspecified sibling. `ignore(reason)` must name why the candidate is false positive or out of scope.

---

## Phase 2: Locate

Find where the bug lives. Work from the outside in.

### 2.1 — Entry Point Search

Start with the most specific artifact available, in priority order:

| Have This? | Search Strategy |
|------------|----------------|
| Error message / stack trace | Grep exact error string → follow call stack |
| Function or class name | Grep definition → read implementation |
| Feature/screen name | Grep for route/handler/view name → trace to logic |
| Only vague description | Grep keywords → read surrounding code → narrow |

> **If GA available (per Phase 0a):** `ga_symbols("<function or type>")` for definitions (ranked by caller count — picks the popular def when names collide), then `ga_callers` / `ga_callees` to map the call graph; `ga_impact(symbol=...)` for a whole-feature view. **If GA unavailable, or the query is free-text error string inside a literal:** use the grep recipes below.

```bash
# Extension set covers ~90% of mainstream code:
# JS/TS family, Python, Ruby, Go, Rust, Java/Kotlin/Scala/Groovy, Swift/ObjC,
# C/C++/C#, PHP, Dart, Elixir, Erlang, Haskell, Clojure, Elm, R, Julia,
# Zig, Nim, PowerShell, shell, SQL, web templates
EXT='*.{js,jsx,ts,tsx,mjs,cjs,vue,svelte,py,rb,go,rs,java,kt,kts,scala,groovy,swift,m,mm,c,cc,cpp,cxx,h,hh,hpp,cs,php,dart,lua,ex,exs,erl,hs,clj,cljs,elm,r,jl,zig,nim,ps1,sh,bash,zsh,sql,erb,html}'

# Error message → find origin
grep -rn "exact error text" --include="$EXT" .

# Function → find definition + callers
grep -rn "function_name" --include="$EXT" .

# Feature → find entry point
grep -rn "route\|handler\|endpoint\|view.*FeatureName" .
```

### 2.2 — Check for Recurring Bugs

Before diving deep, check if this area has a history of bugs:

```bash
# How often has this file been fixed?
git log --oneline --all -- <affected-file> | grep -i "fix\|bug\|patch\|hotfix" | head -10

# How many authors have touched this file recently?
git shortlog -sn --since="6 months ago" -- <affected-file>
```

**Recurring bug signal:** If the same file/module shows 3+ bug-fix commits targeting the **same function or same bug pattern** in recent history → this is likely an **architectural smell**, not a one-off bug. Flag this:

```
⚠️ RECURRING BUG AREA: <file:function> has N fix commits in last M months
Pattern: <what keeps breaking — same null check? same race? same state issue?>
Implication: root cause may be structural (wrong abstraction, missing invariant,
             unclear ownership) rather than a simple code error
```

Note: 3 fixes in the same FILE but targeting completely different functions/concerns
is normal churn, not a smell. The signal is repeated fixes for the SAME pattern.

### 2.3 — Trace the Data Flow

Starting from the entry point, trace forward through the code:

```
INPUT → Where does the data enter?
  → TRANSFORM → What functions process it?
    → DECISION → What branches/conditions control flow?
      → OUTPUT → Where does the result surface to the user?
        → SIDE EFFECTS → What else happens? (DB write, cache update, event emit)
```

At each step, note:
- What type is the data? Can it be null/nil/None/undefined here?
- What assumptions does this code make about its input?
- Are there error paths? Do they swallow errors silently?

**Tentative hypotheses are fine.** You will naturally form theories while tracing.
That's good — note them. But don't commit to a hypothesis until the full causal chain
(location → mechanism → symptom) is verified with code evidence. The Iron Law says
"follow evidence first" — not "suppress all intuition."

### 2.4 — Check History

```bash
# Recent changes to affected files
git log --oneline -20 -- <affected-files>

# What changed in the last commit that touched this file?
git log -1 -p -- <affected-file>

# When was this line last changed? By whom?
git blame -L <start>,<end> -- <affected-file>

# Was this file recently refactored?
git log --oneline --diff-filter=M -10 -- <affected-file>
```

**Regression signal:** If the behavior worked before and a recent commit changed the affected code → the bug is likely in that diff. Flag this:
```
⚠️ REGRESSION SIGNAL: <commit-hash> (<date>) — <commit message>
Changed: <file:lines>
Before: <old behavior>
After: <new behavior>
```

---

## Phase 3: Pattern Match (when needed)

**Skip this phase if:** Phase 2 already produced a HIGH confidence hypothesis
with complete causal chain (location + mechanism + evidence). Jump to Phase 4.

**Use this phase when:**
- Symptom is unclear or ambiguous
- Data flow trace didn't reveal obvious cause
- Investigation is stuck — need a framework to think through
- Bug is non-obvious or intermittent

Match the observed symptom against known bug patterns.
Don't mechanically check every row — scan for patterns that FIT the evidence you have.

| # | Pattern | Signature | Investigation Steps |
|---|---------|-----------|-------------------|
| 1 | **Nil/null propagation** | TypeError, NullPointerException, "undefined is not a function", unwrap on None | Trace value backwards from crash site → find where it becomes nil. Check: is there a guard? Is the guard in the wrong place? |
| 2 | **Race condition** | Intermittent, timing-dependent, "works locally", flaky test | Find shared mutable state. Check: multiple concurrent accessors? Missing lock/mutex/actor isolation? |
| 3 | **State corruption** | Inconsistent data, partial update visible, "impossible" state | Find state mutation points. Check: transaction boundary? Cleanup after error? Multiple writers? |
| 4 | **Off-by-one / boundary** | Wrong count, missing last item, extra item, index out of bounds | Find loop/slice/range. Check: `<` vs `<=`? 0-indexed vs 1-indexed? Empty collection handled? |
| 5 | **Type coercion / cast** | Wrong value type, unexpected string "null", NaN, "0" vs 0 | Find type boundaries (JSON parse, DB query, API response). Check: implicit conversion? Missing validation? |
| 6 | **Stale data** | Shows old data, fixes on refresh/restart, cache-related | Find cache layers (memory, Redis, CDN, browser). Check: invalidation after write? TTL too long? |
| 7 | **Configuration drift** | Works locally, fails in staging/prod | Compare env vars, feature flags, DB schema, API versions across environments |
| 8 | **Silent error swallow** | No error shown but wrong behavior | Grep for empty catch blocks, `_ =`, `catch {}`, `.catch(() => {})`. Check: error logged but not propagated? |
| 9 | **Ordering / timing** | Depends on execution order, async operations complete out of order | Find async operations. Check: await missing? Race between promises/tasks? Event ordering assumed? |
| 10 | **Resource leak** | Gradually degrades, OOM, connection pool exhausted, file descriptor limit | Find open/acquire without close/release. Check: error path also closes? Loop creates without releasing? |
| 11 | **Incorrect merge / conflict resolution** | Bug appears after merge, code has conflicting logic | `git log --merges -5 -- <file>`. Check: merge conflict resolved incorrectly? Both sides kept when one should win? |
| 12 | **API contract mismatch** | Caller sends X, receiver expects Y | Find both sides of the boundary. Check: field names match? Types match? Optional vs required? |
| 13 | **Lifecycle / viewer / surface parity** | Correct on one status/role/surface but wrong on another | Map state x viewer x surface; compare write model, read models, queues, dashboard counts, feed, APIs, notifications, calendar |
| 14 | **Cascade propagation gap** | Write succeeds but derived surfaces are stale/missing | Trace write side effects into projections, cache invalidation, event handlers, queues, external integrations |
| 15 | **External-down divergence** | Internal state updates but provider/email/calendar state is wrong or invisible | Trace retry queue, provider status, user-visible retry surface, idempotency key |

For each matching pattern, record:
```
PATTERN MATCH: #N <name>
Evidence: <specific code/log that matches this pattern>
Confidence: HIGH / MEDIUM / LOW
```

### External Search (when no pattern matches)

If the bug doesn't match any known pattern above, and the error message or behavior
is unfamiliar, search externally:

```
Search: "{framework} {sanitized error type}"
Search: "{library} {component} known issues"
```

**⚠️ SANITIZE BEFORE SEARCHING:**
Strip from the error message before using as search query:
- Hostnames, IPs, internal URLs
- File paths containing usernames or project names
- SQL fragments, query parameters
- Customer data, user IDs, email addresses
- API keys, tokens, secrets (obviously)

Search the **generic error type and framework context**, not the raw message.

If search reveals a documented bug or known issue → record as a candidate hypothesis
in Phase 4 with source link.

---

## Phase 4: Form Hypothesis

Based on evidence from Phases 2-3, form a **specific, testable** hypothesis.

### Requirements for a Valid Hypothesis

```
A valid hypothesis MUST:
  ✓ Name a specific location (file:line or function)
  ✓ Describe WHAT is wrong (the mechanism)
  ✓ Explain WHY it produces the observed symptom
  ✓ Be falsifiable (describe what evidence would DISPROVE it)

A hypothesis MUST NOT:
  ✗ Be vague ("something is wrong with the cache")
  ✗ Name a symptom as a cause ("it crashes because of a null pointer")
     → WHY is the pointer null?
  ✗ Require assumptions not grounded in code evidence
```

### Format

```
HYPOTHESIS
══════════
Location:     <file:line or file:function>
Mechanism:    <what is going wrong, mechanically>
Chain:        <input> → <step 1> → <step 2> → ... → <symptom>
Disproof:     <what evidence would prove this wrong>
Confidence:   HIGH / MEDIUM / LOW
Basis:        <list evidence that supports this>
Behavior Matrix:
  State/status: <state or transition>
  Viewer/role:  <viewer/relationship>
  Surface/path: <surface>
  Cell:         BM.AS-NNN.<surface> | GAP-NNN | N/A:<reason> | NO_CELL
  Spec gap:     none | gap-open | suspicious-N/A | missing-cell
Invariant:      <matched invariant | new invariant candidate | none>
```

### Confidence Levels

| Level | Definition | Threshold |
|-------|-----------|-----------|
| **HIGH** | Traced complete chain from cause to symptom in code. Regression commit identified. Or: reproduced deterministically. | Can explain every step with code references |
| **MEDIUM** | Strong circumstantial evidence. Chain mostly traced but 1-2 gaps remain. Pattern match is strong. | Most steps have code references, some inferred |
| **LOW** | Plausible theory consistent with symptoms but significant gaps in evidence. Multiple alternative explanations possible. | Theory fits but lacks direct code proof |

If confidence is LOW → do NOT present as finding. Continue investigating or report INSUFFICIENT_EVIDENCE.

### Hypothesis Verification Suggestions

For each hypothesis, describe HOW it can be verified without changing code:

```
VERIFICATION PLAN
═════════════════
To confirm this hypothesis:
  1. <read-only step — e.g., "check value of X at runtime via existing logs">
  2. <read-only step — e.g., "grep for other callers of this function to see if they hit same path">
  3. <read-only step — e.g., "compare git blame output with the date the bug was first reported">

If read-only verification is insufficient:
  Instrumentation suggestion: <e.g., "add temporary log at file:line to capture value of X">
  ⚠️ This requires code change — note for whoever implements the fix.
```

### 3-Strike Rule

If 3 hypotheses are formed and NONE can be supported to MEDIUM+ confidence → **STOP**.

Use `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "3 hypotheses investigated, none confirmed to medium+ confidence. How to proceed?",
    "header": "Stalled",
    "multiSelect": false,
    "options": [
      {"label": "New evidence", "description": "I have additional context that might help (describe it)"},
      {"label": "Instrument", "description": "Add logging to the affected area, catch it next time"},
      {"label": "Report as-is", "description": "Publish findings so far with INSUFFICIENT_EVIDENCE status"}
    ]
  }]
}
```

Do NOT keep spinning. 3 strikes = escalate or report partial findings.

### Multiple Hypotheses

If evidence supports 2+ plausible root causes:

```
HYPOTHESIS A (PRIMARY — HIGH confidence)
  Location: ...
  Mechanism: ...

HYPOTHESIS B (ALTERNATIVE — MEDIUM confidence)
  Location: ...
  Mechanism: ...
  Why less likely: <specific reason A is preferred over B>
```

Rank by confidence. Maximum 3 hypotheses — if you have more, you haven't narrowed enough.

---

## Phase 5: Map Blast Radius

Determine what else is affected. This informs fix priority and scope.

### 5.0 — Declare Investigation Scope

Before mapping blast radius, declare the narrowest scope containing the bug:

```
INVESTIGATION SCOPE
═══════════════════════════════
Primary:    <directory or module containing root cause>
Secondary:  <directories containing direct callers/dependents>
Out of scope: <what was NOT investigated, and why>
```

This helps whoever fixes the bug understand what was examined and what wasn't.

### 5.1 — Bug Path Diagram (skip if ISOLATED)

**If impact scope is clearly ISOLATED** (bug in 1 function, ≤2 direct callers,
no shared state, no persistence side effects):
→ Skip diagram. List direct impacts in 2-3 bullet points.

**If impact scope is MODULE or wider:**
→ Draw full diagram:

```
BUG PATH DIAGRAM
═══════════════════════════
[+] <file>
    │
    └── affectedFunction()
        ├── [★★  TESTED] Normal path — test_file:12
        ├── [BUG]         <edge case> (← root cause here)
        │   ├── [GAP]     <downstream effect 1> — NO TEST
        │   └── [GAP]     <downstream effect 2> — NO TEST
        ├── [★★  TESTED] Other branch — test_file:20
        └── [→MANUAL]    View/UI rendering — visual verification only

Legend:
  [★★  TESTED] = has test coverage
  [BUG]        = root cause location
  [GAP]        = no test, affected by bug
  [→MANUAL]    = UI/visual, cannot automate
  [UNCLEAR]    = couldn't determine coverage, needs human check
```

> **If GA available, lean on it for blast radius.** `ga_impact(symbol=...)` is the one-shot tool — returns impacted files, tests, routes, and a runtime risk score. Pair with `ga_callers` / `ga_callees` for the call graph and `ga_architecture` to identify the module/layer (auth, payment, core). More accurate than grep — uses typed CALL/REFERENCES edges and resolves polymorphic dispatch. If GA is unavailable, fall back to grep + manual file reading.

### 5.2 — Impact Scope

```
BLAST RADIUS
═══════════════════════════
Direct impact:
  - <file:function> — <what goes wrong>
  - <file:function> — <what goes wrong>

Indirect impact (callers of affected code):
  - <file:function> calls <affected> → may see <effect>
  - <file:function> calls <affected> → may see <effect>

Data impact:
  - <table/collection> — could have <inconsistent state>
  - <cache key> — could serve <stale data>

User-facing impact:
  - <feature/screen> — user sees <wrong behavior>
  - <API endpoint> — returns <wrong response>

Behavior Matrix impact:
  - <BM.AS-NNN.surface> — <broken state/viewer/surface behavior>
  - <GAP-NNN or NO_CELL> — <spec hole exposed by bug>

Impact scope: ISOLATED | MODULE | CROSS-MODULE | SYSTEM-WIDE
```

### 5.3 — Similar Risk Scan (skip if ISOLATED + unique pattern)

**Skip if:** bug is ISOLATED AND the code pattern is unique to this location
(not a repeated idiom). Note: "scan skipped — pattern unique to this location."

**Run if:** the bug pattern could plausibly exist elsewhere (e.g., missing null check
on API response, unguarded concurrent access, cache not invalidated after write).

Grep for the same pattern elsewhere. Timebox: 5 minutes max.

```bash
# Example: if bug is a missing null check on API response
grep -rn "\.data\." --include="*.ts" . | grep -v "?\.data\.\|\.data &&\|\.data !=\|\.data !=="
# → finds other places accessing .data without null check
```

**Beyond grep — think at design level:**
- Same abstraction used elsewhere? (e.g., other repositories using same base class)
- Same API contract reused? (e.g., other endpoints making same assumption about response shape)
- Same concurrency pattern repeated? (e.g., other handlers doing read-modify-write without lock)
- Same cache pattern? (e.g., other services writing without invalidation)

Grep catches syntax-level repetition. Design-level thinking catches same-class-of-bug
in different code that looks nothing alike syntactically.

Record findings:
```
SIMILAR RISK
═══════════════════════════
Same pattern found at:
  - <file:line> — <description>
  - <file:line> — <description>
  - (none found — pattern is unique to this location)

Scan scope: <what was searched, what pattern>
Timebox: 5 minutes (do not let this block the report)
```

---

## Phase 6: Recommend Next Steps

Based on the investigation, recommend specific actions.

```
RECOMMENDED ACTIONS
═══════════════════════════

1. [CRITICAL] <action — specific file, specific change>
   Reason: <why this is needed>
   Estimated scope: <N files, complexity LOW/MEDIUM/HIGH>

2. [HIGH] <action>
   Reason: ...

3. [MEDIUM] <action>
   Reason: ...

Test strategy:
  - Regression test: <what to test, at what level (unit/integration)>
  - Behavior Matrix regression: <BM.AS-NNN.surface test name, or "spec gap before test">
  - Existing tests to verify: <list test names that should still pass>
  - Manual verification: <what to check visually, if applicable>

Suggested fix approach:
  □ Minimal fix (patch the specific bug) — use when blast radius is ISOLATED
  □ Targeted refactor (fix pattern across affected module) — use when SIMILAR RISK has 3+ hits
  □ Architectural fix (redesign the interaction) — use when root cause is structural

→ To fix: run `/sp-fix <paste root cause summary>`
```

---

## Output: Investigation Report

**Omit empty sections.** If a section has no meaningful content for this investigation,
leave it out entirely. A 5-section report for a simple bug is better than a 12-section
report with 7 empty sections.

```
INVESTIGATION REPORT
════════════════════════════════════════════════════════════════

Target:          <what was investigated>
Date:            <date>
Status:          ROOT_CAUSE_FOUND | PROBABLE_CAUSE | INSUFFICIENT_EVIDENCE | BLOCKED

─── SUMMARY ───
<2-3 sentences: what's wrong, why, and what to do about it>

─── SYMPTOM ───
Expected: <what should happen>
Actual:   <what happens instead>
Frequency: <always / intermittent / under specific conditions>

─── ROOT CAUSE ───
HYPOTHESIS A (PRIMARY — <confidence>)
  Location:     <file:line>
  Mechanism:    <what is wrong>
  Chain:        <cause> → <step> → ... → <symptom>
  Behavior Matrix:
    State/status: <state or transition>
    Viewer/role:  <viewer/relationship>
    Surface/path: <surface>
    Cell:         BM.AS-NNN.<surface> | GAP-NNN | N/A:<reason> | NO_CELL
    Spec gap:     none | gap-open | suspicious-N/A | missing-cell
  Invariant:    <matched invariant | new invariant candidate | none>
  Evidence:
    - <file:line> — <what this code shows>
    - <git commit> — <what this change reveals>
    - <log/output> — <what this data proves>
  Disproof:     <what would prove this wrong>

(HYPOTHESIS B if applicable)

─── POTENTIAL GAPS ───
Risks discovered during investigation that may not be the root cause of THIS bug,
but represent risks for future bugs:

- <file:line> — Missing guard/validation: <what's unprotected>
- <file:line> — Assumption not enforced: <what assumption could break>
- <file:function> — No test coverage for: <path/branch>
- <file:function> — Fragile pattern: <why this could easily break again>
- (none discovered — investigation scope was clean)

These are inputs for refactor/tech-debt decisions, not immediate fixes.

─── REGRESSION? ───
<Yes — commit <hash> introduced this on <date> | No — pre-existing | Unknown>

─── RECURRING? ───
<Yes — N fix commits in this area in last M months. Architectural smell suspected.
 Pattern: <what keeps breaking> | No — first known bug in this area>

─── BUG PATH ───
(omit if ISOLATED)
<Bug Path Diagram from Phase 5.1>

─── BLAST RADIUS ───
Scope: <ISOLATED | MODULE | CROSS-MODULE | SYSTEM-WIDE>
<Impact details from Phase 5.2>

─── BEHAVIOR MATRIX IMPACT ───
Cells:
  - <BM.AS-NNN.surface> — <affected behavior>
  - <GAP-NNN / NO_CELL> — <spec hole if found>
State/viewer/surface class: <lifecycle | viewer-parity | surface-parity | cascade | external-down | other>
Spec action needed: <none | resolve GAP | add matrix cell | correct suspicious N/A | update AS wording>
Invariant action needed: <none | add/update invariant: ...>

─── SIMILAR RISK ───
(omit if scan skipped)
<Findings from Phase 5.3>

─── RECOMMENDED ACTIONS ───
<From Phase 6>

─── OPEN QUESTIONS ───
(omit if investigation is complete)
<Anything that couldn't be determined from code alone>
  - <question — what additional info would help>
  - <question — what test/experiment would clarify>

════════════════════════════════════════════════════════════════
```

---

## Handoff File

After producing the report, write it to `docs/investigate/<slug>-$(date +%Y-%m-%d).md` so `/sp-fix` can auto-detect it and skip redundant discovery.

- `<slug>` = kebab-case of the bug subject (e.g. `order-cancel-500`, `login-redirect-loop`)
- If a file for the same slug+date already exists → append `-NN` suffix (`...-2026-04-21-02.md`)
- The file contains the full Investigation Report block above, no wrapping prose
- Mention the path at the end of the chat response so the user can open it

Writing this file is the ONLY write operation this skill performs — it is output, not a code change. If `docs/investigate/` does not exist, create it.

After writing, signal handoff:

```
⚠️ Ready to fix — run `/sp-fix docs/investigate/<slug>-<date>.md`
(or paste root cause summary directly if you prefer to skip the file)
```

---

## Rules

1. **Read only for code.** Never modify source code, tests, configs, or any file outside `docs/investigate/`. The investigation report file is the single allowed write.
2. **Evidence over intuition.** Every claim in the report must reference specific code (file:line) or data (git commit, log output).
3. **Specific over vague.** "The cache isn't invalidated after write at storage.rs:142" not "there might be a cache issue".
4. **Complete the chain.** Root cause → intermediate steps → symptom. No gaps. If there's a gap, say so.
5. **Honest confidence.** LOW means LOW. Don't inflate to get past Phase 4. INSUFFICIENT_EVIDENCE is a valid outcome.
6. **Timebox.** If after 15 minutes of investigation you can't form a MEDIUM+ hypothesis → report INSUFFICIENT_EVIDENCE with everything gathered so far. Don't spin.
7. **One investigation, one report.** If `$ARGUMENTS` describes multiple bugs, investigate the most severe first. Mention others in OPEN QUESTIONS.

**Red flags — slow down:**
- Jumping to a hypothesis before tracing the data flow — you're guessing
- "It's probably X" without file:line evidence — investigate more
- Confirming your theory instead of trying to disprove it — confirmation bias
- Spending 10+ minutes on similar-risk scan — timebox and move on
