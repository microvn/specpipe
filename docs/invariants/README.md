# Invariant Registry

This directory stores durable project invariants that should survive across
features and sessions. Entries are advisory until confirmed, and enforced only
when backed by a passing regression test.

Use this README as the schema and base knowledge for invariant handling. The
example below is not a runtime invariant for every project. Actual invariants
must live in the project being worked on under `docs/invariants/INV-*.md`.

## Status Lifecycle

- `candidate` — discovered from a bug, investigation, or repeated pattern; use
  as risk evidence only.
- `confirmed` — accepted as a real project invariant; specs should cover or
  explicitly GAP/N/A it when touched.
- `enforced` — confirmed and backed by `test_ref`; `/sp-build` must run or name
  that regression/equivalent evidence when touched.
- `retired` — no longer applies; keep provenance but do not enforce.

## Entry Schema

```yaml
---
id: INV-###
title: Short invariant name
status: candidate | confirmed | enforced | retired
component_keys:
  - component.keyword
sibling_set:
  - path/to/file.py:symbol_or_flow
shared_anchor:
  kind: function | constant | route | schema | none
  ref: path/to/file.py:symbol
rule: >
  The durable rule that must remain true.
origin_bugs: [TICKET-123]
discovered_by: "how this invariant was found"
test_ref: path/to/test.py::test_name
last_verified: YYYY-MM-DD
---
```

## Enforcement Rule

Only `status: enforced` is a build gate. `candidate` and `confirmed` entries
must not manufacture requirements by themselves; they are surfaced by
`/sp-plan`, `/sp-review`, `/sp-investigate`, and `/sp-fix` so the team can
confirm, GAP, or retire them deliberately.

## Example: Appointment Matchup Stamp

This example shows how to encode a repeated sibling-drift bug as a reusable
invariant. Copy this structure into a project's own `docs/invariants/` directory
only when the project actually has this rule.

```yaml
---
id: INV-001
title: Mọi đường tạo/sửa appointment phải stamp matchup nhất quán
status: candidate
component_keys:
  - appointment.create
  - appointment.matchup
sibling_set:
  - app/modules/agents/instances/vantage_agent/services/appointment_service.py:create_appointment
  - app/modules/agents/instances/vantage_agent/services/appointment_service.py:create_from_outreach
  - app/modules/agents/instances/vantage_agent/services/board_service.py:_create_appointment_from_meeting
shared_anchor:
  kind: function
  ref: app/modules/agents/instances/vantage_agent/services/appointment_service.py:_stamp_matchup_request
  reschedule_ref: app/modules/agents/instances/vantage_agent/services/appointment_service.py:_stamp_matchup_carry
rule: >
  Bất kỳ path nào TẠO appointment với recipient != creator PHẢI gọi
  _stamp_matchup_request. RESCHEDULE / BOOK-NEXT phải gọi
  _stamp_matchup_carry để carry-forward matchup; nếu không matchup bị reset.
origin_bugs: [VFA-310, VFA-402]
discovered_by: "ga_callers(_stamp_matchup_request) + QA VFA-402"
test_ref: tests/test_sibling_matchup_stamp_parity.py::test_all_create_paths_stamp_matchup
last_verified: 2026-06-30
---
```

Why this invariant exists: a project may have multiple sibling paths that create
the same domain object, for example modal creation, Outreach creation, and
AI-guide/meeting creation. Jira often records one broken path, while the durable
engineering rule is that every sibling path must preserve the same matchup
stamp/carry-forward behavior.

How to refresh the sibling set: run the project's available symbol tooling, for
example `ga_callers(_stamp_matchup_request)` or `git grep _stamp_matchup_request`
and filter out the function definition. If a new call-site or equivalent create
path is missing from `sibling_set`, update the entry and expand the parametrized
regression test.

Status progression for this example:

- `candidate`: evidence exists from a bug or investigation, but no accepted
  invariant/test gate exists yet.
- `confirmed`: the team accepts the rule as a real project invariant; specs
  must cover, GAP, or explicitly N/A it when touched.
- `enforced`: `test_ref` exists and passes CI; `/sp-build` treats it as a hard
  regression gate when touched.
- `retired`: the rule no longer applies; keep provenance but do not enforce.
