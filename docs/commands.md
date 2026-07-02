# Commands Reference

Full per-skill behaviour (phases, rules, outputs). For the one-line overview and when-to-use, see the [command table in the README](../README.md#commands).

[← Back to README](../README.md)


### /sp-explore — Feature Discovery as Client Technical Lead

**Usage:**
```
/sp-explore "cancel order request"
/sp-explore "user notification preferences"
```

**When to use:** Requirements are unclear, you're debating between approaches, or you want to clarify a feature deeply before committing to a spec. Runs before `/sp-plan`.

**How it works:**

1. **Phase 0: Codebase scan** — Silently checks for existing code, related specs, and existing explore docs before asking anything.
2. **Phase 1: Why, not what** — Asks what problem requires this feature, who faces it, and how they handle it today. Prevents building the wrong thing.
3. **Phase 2: Desired behavior** — Walks through the flow step by step, identifies trigger and final result, checks for multi-role approval chains.
4. **Phase 2.5: UI/UX expectation** — Clarifies interface type (table, form, wizard, dashboard). Offers sensible defaults when the client is unsure. Suggests simpler approaches when expectations are complex.
5. **Phase 3: Boundaries** — Impact on existing screens, data changes, migration needs, out of scope, permissions.
6. **Phase 3.5: Scope optimization** — Identifies what can ship fast vs what can defer to phase 2.
7. **Phase 4: Business rules & validation** — Conditions, formulas (with real numbers), input validation, notifications, time constraints, concurrency.
8. **Phase 5: Edge cases** — Empty states, error messages, double submit, network loss, limits, sensitive data, domain-specific cases (payment double-charge, booking overbooking, etc.).
9. **Phase 6: Scenario confirmation** — Presents concrete happy path + unhappy paths with fake data. Confirms with user before proceeding.
10. **Phase 7: Handoff summary** — Compiles everything into a structured doc, confirms with user, writes to `docs/explore/<feature>.md`.

**Output:** `docs/explore/<feature>.md` — auto-detected by `/sp-plan`, which skips redundant discovery and maps explore findings directly to spec sections.

**Token cost:** 10–20k

---

### /sp-scaffold — Greenfield Project Bootstrap

**Usage:**
```
/sp-scaffold                                # bootstrap from the Bootstrap Brief in docs/explore/
/sp-scaffold "Next.js + Nest pnpm monorepo" # standalone: gather app-type/stack itself
```

**When to use:** A brand-new project with no runnable codebase yet. Runs between `/sp-explore` (greenfield branch) and `/sp-plan`: `sp-explore → sp-scaffold → sp-plan → sp-build`. Skip if a runnable project already exists — go straight to `/sp-plan`. `/sp-build`'s Foundation Gate refuses to start the TDD loop until this has produced a runnable harness.

**How it works:**

1. **Precondition** — confirms greenfield; resumes a partial repo without clobbering user files.
2. **App-type + stack** — taken from the Bootstrap Brief (or asked); never silently defaulted; **current versions researched**, not recalled from training memory. Optional layered stack profiles (`./.claude/` > `~/.claude/` > kit seed) supply opinionated defaults; the Brief always wins.
3. **Skeleton (generator-first)** — official `create-*` CLIs give real pinned deps (defends against hallucinated/typosquatted packages); monorepos orchestrated root-first; imposes `core/` + `modules/` + co-located tests; seeds ONE module that **demonstrates the architecture pattern** (the template every feature copies).
4. **Smoke gate (non-negotiable)** — `install → build → start/smoke` must be GREEN, with ≥1 real passing test (this resolves `TEST_CMD` for `/sp-build`). Not green → BLOCKED; never a half-scaffold.
5. **Docs** — fills `ARCHITECTURE.md` (codemap + invariants), one ADR per major stack choice, optional `DESIGN.md`.
6. **Hygiene & handoff** — secret scan, `.gitignore`, `.env.example`; reports the resolved `TEST_CMD`.

**Output:** a runnable walking skeleton + canonical docs. Thin by design — features come later via `/sp-plan` → `/sp-build`.

**Token cost:** 15–40k + real install/build time (heavier than other skills — it runs generators and builds).

---

### /sp-plan — Generate Spec with Acceptance Scenarios

**Usage:**
```
/sp-plan "user authentication with OAuth2"                          # Mode A: new spec from description
/sp-plan docs/specs/auth/auth.md                                    # Mode B: add scenarios to existing spec
/sp-plan docs/specs/auth/auth.md "add password reset flow"          # Mode C: update existing spec
```

**Modes:**
- **Mode A** — Creates a new spec with stories and acceptance scenarios from your description.
- **Mode B** — Reads an existing spec that has no acceptance scenarios yet, adds them.
- **Mode C** — Updates an existing spec: creates a snapshot before Major changes, shows a change report, waits for confirmation, then applies.

**How it works:**

1. **Phase 0: Codebase Awareness** — Scans existing code, `docs/specs/`, and project patterns before planning. Prevents specs that conflict with existing implementations.
2. **Phase 1: Scope & Split + Scope Challenge** — Evaluates feature size (>7 stories or >20 AS → must split). When a feature is large, applies **Sizing & Phasing**: Phase 1 (minimum viable — smallest slice with value), Phase 2 (core experience — happy path), Phase 3 (edge cases, polish), Phase 4 (optimization, monitoring) — each phase mergeable independently. Also runs a **Scope Challenge** before drafting: checks for existing code that already solves sub-problems (reuse vs rebuild), flags complexity smells (8+ files or 2+ new classes/services), searches for framework built-ins, checks for distribution needs (new artifact → CI/CD in scope?), and applies the Completeness Principle (complete version costs only `CC: ≤15m` more → recommend it directly).
3. **Phase 2: Draft Spec** — Generates a structured spec with stories and acceptance scenarios (Given/When/Then). Depth scales by priority: P0 gets full GWT + test data, P1 gets GWT, P2 gets 1-2 line descriptions. Runs consistency checks (CC1-CC6) before showing draft.
4. **Phase 3: Clarify Ambiguities** — Systematically finds gaps across behavioral, data, auth, non-functional, integration, and concurrency dimensions. Questions include `(human: ~X / CC: ~Y)` effort scales and `Completeness: X/10` scores for each option.
5. **Phase 4: Summary** — Shows story counts, AS counts, implementation order, next steps. Every spec also gets a **"What Already Exists"** section (existing code that partially solves the problem) and a **"Not in Scope"** section (deferred work with rationale — prevents work from silently dropping).

**Mode C (Update) adds:**
- **Classification** — Walks through M1-M6 checklist to determine Major vs Minor change.
- **Snapshot** — Major changes trigger an automatic snapshot (`cp`, bit-perfect) before editing.
- **Change report** — Shows what will change, waits for user confirmation.
- **Consistency check** — Runs CC1-CC6 after every update.

**Traceability IDs:**
- `S-NNN` — Stories (with priority P0/P1/P2)
- `AS-NNN` — Acceptance Scenarios (Given/When/Then, embedded in stories)
- `FR-NNN` — Functional Requirements (if needed)
- `SC-NNN` — Success Criteria (if needed)
- IDs are immutable — deleted IDs are never reused.

**Directory structure:**
```
docs/specs/<feature>/
  <feature>.md              # single source of truth — always read this file
  snapshots/                # version history (managed by sp-plan, not developers)
    YYYY-MM-DD.md
    YYYY-MM-DD-<REF>.md
```

**Output:**
- Spec with acceptance scenarios: `docs/specs/<feature>/<feature>.md`
- (Optional) Scannable HTML view: `docs/specs/<feature>/<feature>.html` — generated by running `/sp-spec-render <feature>` after `/sp-plan`. `/sp-plan` suggests the command at the end of Phase 4 and Mode C but does not invoke it. Source `.md` remains canonical; HTML is regenerable.

### /sp-spec-render — Render Spec as HTML View

**Usage:**
```
/sp-spec-render <feature>                              # render by feature slug
/sp-spec-render docs/specs/auth/auth.md                # render specific spec
/sp-spec-render docs/specs/billing/                    # render spec dir
/sp-spec-render --all                                  # bulk re-render all specs
/sp-spec-render                                        # list + prompt
```

**When to use:** Decoupled from `/sp-plan` — you invoke it explicitly when you want the HTML view. `/sp-plan` writes the spec markdown and ends; it suggests `/sp-spec-render` at the end of Phase 4 and Mode C but never calls it automatically. Run it:
- After `/sp-plan` to generate the initial HTML view (sidebar TOC, story cards, collapsible AS)
- After a Mode C update to refresh a now-stale `.html`
- After fixing a typo directly in `<feature>.md` (no spec semantics changed, but HTML is stale)
- For specs written before this skill existed
- Bulk (`--all`) after changing `template.html` or `components.md`

**How it works:**

1. Reads `docs/specs/<feature>/<feature>.md` (+ sub-specs if multi-spec).
2. Reads `template.html` + `components.md` (cached, not regenerated each call).
3. Parses spec: frontmatter, stories with priority badges, acceptance scenarios (Given/When/Then), constraints, change log, snapshots.
4. Builds the HTML buffer in-memory using component snippets — copy verbatim, fill content. AI never writes CSS or component markup from scratch.
5. Writes `<feature>.html` next to `<feature>.md` in one Write call.

**Output features (the rendered HTML):**

- Sticky top bar: doc type + feature name + version + last-updated + counts (specs / stories / AS) + status pill (Active/Draft/Deprecated)
- Mandatory TL;DR card immediately after the title
- Sidebar TOC with scroll-spy + search filter, grouped by sub-spec (multi-spec) or by section (single)
- Story cards with priority badge (P0/P1/P2) + AS count badge
- AS as collapsible details (first AS of each story open by default), with Given/When/Then grid
- Constraint callouts (warning style), grouped per sub-spec for large specs
- Change Log and Snapshots collapsed by default
- Dark/light/auto theme toggle (system preference honored)
- Print stylesheet (sidebar hidden, all details expanded, page-break-aware)
- Self-contained: zero external dependencies, no CDN, opens offline

**Source remains truth:**
- `.md` is canonical. Edit `.md` via `/sp-plan`; regenerate `.html` via this skill.
- Never hand-edit the `.html`. Re-rendering is idempotent — run `/sp-spec-render` any time you want the HTML to catch up with the `.md`.

**Token cost:** 3–8k (template + components cached; output ≈ source markdown × 1.2 — no CSS/JS in output token stream).

### /sp-md-render — Render Any Markdown as HTML View

Generic counterpart to `/sp-spec-render`. Same template/component architecture, but for arbitrary long-form markdown with no fixed schema — investigation reports, explore docs, RFCs, retros, design notes, READMEs.

**Usage:**
```
/sp-md-render docs/investigate/payment-bug-2026-05-16.md   # render next to source
/sp-md-render <file.md> --out report.html                  # custom output path
/sp-md-render docs/notes/                                   # list + prompt
/sp-md-render                                                # prompt for path
```

**When to use:** Any non-spec markdown you want as a scannable, shareable single HTML file. It refuses spec files (heading `### S-NNN:`) and points you to `/sp-spec-render` instead.

**How it works:** Reads source + `template.html` + `components.md`, then uses an *analyzer pattern* (not fixed parsing) — each markdown chunk is mapped to the best component: numbered actions → step cards, GFM admonitions → callouts, ` ```mermaid ` → diagrams, pros/cons → compare cards, long appendices → collapsible. Builds the buffer in-memory, writes once.

**Output features:** sidebar TOC + scroll-spy + search, anchored headings with copy-link, code blocks with copy button + language label, Mermaid diagrams (CDN), 4-variant callouts (note/tip/warn/danger), step cards, compare cards, task lists, footnotes, figure+caption, dark/light/auto theme, scroll progress bar, mobile drawer, print stylesheet. Self-contained (only Mermaid loads from CDN).

**Token cost:** 3–8k (template + components cached; output ≈ source markdown × 1.2 — no CSS/JS in output token stream).

### /sp-challenge — Adversarial Plan Review

**Usage:**
```
/sp-challenge docs/specs/auth/auth.md   # challenge a spec
/sp-challenge "user authentication"     # challenge by feature name
```

**How it works (7 phases):**

1. **Read & Map** — Reads the spec (including acceptance scenarios) and maps: decisions made, assumptions (stated AND implied), dependencies, scope boundaries, risk acknowledgments, story-AS consistency.
2. **Scale Reviewers** — Assesses complexity and selects reviewers:

   | Complexity | Signals | Reviewers |
   |------------|---------|-----------|
   | Simple | 1 spec section, <20 acceptance scenarios, no auth/data | 2 |
   | Standard | Multiple sections, auth or data involved | 3 |
   | Complex | Multiple integrations, concurrency, migrations, 6+ phases | 4 |

3. **Spawn Reviewers** — Launches parallel subagents, each with an adversarial lens:

   - **Security Adversary**
     - OWASP Top 10
     - Injection vectors
     - Auth/authz bypass
     - Crypto issues
     - Data exposure
     - Supply chain risks

   - **Failure Mode Analyst** — *"Everything that can go wrong, will — simultaneously, at 3 AM, during peak traffic"*
     - Partial failures
     - Concurrency & race conditions
     - Cascading failures
     - Recovery paths
     - Idempotency
     - Observability gaps

   - **Assumption Destroyer** — *"'It should work' is not evidence"*
     - Unverified claims
     - Scale assumptions
     - Environment differences
     - Integration contracts
     - Data shape assumptions
     - Timing dependencies
     - Hidden dependencies

   - **Scope & YAGNI Critic** — *"The best code is no code. The best feature is the one you didn't build"*
     - Over-engineering
     - Premature abstraction
     - Missing MVP cuts
     - Gold plating
     - Simpler alternatives

4. **Deduplicate & Rate** — Collects all findings, removes duplicates, rates severity using a Likelihood x Impact matrix. Caps at 15 findings: keeps all Critical, top High by specificity, notes how many Medium were dropped. Each reviewer is limited to top 7 findings.

5. **Adjudicate** — Evaluates each finding: Accept (valid flaw, plan should change) or Reject (false positive, acceptable risk, already handled). 1-sentence rationale for each.

6. **User Choice** — Two modes: "Apply all accepted" (fast) or "Review each" (walk through one by one).

7. **Apply** — Surgical edits only to accepted findings. Doesn't rewrite surrounding sections.

**Finding format:** Each finding includes Title, Severity, **Confidence score** (9-10 = verified; 7-8 = strong match; 5-6 = note caveat; ≤4 = omit unless Critical), Location, Flaw description, Evidence (direct quote from the plan), step-by-step Failure scenario, and Suggested fix.

**6 non-negotiable rules:**
1. Spawn reviewers in parallel (not sequential)
2. Reviewers read files directly, not summarized content
3. Be hostile — no praise, no softening
4. Every finding must quote the plan directly as evidence
5. Quality over quantity — 3 honest findings > 15 padded ones
6. Skip style/formatting — substance only

**When to use:**
- After `/sp-plan`, before coding — for complex features
- Features involving auth, payments, data pipelines, multi-service integration
- NOT needed for simple CRUD, small bug fixes, or trivial features

**Token cost:** 15-30k (uses parallel subagents, doesn't bloat main context)

### /sp-build — TDD Delivery Loop

**Usage:**
```
/sp-build                              # build all changes vs base branch
/sp-build src/api/users.ts             # build specific file
/sp-build "user authentication"        # build specific feature
```

**How it works:**

1. **Phase 0: Build Context** — Finds changed files vs base branch, reads the spec (acceptance scenarios in `## Stories` section are the roadmap), checks `docs/specs/<feature>/.build-progress` to resume from a previous interrupted session, reads existing tests for patterns, fixtures, and naming conventions. Doesn't duplicate what already exists.
2. **Phase 1: Decide What to Test** — Determines test scope from acceptance scenarios. Applies the **Completeness Principle**: AI writes tests ~50x faster than humans, so if full coverage costs `CC: ≤15m`, it writes complete tests without asking. Always checks 8 mandatory edge case categories: null/undefined, empty arrays/strings, invalid types, boundary values (min/max), error paths (network failures, DB errors), race conditions, large data (10k+ items), and special characters (Unicode, SQL chars).
3. **Phase 1.5: Coverage Map** — Before writing a single test, traces every code path (if/else, switch, guard, try/catch) AND user flows (double-click, stale session, navigate away mid-op). Draws an ASCII diagram marking each path as `[★★★ TESTED]`, `[★★ TESTED]`, `[★ TESTED]`, or `[GAP]`. Gaps marked `[GAP] [→E2E]` need E2E tests; `[GAP] [→EVAL]` need evals — when flagged, defines capability + regression evals before implementing and reports pass@1/pass@3. **Regression rule:** if the diff changes existing behavior with no covering test, a regression test is a CRITICAL requirement — no asking, no skipping.
4. **Phase 2: Write Tests** — Writes tests for every `[GAP]` identified in the Coverage Map. Before moving to Phase 3, verifies: all public functions have unit tests, all API endpoints have integration tests, edge cases covered, error paths tested, tests independent, assertions specific.
5. **Phase 3: Build and Run** — Compiles/typechecks first, then runs tests.
6. **Phase 4: Fix Loop** — If tests fail, fixes **test code only** (max 3 attempts, then hard stop and report). If tests expect X but code does Y, asks whether to fix production code or adjust the test — with effort scales `(human: ~X / CC: ~Y)`.
7. **Phase 5: Report** — Summary with test counts, results, coverage, files touched, and any E2E/eval gaps to follow up on.

**Rules:**
- Never changes production code without asking first
- Never deletes or weakens existing tests
- Never adds `skip`/`xit`/`@disabled` to hide failures
- Max 3 fix attempts — then stops and reports the issue

**What NOT to test:** Private/internal methods, framework behavior, trivial getters/setters, implementation details.

### /sp-investigate — Read-Only Root Cause Investigation (Optional)

**Usage:**
```
/sp-investigate "production 500s after deploy on /api/orders"
/sp-investigate "intermittent data corruption in nightly sync"
```

**When to use:** OPTIONAL branch before `/sp-fix`. Use for complex bugs, production outages, data corruption, unclear regressions, or when the user wants a diagnosis report without any code change. Skip for trivial/obvious bugs — go straight to `/sp-fix`.

**What it does NOT do:** Never edits source code, tests, or config. The only write it performs is the investigation report at `docs/investigate/<slug>-<date>.md`.

**How it works (adaptive depth, auto-scales):**

1. **Phase 1: Understand the Report** — Extract symptom, expected, actual from `$ARGUMENTS`. Asks ONE clarifying question via AskUserQuestion if required fields are missing.
2. **Phase 2: Locate** — Entry-point search (error/stack/function/feature), recurring-bug check (3+ fix commits on same pattern → architectural smell), data-flow trace, git history (regression signal).
3. **Phase 3: Pattern Match** — 12 known bug patterns (nil propagation, race, state corruption, off-by-one, type coercion, stale cache, config drift, silent error swallow, ordering/timing, resource leak, merge conflict, API contract). Skipped if Phase 2 already produced a HIGH-confidence hypothesis.
4. **Phase 4: Form Hypothesis** — Specific, testable, falsifiable. Location + mechanism + causal chain + disproof condition + confidence (HIGH/MEDIUM/LOW). 3-strike rule: if 3 hypotheses all stay below MEDIUM → escalate via AskUserQuestion.
5. **Phase 5: Map Blast Radius** — Investigation scope, bug path diagram (skipped if ISOLATED), impact scope (direct/indirect/data/user-facing), similar-risk scan (5-min timebox).
6. **Phase 6: Recommend Next Steps** — CRITICAL/HIGH/MEDIUM actions, test strategy, fix approach (minimal / targeted refactor / architectural).
7. **Output** — Writes structured Investigation Report to `docs/investigate/<slug>-<date>.md`. Signals `/sp-fix <file>` for handoff.

**Status values:** `ROOT_CAUSE_FOUND | PROBABLE_CAUSE | INSUFFICIENT_EVIDENCE | BLOCKED`

**Iron Law:** Follow evidence, never start with a theory. Every claim references file:line or git commit. INSUFFICIENT_EVIDENCE is a valid outcome — don't inflate confidence to ship a report.

**Token cost:** 8–15k

---

### /sp-fix — Test-First Bug Fix

**Usage:**
```
/sp-fix "description of the bug"
```

**How it works:**

1. **Phase 0: Investigate** — Parses the bug report, locates relevant code, checks git history, and forms a root cause hypothesis. Then draws a **Bug Path Diagram** (same `[GAP]`/`[★★ TESTED]` format as `/sp-build`) for the buggy function — if no specific `[GAP]` path can be identified, the hypothesis isn't specific enough yet.
2. **Phase 1: Write Failing Test** — **Regression rule first:** if the bug exists because the diff changed existing behavior with no test covering that path, a regression test is a CRITICAL requirement. Creates a test that reproduces the bug and **MUST fail** with current code.
3. **Phase 2: Fix** — Minimal change only. Blast radius check: if fix touches >5 files, stops and asks before editing.
4. **Phase 3: Verify** — Bug test must pass; full suite must show no new regressions.
5. **Phase 4: Root Cause Analysis** — Documents: Symptom, Root cause, Gap (why wasn't this caught earlier?), Prevention (one of: type constraint, validation, lint rule, spec update). Non-optional for serious bugs.
6. **Phase 5: Report** — Structured debug report with hypothesis, fix, evidence, and regression test reference.

**Multiple bugs:** Triages by severity, fixes one at a time, commits each separately.

### /sp-review — Pre-Merge Quality Gate

**Usage:**
```
/sp-review                            # review all changes vs base branch
/sp-review src/auth/                  # review specific directory
```

**How it works:**

1. **Phase 0: Understand Intent** — Reads commit messages, checks for related spec, expands blast radius. Also notes **what already exists**: flags if the diff rebuilds something that already exists in the codebase.
2. **Phase 1: Smart Focus** — Auto-detects what to focus on based on the diff (auth → security, SQL → injection, payments → idempotency, etc.). Spends 60% of analysis on the primary focus.
3. **Phase 2: Review** — Security, correctness, **API/Backend patterns** (unvalidated input, missing rate limiting, missing timeouts, missing CORS, error message leakage), spec-test alignment, code quality (including **diagram maintenance**: stale ASCII diagrams in comments are flagged), performance, a **Failure Mode Grid** for each new codepath (3 dimensions: test covers it? error handling exists? user sees a clear error or silent failure? — all 3 missing = Critical gap), and an **AI-generated code addendum** when reviewing AI-written changes (behavioral regressions, trust boundaries, architecture drift, model cost escalation).
4. **Phase 3: Report** — Structured report. Every finding includes a **confidence score** `(confidence: N/10)`: 9-10 = verified in code; 7-8 = strong pattern match; 5-6 = possible false positive; <5 = appendix only. Includes a **"Not in scope"** section listing deferred work with rationale.

**Proportional review:** A 5-line doc change gets a light review. A 500-line auth rewrite gets file-by-file deep analysis.

**Verdicts:** APPROVE / REQUEST CHANGES / NEEDS DISCUSSION.

**Rules:**
- At least 1 positive note — reinforces good patterns, not just problems
- Never auto-fixes code — report only
- Checks spec-test alignment: code changed → spec/acceptance scenarios/tests also changed?

### /sp-commit — Smart Git Commit

**Usage:**
```
/sp-commit
```

**How it works:**

1. **Analyze** — Scans `git status`, diff stats, and file contents in one pass.
2. **Scan for secrets** — Matches patterns: `api_key`, `token`, `password`, `secret`, `private_key`, `credential`, `auth_token`. **Hard block** — stops immediately if found, non-negotiable.
3. **Scan for debug code** — Matches: `console.log`, `debugger`, `print()`, `TODO:remove`, `HACK:`, `FIXME:temp`, `binding.pry`, `var_dump`. **Soft warn** — proceeds if you confirm.
4. **Stage files** — Stages specific files by name. Never uses `git add -A`.
5. **Generate message** — Conventional format: `type(scope): description`. Imperative tense ("add" not "added"), no period, WHAT+WHY not HOW.
6. **Commit** — Does NOT push (safe default). Ask Claude explicitly to push.

**Large diff warning:** If >10 files OR >300 lines changed, suggests splitting into smaller commits for easier review.

**Never stages:** `.env`, credentials, build artifacts, generated files, binaries >1MB.

**Breaking changes:** If the diff removes/renames a public function, export, or API endpoint, uses `feat!` or `fix!` type, or adds a `BREAKING CHANGE:` footer.

### /sp-voices — Multi-LLM Review (Optional)

**Usage:**
```
/sp-voices                              # review current diff with multi-LLM panel
/sp-voices docs/specs/auth/auth.md      # review a spec
/sp-voices src/payment/                 # review specific files
```

**When to use:** Optional second opinion *after* `/sp-review` for high-stakes changes (auth, payment, data pipelines), when `/sp-review` returns mixed-confidence findings (most at 5–7), or any time you want cross-model verification before merge. Skip for routine refactors and small CRUD.

**How it works:**

1. **Detect available LLMs** — Checks for OpenAI / Codex CLI / Gemini / Perplexity / Anthropic API / Ollama in priority order. Falls back to a self-spawned Claude sub-agent if no external LLM is available, with the limitation flagged in the report.
2. **Construct open-ended review prompts** — Same material to every voice with a light bias nudge (correctness / security / design). No structured templates, no severity scale forced on reviewers — they think freely; *we* structure the synthesis.
3. **Call voices in parallel** — 2–3 voices typically; temperature 0.3; graceful degradation if any voice fails.
4. **Synthesize** — Parses free-form responses into findings, classifies severity/category ourselves, identifies CONSENSUS (2+ voices agree → REINFORCED), UNIQUE findings (single voice → flag for verification), and DISAGREEMENTS (voices contradict → present both sides; tiebreaker for HIGH+).
5. **Output report** — Critical/High findings, disagreements, voice breakdown table, agreement rate (100% may indicate shared blind spot), blind spots (categories with 0 findings).

**Decision points** (all use `AskUserQuestion`): review type ambiguous, voice panel size for large reviews, voice unavailable, critical consensus finding, disagreement resolution, follow-up cost > $0.10, report destination.

**Rules:** Same material different lenses. Don't resolve disagreements — present both sides, human decides. Consensus ≠ correct (flag if agreement rate is 100%). Findings must be specific (`auth.ts:47` not "code could be improved").

**Token cost:** 10–30k host + external API cost (Budget: ~$0.01–0.05; Standard: ~$0.05–0.20; Premium: ~$0.20–0.50 per review).

---

### /sp-humanize — Rephrase to Human Voice

**Usage:**
```
/sp-humanize <paste plan/notes/draft>           # infer format + audience from context
/sp-humanize reply jira <notes>                  # target a specific format
/sp-humanize draft a customer email <notes>      # switch audience, hide implementation
```

**When to use:** You have a plan, bullet notes, or AI-generated draft and want it rewritten into natural, send-ready text — a PR description, release note, slack announcement, postmortem, customer reply, LinkedIn post, or plain email. Not part of the spec-first dev cycle. Skip for pure translation, summarization, or generating content from zero.

**How it works:**

1. **Infer target format** — From explicit instruction → session context → input shape → fallback to tight plain text. No fixed whitelist; uncommon or hybrid formats follow their own conventions.
2. **Infer audience** — Engineering, customer, executive, public, or mixed. Same content, phrasing shifts by reader (technical terms for engineers, outcome-focused for customers).
3. **Preserve facts** — Numbers, names, error codes, file paths, commands, URLs, commitments, and decisions are never paraphrased. Certainty is never softened ("will ship Monday" ≠ "hope to ship Monday").
4. **Strip AI tone** — Removes em-dash overuse, banned buzzwords (EN + VI), hollow openings/closings, fake enthusiasm, and "rule of three" pile-ups. Varies sentence rhythm.
5. **Return send-ready text** — The final version directly, no preamble, no explanation of edits.

**Language:** Follows the session's dominant language. Mixed Vietnamese-English is fine — technical terms stay untranslated.

**Token cost:** 2–6k, no external API.

---


### /sp-port-webui — Pixel-Faithful Web-UI Port

**Usage:**
```
/sp-port-webui <feature/component>       # e.g. datasets/card — port from the design source of truth
```

**When to use:** A canonical design exists — an HTML prototype OR a Figma frame — and the built UI must match it exactly. Instead of eyeballing, a committed engine (`references/fidelity.mjs`, run with the project's Playwright) renders both sides, walks the whole subtree, reads every node's computed style, and drives the build to a 100%-fidelity report. Web/DOM stacks only (React/Vue/Svelte/HTML) — native mobile has no `getComputedStyle` equivalent (separate skill). Optional/standalone — not part of the spec-first cycle.

**How it works:**

1. **Base preflight (gate)** — resolve the source; for Figma, probe the Figma MCP and STOP if absent (never guess). Ensure the project's Playwright + a seeded, populated build. Read prior lessons.
2. **Establish the token baseline** — discover the project's design tokens; if none exist, bootstrap them (Figma variables via MCP, or `--harvest` recurring values from a raw prototype) rather than scattering arbitraries.
3. **Map + measure** — pin the root selector per side (`--probe` to author selectors); the engine auto-walks and prints a `NODE | PROP | DESIGN | BUILT | Δ | TOKEN FIX` table + structural diff + coverage.
4. **Patch to 100%** — apply the suggested token per failing row, add missing nodes with real data (data-gap → hand off to `/sp-plan` → `/sp-build`, never invent), loop under `--watch`. Reuse existing components on the Figma path (Code Connect) instead of hand-rolling.
5. **Decision rules** — documented deviations win over the source; wrapper/depth divergence re-anchors via `nodes[]`/`self` pairs; near-token drift surfaces as a `~hint`; hover/focus states measured on demand.
6. **Tests + report** — faithful-structure unit tests green; final fidelity table + coverage + data-gaps.

**Requires:** the project's Playwright (`@playwright/test` + chromium); a Figma MCP for the Figma source. Engine has its own regression selftest (`references/fidelity.selftest.mjs`).

**Token cost:** 10–30k + browser render loop.

---


## Token Cost Guide

| Activity | Tokens | Frequency |
|----------|--------|-----------|
| `/sp-scaffold` (greenfield bootstrap) | 15–40k + install/build time | Once per new project, before the first spec |
| `/sp-build` (incremental, 1-3 files) | 5–10k | Every code chunk |
| `/sp-investigate` (complex bug) | 8–15k | OPTIONAL before /sp-fix — complex/outage only |
| `/sp-fix` (single bug) | 3–5k | As needed |
| `/sp-commit` | 2–4k | Every commit |
| `/sp-review` (diff-based) | 10–20k | Before merge |
| `/sp-plan` (new feature) | 20–40k | Start of feature |
| `/sp-challenge` (adversarial review) | 15–30k | After /sp-plan, complex features |
| `/sp-spec-render` (HTML view) | 3–8k | User-invoked after /sp-plan when HTML view wanted, or to refresh stale `.html` |
| `/sp-md-render` (HTML view, any md) | 3–8k | User-invoked for non-spec markdown — investigation, explore, RFC, retro, README |
| `/sp-voices` (multi-LLM review) | 10–30k + external API cost (~$0.01–0.50) | Optional — after /sp-review for high-stakes changes |
| Full audit (manual prompt) | 100k+ | Before release |

### Minimizing Token Usage

- **Test incrementally.** `/sp-build` after each small chunk uses 5-10k. Waiting until everything is done then running `/sp-build` on a large diff uses 50k+.
- **Use filters.** `/sp-build src/auth/login.ts` is cheaper than `/sp-build` on the whole project.
- **Skip `/sp-plan` for tiny changes.** Under 5 lines with no behavior change? Just `/sp-build` and `/sp-commit`.
- **Use `/sp-review` only before merge.** Not after every commit.

---

