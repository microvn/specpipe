---
description: |
  Feature discovery as Client Technical Lead — clarify one feature deeply
  before writing spec. Asks targeted questions until requirements are concrete
  enough to hand off to /sp-plan.
  Use when asked to "explore this feature", "khám phá tính năng", "tôi muốn làm",
  "I want to build X", "scope this feature", "discovery", or "clarify requirements".
  Proactively invoke this skill (do NOT write spec directly) when the user
  describes a new feature in vague or ambiguous terms — running /sp-plan with
  unclear requirements produces unclear specs.
  Skip if the user already has detailed acceptance criteria written down.
  Hands off to /sp-plan when discovery is complete — or, for a brand-new project
  with no codebase yet, also decides app-type + stack and hands off to /sp-scaffold first.
allowed-tools: Read, Glob, Grep, Bash, AskUserQuestion, WebSearch, mcp__graphatlas__*
---

Feature discovery as Client Technical Lead. The client says "I want feature X". Your job is to ask until you understand enough to hand off to spec — nothing missing, nothing extra, nothing misunderstood.

---

## Operating principles

**Ask at most 2 questions per AskUserQuestion call. Wait for the answer before continuing.**
Each follow-up must depend on the previous answer — if two questions are truly independent, batch them in one call.

**Paraphrase before moving on.**
After any long or vague answer: "So what I understand is [X]. Is that right?" Fix misunderstandings immediately.

**Use concrete examples, not abstract questions.**
"If user A is on screen B and clicks C, what do they see?" works better than "describe the expected behavior".

**Flag contradictions and risks immediately.**
Don't wait until the end. Contradiction: "Earlier you said X, now you're saying Y — which is correct?" Risk: "⚠ This feature has a concurrency issue / requires a large migration / depends on an external service that hasn't been verified" — flag it in the current phase, not Phase 7.

**Record the reason behind every decision.**
Not just "client chose A". Write "client chose A because B — if B changes, reconsider C."

**Split features when you discover them, not at the end.**
If during discovery you realize this is 2-3 independent features → pause and propose splitting immediately.

**Good-enough mindset.** The goal is clear enough to write a spec, not perfect. If you've asked 10-15 questions and still aren't done → create a draft summary with what you have, mark the gaps as Open questions, iterate later. Don't hold the client indefinitely.

**Early stop — know when you have enough.** Stop asking when all 3 conditions are met:
1. You can write the happy path without guessing
2. Permissions and UI expectations are clear
3. No remaining ambiguity that blocks implementation (who approves? where is data stored? what is the trigger?)

Non-critical edge cases don't need to be resolved now — log them as Open questions and confirm later.

**Time budget priority.** If the session is short (client has 10-15 minutes), prioritize: scope + happy path (Phase 1-2) → permissions + UI expectation (Phase 2.5-3) → business rules (Phase 4). Edge cases (Phase 5) and scenario confirmation (Phase 6) can be done async — log as Open questions.

**Done when:** The Done checklist at the end of this document is fully checked — no unchecked items.

---

## AskUserQuestion format

All questions to the user go through the AskUserQuestion tool — never ask inline in text.

**Rules:**
- `options` is **required** — every question must have 2–4 options. There is no open-ended format.
- Each option requires both `label` and `description`.
- `header` is a chip label — **HARD LIMIT: ≤ 12 characters**. Count before submitting. "Remove/Strip" = 13 ❌. "Strip" = 5 ✓. "Rule type" = 9 ✓.
- Do NOT add an "Other" option — it is added automatically by the UI.
- For open-ended questions (free-form expected), use the most likely answers as options. The user can type freely via the automatic "Other" option.

```json
{
  "questions": [{
    "question": "<context> — <question>?",
    "header": "<≤12 chars>",  // COUNT THE CHARACTERS BEFORE USING
    "multiSelect": false,
    "options": [
      {"label": "A) [option]", "description": "[1-line implication]"},
      {"label": "B) [option]", "description": "[1-line implication]"},
      {"label": "C) [option]", "description": "[1-line implication]"}
    ]
  }]
}
```

Batch at most 2 questions in one call, only when they are truly independent (the answer to one does not affect the other).

---

## WebSearch trigger rules

Search when the model's knowledge is not reliable enough for the decision at hand:

1. **Client references an external service/product/API** ("integrate with Stripe", "like Notion") → search actual capabilities, limitations, pricing, and API availability before going deeper.
2. **Client describes a pattern you're not confident about** → search `{pattern} best practice {current year}`.
3. **Client mentions a specific library/SDK** → search current status, maintenance, and compatibility with the tech stack in CLAUDE.md.
4. **Sensitive/stealth context** → ask the user before searching. Use generic terms, not the actual product name.

*Note: {current year} = current year from system clock (`date +%Y`), never hard-coded. Ensures search results stay relevant when the skill runs next year.*

**Do NOT search for:** internal business logic, code already in the repo, core language knowledge, anything already verified by codebase scan.

---

## Phase 0a — Graphatlas probe (run once, silently)

Before any discovery step, probe whether graphatlas (GA) is connected:

1. Call `mcp__graphatlas__ga_architecture` with `max_modules: 1`.
2. Interpret:
   - Returns `modules` → **GA available.** Use `ga_*` for every code-discovery step. Grep is fallback only.
   - Error `STALE_INDEX` → call `mcp__graphatlas__ga_reindex` (mode `"full"`), retry once, then treat as available.
   - Tool not found / connection error / any other failure → **GA unavailable.** Skip every `ga_*` recommendation below and use grep/glob directly. Do not re-probe per step.
3. Record the outcome internally and carry it through the rest of the run.

---

## Phase 0 — Codebase scan (before asking the user anything)

Run silently. The client does not need to know about this step.

