Generate spec + test plan from description or existing spec.

## Determine mode

Examine `$ARGUMENTS`:

- **Mode A — Spec exists:** Argument is a file path → read spec, generate test plan.
- **Mode B — No spec:** Argument is a description → create spec + test plan.
- **Mode C — Update:** Argument mentions "update" or existing path → read existing, update surgically.

---

## Phase 0: Codebase Awareness

Before writing anything:
1. Scan existing code in the feature area — what files, functions, types already exist?
2. Check `docs/specs/` — is there already a spec for this or a related feature?
3. Check `docs/test-plans/` — any overlap with existing plans?
4. Identify project patterns — test framework, naming conventions, directory structure.

Don't plan in a vacuum. A spec that ignores existing code creates conflicts.

---

## Phase 1: Draft the Spec (Mode B only)

Create at `docs/specs/<feature-name>.md`. Include these sections (skip any that don't apply):

- **Overview** — what, why, who. 2-3 sentences.
- **Data Model** — entities, attributes, relationships (table format)
- **Use Cases** — UC-NNN with actor, preconditions, flow, postconditions, error cases. Each use case contains:
  - **FR-NNN** (Functional Requirements) — specific behaviors the system must exhibit
  - **SC-NNN** (Success Criteria) — measurable non-functional targets (performance, limits)
- **State Machine** — states and valid transitions (if applicable)
- **Settings/Configuration** — configurable behavior and defaults
- **Constraints & Invariants** — rules that must ALWAYS hold
- **Error Handling** — how errors surface to users and are logged
- **Security Considerations** — auth, authorization, data sensitivity

Match depth to complexity. Simple CRUD = 1 paragraph overview + 3 use cases. Complex auth system = full template. Don't generate filler for sections that don't apply.

Show the draft to the user. Wait for confirmation before generating the test plan.

---

## Phase 2: Clarify Ambiguities

Before generating the test plan, scan the spec for gaps. A test plan built on a vague spec produces vague tests.

| Lens | What to look for |
|------|-----------------|
| **Behavioral gaps** | Missing user actions, undefined system responses, incomplete flows |
| **Data & persistence** | Undefined entities, missing relationships, unclear storage/lifecycle |
| **Auth & access** | Who can do what is unclear, missing role definitions |
| **Non-functional** | Vague adjectives without metrics ("fast", "secure", "scalable") — add SC-NNN with numbers |
| **Integration** | Third-party API assumptions, unstated dependencies, SLA gaps |
| **Concurrency & edge cases** | Multi-user scenarios, boundary conditions, error paths not addressed |

Identify the top 3-5 ambiguities (most impactful first). For each, ask the user a targeted question with 2-4 concrete options and a recommendation.

If the spec is clear and complete, 0 questions is valid. Don't manufacture ambiguity.

Write clarifications back into the spec under `## Clarifications — <date>`.
Then proceed to test plan generation.

---

## Phase 3: Generate the Test Plan

Read the spec. For each section, extract:
1. Use cases → at least 1 test (happy path) + 1 test (error path) each
2. State transitions → test valid AND invalid transitions
3. Constraints → test they hold under edge conditions
4. Settings → test default AND non-default values
5. Cross-cutting concerns (auth, validation) → integration-level tests

Prioritize by risk: data loss/security = P0, error handling = P1, cosmetic/rare = P2.

### Output

Write to `docs/test-plans/<feature-name>.md`:

```markdown
# Test Plan: <Feature Name>

**Spec:** docs/specs/<feature-name>.md
**Generated:** <$(date +%Y-%m-%d)>

## Test Cases

| ID | Priority | Type | UC | FR/SC | Description | Expected |
|----|----------|------|----|-------|-------------|----------|
| TC-001 | P0 | unit | UC-001 | FR-001 | Valid login returns token | 200 + JWT |
| TC-002 | P0 | unit | UC-001 | FR-002 | Wrong password returns 401 | 401 + error msg |

## Implementation Order
1. TC-001, TC-002 (no dependencies — start here)
2. TC-003+ (depend on setup from earlier tests)

## Coverage Notes
- Highest risk areas: ...
- Existing code needing modification: [file paths]
```

**Priority:** P0 = must have (blocks release), P1 = should have, P2 = nice to have.
**Type:** `unit`, `integration`, `e2e`, `snapshot`, `performance`

### What NOT to produce
- "Test that the feature works" — too vague
- 50+ test cases for simple CRUD — over-testing
- Testing implementation details — brittle
- Duplicate tests verifying same behavior

---

## Phase 4: Summary

Show: test case counts (P0/P1/P2), implementation order, estimated scope.
Next steps: "Use `/mf-test` after each chunk. For complex plans, run `/mf-challenge` first."

## Naming Convention

Spec and test plan MUST share the same filename:
```
docs/specs/<feature-name>.md       ← kebab-case, 2-3 words
docs/test-plans/<feature-name>.md  ← same name
```
- Use feature name, not module name: `user-auth.md` not `AuthService.md`
- No prefix/suffix: `user-auth.md` not `spec-user-auth.md`

**Requirement IDs** — sequential per spec:
- `UC-001` Use Case, `FR-001` Functional Requirement, `SC-001` Success Criteria, `TC-001` Test Case
- Every TC must reference at least one FR or SC for traceability.

## Rules
1. **Spec-first.** Test plan derives from spec, never from code.
2. **Codebase-aware.** Don't plan features that already exist.
3. **Actionable.** Every test case must be unambiguous enough to implement directly.
4. **Proportional.** Simple feature = simple plan. Don't over-engineer CRUD.
5. **Traceable.** Every test links to a use case. No orphan tests.
6. **Consistent names.** Spec and test plan always share the same filename.
