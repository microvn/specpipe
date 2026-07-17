# port.md — visual pixel-port hand-off

**Who reads this:** an inline builder or dispatched subagent whose story is a **visual pixel-port**, routed here from `core-loop.md` § Phase 0.5. If your story is not a visual port, you should not be reading this file.

**A story is a visual port** — hand the fidelity half to `/sp-port-webui`, don't hand-code the surface from prose — when ALL of these hold:

1. The story requires the built UI to **match a canonical design source 1:1** (spec's `Prototype URL`, an HTML prototype path, or a Figma URL/node), not just "implement some UI".
2. The stack is **web/DOM** (React/Vue/Svelte/HTML). `sp-port-webui`'s engine reads `getComputedStyle`; native mobile (Flutter/Kotlin/Swift) has no equivalent — build those inline in `core-loop.md`.
3. The gap is **fidelity** (layout, spacing, colour, typography, structure), not behaviour.

**Split the story cleanly:**
- **`/sp-build` owns the behaviour** — the AS logic, data wiring, state, tests keyed on `AS-NNN`. Build this in `core-loop.md` to GREEN, including a structural draft of the surface.
- **`/sp-port-webui` owns the pixel fidelity** — rebuild the surface in real components, then prove the match with measured computed-style diffs instead of eyeballing.

**Typical order:** build the behaviour + a structural draft here to GREEN, then run `/sp-port-webui` to drive fidelity to 100%. If the surface is fidelity-heavy, port first then wire behaviour. Note the hand-off in the Phase 5 summary (`UI PORT: <surface> → /sp-port-webui`).

**Data-gap round-trip:** if `sp-port-webui` surfaces a data-gap (a design node needs a field the backend DTO doesn't return), that comes back to you: add the field via `/sp-plan`, then build it here.

**Auto-Mode:** a dispatched subagent CANNOT invoke `/sp-port-webui` (no skill recursion). So the controller keeps the fidelity half: it dispatches the subagent to build only the behaviour + structural draft (its AS tests), then after the story's gates pass the **controller** runs `/sp-port-webui` from its own context to drive fidelity. Never bury a "match the prototype/Figma" obligation inside a subagent — it would silently hand-code the port.

**Do NOT reach for `/sp-port-webui` when:** the story is backend-only, the UI is behaviour-only with no canonical design to match (build it inline, mark view code `[→MANUAL]` per the Coverage Map), the stack is native mobile, or the change is non-visual.