| # | Action | Purpose |
|---|--------|---------|
| S1 | Read `CLAUDE.md` | Project context, conventions, tech stack |
| S2 | List `docs/specs/` and `docs/explore/` | Does a spec or explore doc already exist? Any related spec? If an explore doc already exists for this feature → ask: "An explore doc already exists for this feature. Start fresh or update it?" Wait for answer before continuing. |
| S3 | **If GA available (per Phase 0a):** start with `ga_architecture` to map modules, then `ga_symbols` for each `$ARGUMENTS` keyword to resolve definitions, then `ga_file_summary` on the matched files to scope the surface. **If GA unavailable or returns empty for free-text:** grep the keywords directly. | Existing related code — how much already exists? Indexed symbol table + module map are more reliable than textual grep. |
| S4 | List related screens/routes — if GA available, use `ga_symbols` on the route/handler name then `ga_callers` to find where they are mounted; otherwise grep | Understand the system surface area |

**Fallback — if scan yields nothing useful** (no CLAUDE.md, messy codebase, graphatlas + grep both empty): skip scan results, ask the user directly at the start of Phase 1:
> "Does this feature have any existing code, or is it completely new? If it exists, where is it in the system?"

Internal classification (if scan succeeds):

- **Virgin territory:** no existing code — ask from scratch
- **Partial exist (< 50%):** some code exists — ask "extend or change current behavior?"
- **Mostly exist (≥ 50%):** nearly complete — ask "what specifically needs to change?"
- **Spec exists, not yet implemented:** read the spec — ask "is this spec still accurate, or has it changed?"
- **Already implemented:** ask "what's broken, or what behavior needs to change?"

→ This classification shapes the opening question in Phase 1.

**Project-level greenfield check (run with S1)** — distinct from "virgin territory" above (which is no code for THIS feature). If the repo has NO runnable project at all — no `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` / equivalent, no real `src/`, and CLAUDE.md has no stack filled in — there is no codebase to build on. Set **GREENFIELD PROJECT = true**: discovery must ALSO decide app-type + stack (Phase 2.6) and emit a **Bootstrap Brief** (Phase 7) so `/sp-scaffold` can stand up a runnable skeleton BEFORE `/sp-plan`. Pipeline becomes **sp-explore → /sp-scaffold → /sp-plan → /sp-build**. (Existing codebase → leave the flag false; the brief and Phase 2.6 are skipped.)

Also note the **project domain** from CLAUDE.md (payment, booking, content, healthcare, logistics...) → used for domain-specific edge cases in Phase 4.

---

## Phase 0.5 — Core Function Discovery (candidate only)

Run this after Phase 0 when the feature changes an existing operation, fixes a bug, touches state/viewer/surface behavior, or integrates with an external provider. Purpose: model the core operation before asking or planning, so later AS/GAP/BM work is driven by the actual function, entry points, seams, and contracts.

This pass produces candidates and evidence, not requirements. A candidate may become a confirmed surface/contract only after the user/spec/code evidence supports it. Do not auto-promote noisy matches into acceptance scenarios.

**Inputs:** raw symptom text, feature nouns, touched component/module, existing code hits from Phase 0, matching project-local `docs/invariants/INV-*.md` entries, and any shared anchors/constants already found.

### Core Function Model

Record the model first:

| Field | Evidence |
|---|---|
| Operation | `<create subscription / validate coupon / create appointment / send invite / etc.>` |
| Inputs | required / optional / absent inputs; identify no-op/omitted-input behavior |
| Entry points | UI/API/job/webhook/provider callback surfaces that can invoke the operation |
| Internal seams | route -> service/helper -> provider/db/cache/read-model; include injected/test seams |
| External contracts | provider/API semantics, IDs, lifecycle timing, retries, trial/deferred effects |
| State/surface axes | lifecycle/viewer/surface axes if triggered; otherwise `N/A: stateless` |
| Invariants | fail-closed, server revalidation, no-op unchanged, parity/cascade, no partial side effect |
| Unknown semantics | must become open questions/GAPs; do not guess provider behavior |

### Entry-point / sibling discovery

**Deterministic recipe:**

1. **Seed nouns and verbs:** extract 3-8 terms such as domain object (`appointment`, `invite`, `matchup`), operation (`create`, `reschedule`, `cancel`, `send`), and surface nouns (`outreach`, `modal`, `guide`, `calendar`, `queue`).
2. **Shared-anchor callers:** if a helper/constant/schema appears central, use `ga_callers` when GA is available; otherwise grep the anchor. Examples: `_stamp_*`, `*_status`, `send_*invite*`, `log_*outcome*`, `create_*`.
3. **Fuzzy sibling names:** search for parallel naming patterns: `create_from_*`, `*_from_<source>`, `send_*invite*`, `*_outcome*`, `reschedule*`, `book_next*`, `cancel*`, `delete*`, and domain-specific verbs from Phase 0.
4. **Git change-coupling:** inspect recent co-change around seed files with `git log --name-only -- <seed-file>` and look for files/functions repeatedly changed with the seed. This is recall-oriented evidence, not proof.
5. **GA blast radius if available:** use `ga_impact` for touched symbols/files to find connected blast radius, but do not treat importers-only output as complete sibling discovery. Siblings may be co-changed or share anchors without importing each other.

Record every plausible entry point / sibling in a table:

| Candidate | Operation | Evidence | Confidence | Obligation |
|---|---|---|---|---|
| `<surface/path/symbol>` | same create/update/delete/send/read op? | `ga_callers` / grep / co-change / invariant / user text | high / medium / low | cover / GAP / ignore(reason) |

Rules:

- `high`: direct shared anchor, explicit invariant sibling, or same operation named in user/spec text.
- `medium`: strong fuzzy naming or repeated co-change with the seed.
- `low`: weak name similarity only.
- `cover`: candidate is confirmed in current scope and must feed `/sp-plan` surfaces.
- `GAP`: candidate seems material but expected behavior/scope is unknown.
- `ignore(reason)`: candidate is false positive or intentionally out of scope.

Exit condition: the Core Function Model is filled for every triggered field, and every high/medium entry-point candidate has `cover`, `GAP-NNN`, or `ignore(reason)`. Low-confidence candidates can be listed as notes and do not block handoff.

