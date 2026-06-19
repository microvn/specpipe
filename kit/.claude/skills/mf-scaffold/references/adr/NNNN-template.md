# ADR-NNNN: <short noun-phrase title>

<!--
WHAT THIS IS: one architecture decision, captured immutably. An ADR is NOT a design doc
(that's DESIGN.md, per-feature, forward-looking) and NOT the system map (that's
ARCHITECTURE.md, living). It freezes ONE expensive-to-reverse choice — stack, storage,
auth transport, sync vs async, a boundary rule — with the forces that drove it.

WHEN TO WRITE ONE: a choice you'd want a future maintainer to understand the *why* of,
and that you can't cheaply undo. Trivial/reversible choices don't need an ADR.

IMMUTABILITY: once Status = accepted, never edit the Decision/Context. To change your mind,
write a NEW ADR and set this one's Status to "superseded by ADR-MMMM".

LOCATION & NAMING: docs/adr/NNNN-kebab-title.md, zero-padded sequential (0001, 0002…).
ADR-0001 is conventionally the meta-decision "Record architecture decisions". While the
project has ≤~6 decisions they may live inline in ARCHITECTURE.md §12 instead of here;
spill into docs/adr/ once they outgrow that.

TINY-DECISION SHORTCUT (Y-statement): for a small call, the whole ADR can be one line —
"In the context of <use case>, facing <concern>, we decided for <option> and neglected
<alternatives>, to achieve <benefit>, accepting that <trade-off>." Use the full form below
when the decision deserves the room.

FILL RULE: replace every <placeholder>. Keep the CORE four sections always; the others are
optional — delete a heading rather than leave it empty.
-->

- **Status:** proposed | accepted | deprecated | superseded by ADR-NNNN   <!-- CORE -->
- **Date:** <YYYY-MM-DD>
- **Deciders:** <names / roles>

## Context and Problem Statement   <!-- CORE -->

<!-- The forces at play — technical, product, team, time. Value-neutral: describe the
tension, don't argue the answer yet. End with the question being decided. -->

<what's pushing on this decision, and the question it raises>

## Decision Drivers

<!-- OPTIONAL. The criteria that actually matter for choosing — bullet them so the
Decision below is auditable against them. -->

- <driver / constraint>

## Considered Options

<!-- OPTIONAL but recommended for non-obvious calls. List the real candidates, including
"do nothing". One line each here; details go in Pros and Cons below. -->

- <option A>
- <option B>
- <option C — e.g. do nothing>

## Decision   <!-- CORE -->

<!-- Active voice, full sentence: "We will …". State what was chosen AND what was rejected. -->

We will <chosen option>, over <rejected options>, because <the driver that broke the tie>.

## Consequences   <!-- CORE -->

<!-- ALL of them — positive, negative, and neutral. What does this commit the system to?
What new work / risk / constraint does it create? Negatives in the same list, not hidden. -->

- **Positive:** <benefit gained>
- **Negative:** <cost / new constraint / risk accepted>
- **Neutral:** <follow-on work, things now true>

## Pros and Cons of the Options

<!-- OPTIONAL. Only when the trade-off is close enough that a reader will second-guess it.
Per option: a few good/bad points. Skip for a clear-cut decision. -->

### <option A>
- Good: <…>
- Bad: <…>

## Confirmation

<!-- OPTIONAL. How do we verify the decision is actually being followed in the code/build?
(a test, a lint rule, an architecture check, a review checklist item). -->

<how compliance is checked>

## More Information / Links

<!-- OPTIONAL. The DESIGN.md this came from, related ADRs, the ARCHITECTURE.md section it
affects, tickets, external references. -->

- <links>
