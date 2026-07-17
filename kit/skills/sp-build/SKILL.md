---
name: sp-build
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
  Requires a spec from /sp-plan or equivalent — if no spec exists, run /sp-plan
  first instead of jumping into code.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion, Agent, mcp__graphatlas__*
---
TDD delivery loop — write failing tests from spec AS, implement story by story, drive to GREEN.

This SKILL.md is a **navigator only** — it decides the mode and points you at the file that carries the actual procedure. The procedure was split across four files so each run loads **only what it needs**, not the whole 900-line manual. Read this file to route yourself, then read exactly the file(s) the READ MAP sends you to — nothing more.

**Why split:** a skill body stays resident in context for the rest of the run once read. Carrying orchestration rules a worker never uses, or six verification gates a CRUD story never triggers, is pure token debt multiplied by every turn. Load-what-you-need is the whole point — do not read a file the READ MAP did not route you to.

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

   - **Auto** → you are the **controller**: read `orchestration.md` and follow it. Do NOT read `core-loop.md` yourself — your dispatched subagents do.
   - **Inline** → read `core-loop.md` and run it, looping over the in-scope stories (resume from first `pending` in `.build-progress`).

---

## READ MAP (read exactly what your role + spec need)

Files live beside this one in the skill directory. Resolve the skill dir from where you read this SKILL.md (e.g. `.claude/skills/sp-build/`, `.agents/skills/sp-build/`).

| You are… | Read | Then, only if triggered |
|----------|------|-------------------------|
| **Inline builder** (no/1 story, or user chose Inline) | `controller-prep.md` (Foundation Gate + checklist derivation), then `core-loop.md` + `test-command.md`, then `gates.md` — Phase 3/3.5/4.5/5 are **mandatory** after Phase 2, not optional | `port.md` if a story is a visual pixel-port; individual gate sub-sections inside `gates.md` fire only per their triggers below |
| **Controller** (Auto-Mode) | `orchestration.md` — A1–A7 dispatch/gate/route; `controller-prep.md` for the Foundation Gate + checklist derivation you own in A1; `test-command.md` for `TEST_CMD`; `gates.md` for the gates you run at A4/A7 | **Never** read `core-loop.md` — its build steps (Phase 0/0.5/1/1.5/2/4) are the subagent's; reading it drags ~450 unused lines into your context all run. |
| **Dispatched subagent** (one story) | `core-loop.md` + `test-command.md` — build your one story RED→GREEN | `port.md` if your story is a visual pixel-port. **Never** read `orchestration.md`, `controller-prep.md`, or `gates.md` — the controller runs those. |

**Conditional triggers — read the extra file/section ONLY when the trigger is present:**

- `gates.md` **§ Behavior Matrix gate** → only if the spec has a `## Behavior Matrix` section.
- `gates.md` **§ Constraint-Clause Falsifiability gate** → only if the story has `C-*` constraints or a reject/deny rule.
- `gates.md` **§ Core Function Model gate** → only if the spec has `## Core Function Model`.
- `gates.md` **§ Sibling Surface Map gate** → only if the spec has `## Sibling Surface Map`.
- `gates.md` **§ Invariant Registry gate** → only if the project has `docs/invariants/INV-*.md`.
- `port.md` → only if a story requires matching a canonical design source (Prototype URL / HTML prototype / Figma) 1:1 AND the stack is web/DOM.

If a trigger is absent, that section does not apply — do not read it, do not run it, do not carry it in context. A spec with no `## Behavior Matrix` never touches BM anything.

**Token discipline** (applies to every role, every turn): it is spelled out at the top of `core-loop.md` § Token Discipline. The controller applies the dispatch-side half in `orchestration.md`. Read it; it is the reason this skill was split.

---

## Signal markers (icon + label — the icon is for eye-scan, the label for grep)

Every signal the skill emits leads with one of three icons so its kind is obvious at a glance; the text label after it stays greppable.

- **🛑 `BLOCKED:`** — run halts, needs a human or `/sp-plan` (oversize story, dep cycle, unresolved failure).
- **🚩 `SPEC-SIGNAL:`** — spec is stale or incomplete; run `/sp-plan` (S1/S2 halt the run; S3 records and continues).
- **⚠️ `WARN:`** — non-fatal, already self-corrected or advisory (e.g. a wrong `parallel_safe` that was rebuilt sequentially).

Use these three only — one icon per kind, always paired with its label. Don't introduce other emoji elsewhere.

---

## Rules

1. **Behavior over implementation.** Test what code DOES, not how.
2. **Independent tests.** Each test sets up its own state, cleans up after.
3. **Spec stays upstream.** If a test reveals a spec gap (S1), signal and update the spec before adding the test. If code drifts from spec (S2), signal. If new constraint added (S3), signal.
4. **Load what you need.** Read only the files the READ MAP routes you to. Reading an untriggered file is a token-discipline violation.