---

## Phase 1 — Why, not what

**If Phase 0 found existing code > 30%:**
Use AskUserQuestion:

```json
{
  "questions": [{
    "question": "This feature already has [brief description of what exists]. What do you want to do with it?",
    "header": "Existing",
    "multiSelect": false,
    "options": [
      {"label": "A) Change behavior", "description": "Something isn't working right"},
      {"label": "B) Extend it", "description": "Add new functionality to what's already there"},
      {"label": "C) Rebuild from scratch", "description": "Start fresh with a different approach"}
    ]
  }]
}
```

Wait for the answer. It changes the entire direction of the conversation.

**If virgin territory or spec not yet implemented:**
Use AskUserQuestion:

```json
{
  "questions": [{
    "question": "What specific problem is happening that requires this feature? Who is experiencing it, in which flow, at which step?",
    "header": "Problem",
    "multiSelect": false,
    "options": [
      {"label": "Users are blocked", "description": "A specific role hits a blocker in an existing flow"},
      {"label": "Manual workaround", "description": "Users do something manually that should be automated"},
      {"label": "Missing capability", "description": "Something can't be done at all today"}
    ]
  }]
}
```

Wait for the answer. Then depending on context:

**If the answer is vague ("users need to export PDF")** → push for specificity with AskUserQuestion:

```json
{
  "questions": [{
    "question": "More specifically: what is the user trying to do and where are they stuck? How are they handling it today — workaround, manually, asking an admin, or they simply can't do it?",
    "header": "Specifics",
    "multiSelect": false,
    "options": [
      {"label": "Manual workaround", "description": "User does it by hand each time"},
      {"label": "Asks an admin", "description": "User has to escalate or request help"},
      {"label": "Can't do it at all", "description": "No workaround exists — user is fully blocked"}
    ]
  }]
}
```

**If the answer is specific enough** → paraphrase and confirm with AskUserQuestion:

```json
{
  "questions": [{
    "question": "So [user role X] is [stuck at Y] and currently handles it by [Z]. Is that right?",
    "header": "Paraphrase",
    "multiSelect": false,
    "options": [
      {"label": "Yes, correct", "description": "Understanding is accurate — proceed"},
      {"label": "Partially right", "description": "Some details need correction"},
      {"label": "Not quite", "description": "Significant misunderstanding — clarify"}
    ]
  }]
}
```

**Purpose:** Avoid building the wrong thing. "Export PDF" vs "share a report with someone who has no account" leads to completely different solutions.

---

## Phase 2 — Desired behavior

Ask:
> "Walk me through it step by step: the user opens the app, what do they want to do, where do they click, what do they see, and what is the final result?"

After the user explains:

1. **Paraphrase the full flow:**
   > "So: the user is on [screen A] → clicks [button B] → the system [does C] → the user sees [result D]. Is that right?"

2. **Identify the trigger:**
   > "Is this triggered by the user clicking something, by the system automatically (cron, webhook, event from another service), or by someone else triggering it for them?"

3. **Identify the final result:**
   > "What exactly does the user expect as the final outcome? New data appearing? A file created? A notification sent? A status change?"

Iterate the paraphrase until the user confirms it's accurate.

**Multi-role check — run immediately after getting the flow:**
> "Does this flow involve only one role, or do multiple people participate in sequence?"

If multi-role → follow up for each role:
> "After [role A] submits, who handles it next? Does [role B] approve? Does a manager review? Or is it automatic? If there's an approval chain — how many steps, who at each step, and what's the timeout if no one acts?"

Draw the cross-role flow if needed:
```
[Staff] Submit → [Manager] Approve/Reject → [System] Notify Staff → [Admin] Final review (if amount > X)
```

**Scope check — run after the full flow is clear:**
If the flow actually describes 2-3 independent features → **pause immediately:**
> "What you described is actually 3 separate things: [A], [B], [C]. A doesn't depend on B, B doesn't depend on C. These should be 3 separate specs so they can be implemented independently. Which one do you want to explore first?"

---

## Phase 2.5 — UI/UX expectation

Ask after understanding the flow, before getting into technical boundaries.

> "Do you have a mockup, wireframe, or screenshot of an app as a reference for this feature?"

**If yes:** "Send it over. I'll use it as a reference when writing the spec."

**If no:** Ask follow-up:
> "What kind of UI do you have in mind? For example: a simple data table, an input form, a multi-step wizard, drag-and-drop, a dashboard with charts, or as simple as possible?"

**If the client is unsure or says "up to you"** → offer a sensible default instead of asking more:
> "My default suggestion: a table with search + pagination, editing via modal, no animations. Simple, easy to build, scales well. Is that OK or do you want something different?"

**If the client says "as simple as possible"** → confirm:
> "Simplest means: 1 data table + 1 form, no animations, no drag-drop. Mobile responsive or desktop-only? I need this clear so the dev team doesn't improvise."

**If the client chooses a table → specific follow-up:**
> "Does the table need search/filter? Sort by which columns? Inline edit or click a row to open a form? Pagination or infinite scroll?"

**If the client chooses a form → specific follow-up:**
> "Single-step or multi-step wizard? Any conditional fields (show/hide depending on another field's value)? Save as draft or submit once only?"

**If the client references another app** ("like Notion's feature X"):
→ Trigger WebSearch: look up the actual behavior of that feature. Then paraphrase:
> "Feature X in [App] works like this: [description]. Do you want it 100% the same, or are there differences?"

**Implementation-aware suggestions.** When the client describes complex UI, proactively suggest a simpler approach if it achieves the same goal:
- Complex animations → "Would plain CSS animation or canvas be enough? If you don't need 3D or complex timelines, it's much simpler to build and maintain."
- Real-time collaboration → "Would WebSocket be necessary, or would polling every 5 seconds be enough? Polling is far simpler if data doesn't need to update instantly."
- Complex drag-and-drop → "Sortable list (reorder items) or kanban board (drag between columns)? A sortable list is 5x simpler than kanban."

