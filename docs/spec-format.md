# Spec Format

[← Back to README](../README.md)


### Spec Template

Create specs at `docs/specs/<feature>/<feature>.md`:

```markdown
# Spec: <Feature Name>

**Created:** 2026-04-02
**Last updated:** 2026-04-02
**Status:** Draft | Active | Deprecated

## Overview
What this feature does, why it exists, who uses it. 2-3 sentences.

## Data Model
Entities, attributes, relationships (if applicable).

## Stories

### S-001: <Story name> (P0)

**Description:** [user story]
**Source:** [optional: ticket/issue ref]

**Acceptance Scenarios:**

AS-001: <short description>
- **Given:** [state]
- **When:** [action]
- **Then:** [expected]
- **Data:** [test data]

AS-002: <short description>
- **Given:** [error state]
- **When:** [action]
- **Then:** [error handling]

### S-002: <Story name> (P1)

AS-003: <short description>
- **Given:** [state]
- **When:** [action]
- **Then:** [expected]

### S-003: <Story name> (P2)

AS-004: <short description>
- [flow description + expected behavior]

## Constraints & Invariants
Rules that must always hold.

## Change Log

| Date | Change | Ref |
|------|--------|-----|
| 2026-04-02 | Initial creation | -- |
```

Skip sections that don't apply. Match depth to feature complexity.

**Acceptance Scenario depth by priority:**
- **P0:** Full Given + When + Then + Data + Setup. At least 1 happy path + 1 error path.
- **P1:** Given + When + Then. At least 1 happy path.
- **P2:** 1-2 line flow description. At least 1 scenario.

### Snapshots (Version History)

When `/sp-plan` Mode C detects a Major change (new story, removed story, priority change, flow change, behavior change for P0, or constraint change), it automatically creates a snapshot before updating:

```
docs/specs/<feature>/snapshots/
  2026-04-02.md              ← full copy at that point in time
  2026-04-05-BILL-101.md     ← with ticket reference
```

Snapshots are immutable, managed by sp-plan (not developers), and capped at 5 most recent.

### Naming Conventions
| Item | Convention | Example |
|------|-----------|---------|
| Spec directory | `docs/specs/<feature>/` | `docs/specs/user-auth/` |
| Spec file | `<feature>.md` in feature directory | `user-auth.md` |
| Story ID | `S-NNN` sequential per spec | `S-001`, `S-005` |
| Scenario ID | `AS-NNN` sequential across all stories | `AS-001`, `AS-042` |
| Priority | `P0` (critical), `P1` (important), `P2` (nice-to-have) — per story | — |
| Snapshot | `YYYY-MM-DD.md` or `YYYY-MM-DD-<REF>.md` in `snapshots/` | `2026-04-02.md` |

---

