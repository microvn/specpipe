# Codegen seed — machine-translate the design block (NEW components only)

For a **new** component, don't hand-code from a prose "UI Notes" list — that's where drift is born. Machine-translate the design block into a first draft in the project's components, then let the measured-diff loop (Phase 6–8) close the last gap. The seed should get you to ~80% before the first measure. Skip this for components that already exist — go straight to measure.

## From an HTML prototype block

Transform the source markup → the project's component + token classes. One-to-one, structure-preserving:

1. **Structure first.** Reproduce the exact node tree — every container, stat, chip row, footer, label. A dropped node is the #1 fidelity failure and the STRUCTURAL diff will flag it, so don't drop it now. Match the design's flex/grid layout (rows/cols/gap → flex/grid + gap utilities).
2. **`var(--x)` → the project's token class.** Look them up in the design-token file / DESIGN.md discovered in Phase 1: `var(--fg)`→`text-foreground`, `var(--muted-fg)`→`text-muted-foreground`, `var(--blue)`→`text-info`, `var(--blue-bg)`→`bg-info-soft`, `var(--border)`→`border-border`; a per-domain hue (modality/category) → the project's shared visual util, **never a hardcoded hex or gray**.
3. **px → the nearest scale token.** font-size → the type scale, radius → the radius scale, spacing → the spacing scale. No token within tolerance → an arbitrary `[Npx]` **plus a note to add the token to the baseline** (don't normalize arbitraries silently).
4. **Raw elements → the design-system primitive.** A styled `<div role="menu">` → the Dropdown primitive; a `1.5px dashed` box → the right utility/primitive; a gradient → the project's brand-gradient utility. Interactive/overlay markup (menu, dialog, select, tabs, tooltip) → the component library's primitive, not hand-rolled ARIA.
5. **gradient → the brand utility** (e.g. `bg-brand`), not an inline `linear-gradient`.

## From Figma

If the Figma MCP exposes a code channel (Dev Mode `get_code`, figma-console `figma_get_component_for_development`), generate the first draft from it — but it emits generic Tailwind/inline values, so **re-token** the output to the project's system (same rules 2–5) before measuring. Then extract the reference tree (`figma-extract.md`) and run the loop. If there's no code channel, hand-build the structure from the extracted node tree and lean harder on the diff loop.

## After seeding
Add stable `data-testid`s where the map needs selectors, wire real data/props (no fabricated content — a data-gap is a `/sp-plan` hand-off, not a placeholder), then go to Phase 6 (capture reference) → Phase 7 (measure). The seed is a draft; the numbers are the truth.