**Purpose:** "Simple table" vs "interactive dashboard" is a 5x effort difference. This must be clear before writing the spec.

---

## Phase 2.6 — Greenfield: app-type & stack  _(only if GREENFIELD PROJECT, per Phase 0)_

There is no codebase yet, so before boundaries/data, decide WHAT KIND of app this is and WHICH stack — this pre-fills the **Bootstrap Brief** that `/sp-scaffold` consumes to stand up a runnable skeleton. By Phase 1–2 you know the problem and the flow; that's enough to pick a stack. Keep it light — propose sensible defaults and let the client confirm, same posture as Phase 2.5. The canonical stack-decision matrix lives in `/sp-scaffold`; here you only pin the answers.

**Research current stack first (WebSearch) — do NOT propose from training memory.** Model knowledge of versions and "current best practice" goes stale fast. Before proposing any default, search the *current* stable/LTS releases and current best practice for the candidate area — using the current year from the system clock (`date +%Y`), never a hardcoded year (so this stays correct when the skill runs next year). The proposed stack + its rationale must reflect what you find, not cutoff memory. (This is exactly the WebSearch trigger "pattern you're not confident about / specific library status" applied to the whole stack choice.)

1. **App-type** — if not already obvious from the flow, ask (one question):

```json
{"questions":[{"question":"What kind of application is this? (decides how it's scaffolded and run)","header":"App type","multiSelect":false,"options":[
  {"label":"Full-stack web","description":"Frontend + backend + DB"},
  {"label":"Backend API only","description":"Service/API, no UI in this repo"},
  {"label":"Web frontend only","description":"UI talking to an existing/external API"},
  {"label":"Other","description":"Mobile / desktop / CLI / library — specify"}]}]}
```

2. **Stack** — propose a full default stack WITH a one-line rationale per major choice, then confirm. Decide each axis that applies: language/runtime · framework · datastore (if any) · repo shape (single vs monorepo) · test runner · **architecture conventions** (state mgmt · validation · data layer · forms · UI kit · API/response shape — the patterns every feature will follow). Default heuristics: the app-type's mainstream language; a framework that has an official scaffolder; Postgres for relational; single package unless ≥2 deployable units. **Conventions:** if the project / CLAUDE.md already states house conventions, adopt them; otherwise the research step above proposes current best-practice for the stack. If the client says "up to you" → pick the defaults and state them; don't stall.

```json
{"questions":[{"question":"Proposed stack: <one-line summary>. RECOMMENDATION: <X> because <reason>. Confirm or adjust?","header":"Stack","multiSelect":false,"options":[
  {"label":"Confirm","description":"<stack> — proceed"},
  {"label":"Adjust","description":"I'll change a piece"}]}]}
```

Record every choice + its reason — this becomes the Bootstrap Brief (Phase 7). A choice without a reason is a future regret (Decision-rationale principle).

---

## Phase 3 — Boundaries

Ask in pairs — never dump everything at once:

**Pair 1 — Impact:**
> "Which existing screens or flows does this feature affect? Or is it an entirely new screen?"

**Pair 2 — Data:**
> "Will this change any existing data? Adding fields, adding tables, or changing the meaning of existing fields?"

**If there are data changes → ask about migration:**
> "Does existing data need to be migrated? For example: old records need to be backfilled with new values, old fields need format conversion, or old data needs to be cleaned up before the feature works?"

**Pair 3 — Out of scope (important):**
> "What is explicitly NOT part of this feature? Clients often say 'while we're at it, let's also do...'. I need you to confirm what's out so we can split it out."

**Pair 4 — Permissions:**
> "Who can use this feature? Who cannot — which roles are completely blocked?"

---

## Phase 3.5 — Scope optimization

Ask after scope is clear, before diving into edge case details:

> "If you needed to release quickly, what's the simplest version that still delivers value? What could be deferred to phase 2?"

**If the client wants to phase the work** → document clearly:
- Phase 1 (ship first): [items]
- Phase 2 (defer): [items]
- Dependencies between phases: [if any]

**If the client says "do it all at once"** → confirm and move on. Don't push further.

**Purpose:** A Tech Lead doesn't just understand correctly — they build the right thing at the right time. This question helps the client prioritize and avoids the situation where a large scope meets a short timeline and has to be cut mid-build.

---

## Phase 4 — Business rules & validation

**Conditions:**
> "Are there any conditions that gate this feature? For example: only allowed when status = X?"

**Formulas/calculations:**
> "Is there any calculation involved? If so, give me a concrete example with real numbers."

**Input validation:**
> "What validation rules apply to the fields the user fills in? Format (email, phone, date)? Min/max length? Allowed or forbidden special characters? Any field that must be unique?"

If the client isn't sure → offer sensible defaults:
> "If you're not sure, I'll write: email must be valid format, text max 255 chars, number must be > 0. You can confirm or adjust when reviewing the spec."

**Notifications:**
> "When a status changes, does anyone need to be notified — email, push, in-app? What's the content?"

If notifications exist → clarify template:
> "Does this notification use an existing template in the system, or does it need a new one? If new, I'll note it as a separate task or log it in Out of scope."

**Time constraints:**
> "Are there any time limits? For example: only allowed within the first 24 hours?"

**Concurrency:**
> "If two people act on the same record at the same time, how should the system handle it?"

**Non-functional requirements:**
> "A few technical questions that shape the implementation:
> 1. Scale: how many users/records does this touch at peak? (tens? thousands? millions?)
> 2. Performance SLA: any response time or processing time requirement?
> 3. Security/compliance: does this touch PII, payment data, or need an audit trail?
> 4. Availability: if this feature is down for 1 hour, what's the business impact?"

---

## Phase 5 — Edge cases

Ask in groups, still in pairs:

**Group: empty & error:**
> "If there's no data, what is displayed? For errors — is there a difference between a server timeout message and a validation error message?"

**Group: submit & network:**
> "What happens if the user clicks twice in quick succession? What happens if the connection drops mid-processing?"

**Group: limits:**
> "Are there any limits? Max items, file size, timeout, number of times an action can be performed?"

**Group: sensitivity:**
> "Does this feature touch any sensitive data — PII, payment, health data?"

**Group: external integration** (if the feature calls an external service):
> "If [service name] is down or slow, what does the user see? Is there automatic retry? Should the request be queued for later processing?"

**Group: domain-specific** — based on the project domain noted in Phase 0 (CLAUDE.md):

| Domain | Priority edge cases |
|--------|-------------------|
| Payment/Fintech | Double-charge, partial refund, currency mismatch, idempotency |
| Booking/Scheduling | Overbooking, timezone conflicts, cancellation window |
| Content/Social | Content moderation, spam, unicode/emoji handling, max length |
| Healthcare | Data retention policy, audit trail, consent withdrawal |
| E-commerce | Inventory race condition, price change mid-checkout, coupon stacking |
| Logistics | Address validation, delivery window conflicts, partial fulfillment |

If the domain is not in the table → the generic groups above are sufficient.

*Note:* This is where a Technical Lead earns their keep — asking what the client hasn't thought of. Many clients will think about these for the first time when you ask.

---

## Phase 6 — Confirm with concrete scenarios

Stop asking new questions. Write out **the happy path + at least 2 unhappy paths** with fake data, then confirm via AskUserQuestion:

**Happy path:**
> "Example: User Jane Smith, role Staff, opens Order #1234 and clicks 'Request Cancel'. System checks: status = 'Confirmed', placed 2 hours ago (< 24h) → shows a reason form → Jane types 'Ordered by mistake' → submits → order moves to 'Cancel Requested' → admin receives a notification."

**Unhappy path 1 — business rule block:**
> "User Bob opens Order #5678 (status = 'Shipped') and clicks 'Request Cancel'. What does Bob see — is the Cancel button visible, hidden entirely, or visible but disabled?"

**Unhappy path 2 — edge case:**
> "User Carol submits a cancel request but loses connection mid-way. When she reconnects, what state is the order in? Has the cancel been sent or not?"

**If multi-role flow — add a cross-role scenario:**
> "Staff A submits a cancel request. Manager B opens the approve screen, but Admin C has already rejected it. What does Manager B see?"

After presenting the scenarios, confirm via AskUserQuestion:

```json
{
  "questions": [{
    "question": "I've just described [N] scenarios for this feature. Is anything wrong or missing?",
    "header": "Scenarios",
    "multiSelect": false,
    "options": [
      {"label": "All correct", "description": "Proceed to handoff summary"},
      {"label": "Needs fixing", "description": "Point out what's wrong"},
      {"label": "Add a scenario", "description": "Describe an additional scenario to cover"}
    ]
  }]
}
```

If B or C → fix and confirm again. Do not proceed to Phase 6.5 until the user selects A.

---

## Phase 6.25 — Behavior Matrix discovery axes

Run this before the self-audit when the feature touches any state/status/stage, permissions, multiple roles/viewers, repeated read surfaces, cross-module write/read propagation, notification, feed, dashboard, calendar, or external integration.

Purpose: capture the three axes that `/sp-plan` needs to build `## Behavior Matrix`. Do not fill matrix cells here. Discovery only identifies axes, source paths, and open questions.

### Axis A — States / lifecycle

Derive from the user's flow, business rules, existing code, and scenarios:

- Explicit statuses/states/stages, including terminal states.
- Transition triggers: user action, system event, webhook, cron, retry, admin override.
- Blocked states: states where the action is hidden, disabled, rejected, or should be `N/A`.
- Timing: immediate, eventually consistent, queued, retryable, or external-service-dependent.

If any state is implied but unnamed, ask:
> "This behavior depends on record state. Which statuses should support it, and which statuses should block it?"

### Axis B — Viewers / roles / relationships

Derive from permissions, multi-role flow, ownership, assignment, and notification recipients:

- Actor roles: who can perform the write action.
- Viewer roles: who can see the result after the write.
- Relationship variants: owner vs assignee vs manager vs admin vs unrelated user vs invited participant.
- Recipient identity rules: which email/account/contact identity is authoritative when notifications/calendar/events are sent.

If the same role can be in different relationships to the record, treat those as separate viewers. Example: `trainer assigned` and `trainer unassigned` are different viewers even if both have role `trainer`.

If any viewer is implied but unnamed, ask:
> "After this change, who needs to see the updated state: actor only, assigned user, manager/admin, external participant, or everyone with list access?"

### Axis C — Surfaces / module paths

Derive from codebase scan, UI sketches, affected screens, APIs, notifications, and integrations:

- Write surfaces: page/action/form/API/webhook/cron/provider callback that can create or change the state.
- Read surfaces: list row, detail page, dashboard count, worklist/queue, feed/activity log, API list, API single-get, export/report, email, push/in-app notification, calendar/provider event, search/index, audit log.
- Module Dependency Map: for each write surface, list every read surface/module expected to reflect it.
- Existing evidence: attach file paths or route names when Phase 0 found them; mark unknown surfaces as `X / needs confirmation`.

For every material write/read pair, record:

| Write / CREATE surface | Read surface | Direction | Timing tier | Source of truth | Open question |
|------------------------|--------------|-----------|-------------|-----------------|---------------|
| `<form/API/event>` | `<list/detail/feed/...>` | write -> read | `sync` / `async` / `external-down` | DB/read model/provider/cache | `none` / question |
| `<read/API/provider>` | `<write form/action>` | read -> write | `sync` / `async` / `external-down` | DB/read model/provider/cache | `none` / question |

Use both directions when the read surface can initiate or constrain the next write. Example: a worklist row is not just read-only if it contains a reschedule/assign/cancel action.

Timing tier definitions:

- `sync` — user should see the result immediately after the transaction or page refresh.
- `async` — background worker, projection, queue, webhook, polling, or eventual consistency is expected.
- `external-down` — behavior changes when a provider/API is unavailable, delayed, or retries.

If any surface pair is unknown, ask:
> "Besides the detail page, where else must this state appear or be actionable: list, dashboard, queue/worklist, feed, API, email, calendar, or reports?"

Exit condition: the handoff has non-empty States, Viewers, and Surfaces lists for stateful features, plus at least one write/read pair for every write surface. If a list is genuinely not applicable, record `N/A` with reason.

---

## Phase 6.5 — Self-audit (blind spot sweep)

**Purpose:** Before writing the handoff summary, step back and think like a senior dev who just received this spec. What would they immediately ask? This step catches the 80% of obvious questions that phase-by-phase discovery misses because it was too focused on following the script. The more thorough this step is, the fewer surprises during implementation.

**How it works:**

1. **Silently generate a list of 5-8 questions** that a senior developer, QA engineer, or domain expert would ask within the first 5 minutes of reading this spec. Think from all 8 angles:

   | # | Angle | What to ask |
   |---|-------|-------------|
   | 1 | **Algorithm correctness** | What can go wrong with the core approach? False positives? False negatives? Race conditions? Data corruption? Off-by-one? |
   | 2 | **User safety** | What's the worst thing that happens if the feature malfunctions? Data loss? Financial loss? Security breach? Can the user undo? |
   | 3 | **Platform/environment** | What OS, hardware, permission, or dependency constraints could break this? Sandboxing? File system quirks? |
   | 4 | **Scale & performance** | What if there are 10x more items than expected? What if the operation takes 10x longer? What's the expected wait time? |
   | 5 | **Dependencies** | What external services, APIs, system features does this rely on? What if they change or are unavailable? |
   | 6 | **UI interaction conflicts** | Are there conflicting behaviors on the same element? Click, hover, drag on the same area doing 2 different things? Gesture overlap? |
   | 7 | **Lifecycle/trigger** | When does each main operation fire? On appear? On user action? On schedule? On data change? If unclear → ask. |
   | 8 | **Existing pattern fit** | This feature reuses which components/patterns from the codebase? Does each one fit the new data characteristics (range, density, format)? Which existing UI features (search, filter, sort, bulk actions) should be kept, dropped, or adapted? |

2. **Filter out** questions already answered in previous phases. Keep only the unanswered ones.

3. **If any unanswered questions remain** → ask the user via AskUserQuestion (max 2 per call, as usual). Do NOT skip this — these are the questions that would become bugs or spec rewrites later.

4. **If all questions are already answered** → proceed to Phase 7. State: "I did a blind spot check — all critical questions are already covered."

**Exit condition:** Every question from the self-audit is either answered by the user or explicitly logged as an Open question. Do not proceed to Phase 7 with unasked questions.

**Trap to avoid:** Do not generate vague questions ("have you thought about edge cases?"). Every question must be specific to THIS feature, referencing concrete details from the discovery so far.

---

## Phase 7 — Handoff summary

Compile before handing off to sp-plan:

```markdown
## Explore: <Feature Name>
_<$(date +%Y-%m-%d)>_

**Feature:** [1-line description]
**Trigger:** [user action / system event / external event]
**UI expectation:** [simple table / form / wizard / dashboard / reference: "like X in App Y"]

**Bootstrap Brief:** _(GREENFIELD PROJECT only — consumed by `/sp-scaffold`; omit entirely for a feature on an existing codebase)_
- **App-type:** [web-frontend | backend-API | full-stack | mobile | desktop | CLI | library] (+ monorepo? yes/no)
- **Stack:** language/runtime [X — why] · framework [X — why] · datastore [X | none — why] · repo shape [single | monorepo+tool — why] · test runner [X]
- **Conventions:** state mgmt [X] · validation [X] · data layer [X] · forms [X] · UI kit [X] · API/response shape [X] — the patterns the scaffold's example module demonstrates and every feature follows (from house conventions, else researched best-practice)
- **Scaffold command:** [official create-* / framework CLI / degit template, or "freeform — no blessed generator"]
- **Smoke contract:** [what "runs" means for this app-type — see /sp-scaffold Phase 3]
- **Known constraints:** [deploy target, must-use libs, anything that pins the skeleton]

**UI sketches:** _(optional — include for UI-bearing features when human visualization helps)_

[Free-form layout sketches (ASCII boxes / bullet outlines / nested lists). Each component, section, button, or surface **MUST carry an E/N/X tag**:

- `[E]` existing — already shipped, file path confirmed in codebase
- `[N]` NEW — must be built this feature
- `[X]` MISSING / unclear — placeholder, needs clarification

**UI codebase scan — required before tagging:**

*Read budget = 7. What counts:* `ga_symbols` / `ga_callers` / `ga_callees` = 0 reads. `ga_file_summary` / preview = 0.5 read. Full file read = 1 read. Hard cap 7 total.

*3-block flow (Locate → Scan & Match → Verify & Tag):*

1. **LOCATE** — anchor host page/route file(s) from the happy path's "user opens X" sentence (1–2 files).
2. **SCAN & MATCH** — build candidate list:
   - Prototype URL (rendered structure) — use for **naming/shape only**. NEVER counts as evidence for `[E]`.
   - `ga_symbols` on 3–5 keywords from happy-path nouns (GA available)
   - 1 glob `components/**/<domain>*` + 1 grep (GA unavailable). NO recursive grep over whole repo.
3. **VERIFY & TAG**:
   - `[E]` requires **file path evidence** from Verify step (`file_summary` or read). Path attached as `file:path` next to the tag. No evidence → demote to `[X]`.
   - `[N]` = no match in code AND feature requires it.
   - `[X]` discipline: (a) only after ≥1 scan step — do NOT skip straight to `[X]`; (b) if >30% of components in the sketch end up `[X]`, STOP and ask user for repo path / route name (the scan was too coarse).

*Anti-patterns* (token-greedy + accuracy-lowering):
- Full file read when `file_summary` suffices
- Exhaustive recursive grep
- Tagging `[E]` on prototype-only evidence ("the prototype shows it") — that's intended UI, not existing code
- Skipping scan and dumping unclear surfaces into `[X]`

**Example sketch (legend literally embedded):**

```
┌─ Appointments page [E] components/appointments/page.tsx ─────────┐
│  Header [E]                                                      │
│  ╔ Pending Matchups (3) [N] ════════════════════════════════╗   │
│  ║   Row: trainee + [Assign] [N]                             ║   │
│  ╚════════════════════════════════════════════════════════════╝   │
│  Tabs [E]  Filters [E]                                           │
│  Appointment cards [E] + MatchupStatusBadge [N]                  │
└──────────────────────────────────────────────────────────────────┘

Legend: [E] existing · [N] NEW · [X] MISSING / clarify
```

sp-plan reads this sketch and routes by tag:
- `[N]` → `## UI Notes` Component Tree (build targets)
- `[E]` → `## What Already Exists § UI Inventory` (reuse refs with evidence path)
- `[X]` → `## Gaps (status: open)` (unclear surfaces)

ASCII stays in explore as provenance. If sketch carries no E/N/X legend, sp-plan treats all components as `[N]` and emits a Clarification flagging the assumption.

If neither sketches nor a prototype URL exist for a UI-bearing feature → sp-plan emits `GAP-NNN (status: open)` about UI structure.]

**Happy path:**
1. [Step 1]
2. [Step 2]
3. [Final result]

**Multi-role flow:** _(if applicable)_
[Role A] → action → [Role B] → action → [System] → result
Timeout: [if role B does not act within X hours then...]

**Phasing:** _(if client chose to phase the work)_
- Phase 1 (ship first): [items]
- Phase 2 (defer): [items]
- Dependencies: [if any]

**Business rules:**
- [Condition X → behavior Y]
- [Formula: concrete example with real numbers]
- [Time constraints if any]

**Input validation:**
- [Field A: format, min/max length, unique?]
- [Field B: required?, allowed values]

**Edge cases:**
- Empty state: [what is displayed]
- Error: [server timeout → message A / validation error → message B]
- Double submit: [prevent / idempotent / show warning]
- Network loss: [retry / rollback / show state]
- Concurrent edit: [last-write-wins / lock / merge / show conflict]
- Domain-specific: [e.g. double-charge prevention, overbooking check]

**External integration:** _(if applicable)_
- Service: [name]
- Service down: [what user sees, retry?, queue?]
- Rate limit: [exists or not, how handled]

**Permissions:**
- Allowed: [role list]
- Blocked: [role list + reason]

**Notifications:** _(if applicable)_
- [Event X → notify role Y via email/push/in-app]
- Template: [use existing template "{name}" / needs new template → separate task]

**Data impact:**
- [New or changed fields/tables]
- Migration: [backfill needed / format conversion / data cleanup]

**Behavior Matrix discovery axes:** _(required for stateful / role-sensitive / multi-surface features; consumed by `/sp-plan`)_

Core Function Model: _(required when Phase 0.5 ran; consumed by `/sp-plan`)_
| Field | Evidence |
|---|---|
| Operation | [core operation being changed] |
| Inputs | [required / optional / absent inputs + no-op behavior] |
| Entry points | [UI/API/job/webhook/provider callbacks] |
| Internal seams | [route -> service/helper -> provider/db/cache/read-model; include test seam] |
| External contracts | [provider semantics / lifecycle / retries / trial/deferred effects, or N/A] |
| State/surface axes | [states/viewers/surfaces triggered, or N/A with reason] |
| Invariants | [fail-closed / server revalidation / no-op unchanged / parity/cascade / no partial side effect] |
| Unknown semantics | [open questions to become GAPs] |

Sibling Candidate Table: _(required when Phase 0.5 ran; consumed by `/sp-plan`)_
| Candidate | Operation | Evidence | Confidence | Obligation |
|---|---|---|---|---|
| [surface/path/symbol] | [same create/update/delete/send/read op?] | [ga_callers / grep / co-change / invariant / user text] | high / medium / low | cover / GAP / ignore(reason) |

Confirmed sibling surfaces for planning:
- [surface/path/symbol confirmed from candidate table, or N/A with reason]

States / lifecycle:
- [State/status/stage 1 — transition trigger, terminal? yes/no, blocked? yes/no]
- [State/status/stage 2 — transition trigger, terminal? yes/no, blocked? yes/no]

Viewers / roles / relationships:
- [Actor/viewer 1 — role + relationship to record + allowed actions]
- [Actor/viewer 2 — role + relationship to record + allowed actions]
- [Recipient identity rule if notifications/calendar exist]

Surfaces / module paths:
- Write surfaces: [form/action/API/webhook/cron/provider callback + file/route evidence if known]
- Read surfaces: [list/detail/dashboard/worklist/feed/API/email/calendar/search/audit/export + file/route evidence if known]
- Unknown surfaces: [X / needs confirmation, or N/A with reason]

CREATE/READ pair map:
| Write / CREATE surface | Read surface | Direction | Timing tier | Source of truth | Open question |
|------------------------|--------------|-----------|-------------|-----------------|---------------|
| [write surface] | [read surface] | write -> read | sync / async / external-down | DB/read model/provider/cache | none / question |
| [read/action surface] | [write surface] | read -> write | sync / async / external-down | DB/read model/provider/cache | none / question |

**Impact on existing system:**
- [Affected screens/flows + description of impact]

**Out of scope:**
- [Item 1 — reason for exclusion]
- [Item 2 — reason for exclusion]

**Decision rationale:**
- [Client chose A over B because C. If C changes → reconsider B.]
- [Client chose to hide the button instead of disabling it — didn't want users wondering why they can't click.]

**Assumptions:** _(inferred, needs explicit client confirmation)_
- [e.g. "Timezone is UTC+7 for all time constraints"]
- [e.g. "Email notification uses existing system template, no new template needed"]

**Open questions:** _(unanswered, needs follow-up)_
- [...]

**Success metrics:** _(only if client mentioned a measurable goal in Phase 1)_
- [e.g. "Reduce cancel processing time from 30 minutes to < 2 minutes"]

**Complexity signal:** [low / medium / high]
Based on: [number of new screens, data model changes, external integrations, edge case density, multi-role]

**Non-functional requirements:**
- Scale: [expected load — records, users, concurrent operations]
- Performance SLA: [response time, throughput, processing window]
- Security/compliance: [PII, payment, audit, encryption requirements]
- Domain risks: [e.g., double-charge (payment), overbooking (scheduling)]
- Availability impact: [what breaks if this feature is down]

**Technical risks:**
- [e.g. "Never integrated with service X before — needs a spike first"]
- [e.g. "Concurrent edit requires a locking strategy — no existing pattern in the codebase"]
- [e.g. "Data migration on a large table — needs time estimate"]
```

After writing the summary, confirm via AskUserQuestion:

```json
{
  "questions": [{
    "question": "Is this summary complete enough to hand off to /sp-plan?",
    "header": "Handoff",
    "multiSelect": false,
    "options": [
      {"label": "Yes, save & hand off", "description": "Write to docs/explore/; greenfield → /sp-scaffold, else → /sp-plan"},
      {"label": "Needs additions", "description": "Point out what's missing before saving"},
      {"label": "Open questions first", "description": "Work through unresolved questions first"}
    ]
  }]
}
```

If A → write to `docs/explore/<feature-slug>.md`. **If GREENFIELD PROJECT:** next step is `/sp-scaffold` (it reads the Bootstrap Brief to stand up the runnable skeleton), THEN `/sp-plan` for the first feature spec. Otherwise hand straight to `/sp-plan` — it auto-detects this file and skips redundant discovery when run on the same feature.

If B or C → resolve and confirm again.

---

## Done checklist

Self-check before writing the output file:

- [ ] Happy path described step by step — no guessing required
- [ ] At least 2 unhappy paths confirmed with the user *(can be deferred if time-boxed — log as Open questions)*
- [ ] Business rules have concrete examples with real numbers
- [ ] Input validation is clear for every user-facing field
- [ ] Permissions are clear for every relevant role
- [ ] If multi-role: cross-role flow confirmed, including timeouts and conflicts
- [ ] If Phase 0.5 ran: Core Function Model is filled with operation, inputs, entry points, seams, contracts, invariants, and unknown semantics
- [ ] If stateful / role-sensitive / multi-surface: Behavior Matrix discovery axes are filled with States, Viewers, Surfaces, and CREATE/READ pair map
- [ ] If existing-operation or bug-fix discovery ran: Sibling Candidate Table lists every high/medium candidate with cover / GAP / ignore(reason)
- [ ] UI expectation confirmed — dev team has no room to improvise
- [ ] Edge cases covered for critical paths *(can be deferred if time-boxed — log as Open questions)*
- [ ] Out of scope has at least 1 item listed
- [ ] No unresolved contradictions
- [ ] Data migration asked about (if there are data changes)
- [ ] External integration: failure/retry/queue asked about (if there is an external service)
- [ ] Assumptions listed separately from Open questions
- [ ] Decision rationale recorded for every significant choice
- [ ] Client confirmed the handoff summary
- [ ] Handoff summary is structured enough for /sp-plan to use directly without re-asking basic discovery questions
- [ ] If GREENFIELD PROJECT: app-type + stack decided with rationale; Bootstrap Brief filled for /sp-scaffold

If any item is unchecked → return to the corresponding phase and ask more — do not write the file.

---

## Traps — Common mistakes to avoid

| # | Trap | Consequence |
|---|------|-------------|
| T1 | Dumping many questions at once | Client overwhelmed, skips questions, answers get mixed up |
| T2 | Not paraphrasing after a long answer | Misunderstanding carries into the spec, caught late |
| T3 | Not asking "what is NOT in scope" | Client scope creep, spec bloat |
| T4 | Skipping Phase 0 codebase scan | Asking about a feature that's already 80% implemented |
| T5 | Not flagging contradictions and risks immediately | Contradiction/risk buried in spec, dev team guesses |
| T6 | Waiting until Phase 7 to realize it's 3 features | Wrong scope explored for the entire session |
| T7 | Writing "client chose X" without the reason | Future devs don't know why, make the wrong change during refactor |
| T8 | Only confirming the happy path | Unhappy paths found during QA, dev has to rework |
| T9 | Not asking about UI expectation | Dev builds "simple table", client expected "interactive dashboard" |
| T10 | Not asking about input validation | Dev has to ask again or guess — spec gets patched late |
| T11 | Not distinguishing assumptions from open questions | Dev treats assumptions as confirmed facts, builds the wrong thing |
| T12 | Not asking about data migration when there are data changes | Feature deployed, old data incompatible, production bug |
| T13 | Single-role flow for a multi-role feature | Spec missing approval chain, timeout handling, conflict resolution |
| T14 | Generic edge cases only, skipping domain-specific ones | Misses double-charge (payment), overbooking (scheduling) |
| T15 | Over-indexing edge cases in a short session | Runs out of time before scope and happy path are clear |
| T16 | Feature calls external service but failure handling not asked | Service goes down → blank screen, no retry, no error message |
| T17 | No phasing discussion | Large scope, short timeline, features cut mid-build with no plan |
| T18 | Only asking, never suggesting defaults when client is unsure | Client gets stuck, session drags, no decision made |
| T19 | Not suggesting a simpler approach when client's expectations are high | Spec says Three.js for a simple animation — CSS was enough; WebSocket for 5-minute data updates — polling was enough |
| T20 | Not extracting state/viewer/surface axes | `/sp-plan` has to reconstruct the matrix from prose and misses lifecycle/parity bugs |
| T21 | Listing surfaces without CREATE/READ timing | Async projections, external-down behavior, and stale read paths are left to QA to discover after code |
