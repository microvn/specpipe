# Port lessons — best/bad practice, recurring drift, correct patterns

The reusable memory that makes `/sp-port-webui` sharper each run. **Layered, read all, project wins:**
1. this file — the bundled **seed** (read-only; overwritten by `devkit upgrade`).
2. `~/.claude/sp-port-webui/lessons.md` — **user-global** (survives upgrade; your cross-project defaults).
3. `<repo>/.specpipe/port-lessons.md` — **project** (wins for that repo).

**Loop:** Phase 0 reads all three; Phase 11 appends new lessons (default to user-global, repo-specific to the project file). **Maintainer:** periodically promote high-value lessons from user/project → this seed and ship via `devkit upgrade`.

---

## Recurring drift → correct fix
- **Prose-driven / eyeballed port → drift.** Trust only the harness numbers; never mark a red row "looks fine".
- **Hardcoded hue or gray instead of the shared visual util → modality/category colour lost.** Route per-domain colour through the project's shared util (icon + tint), never a literal hex.
- **Redesign instead of port** (dropped size-stat / chips / footer / caps-label, chip grid 3-col not 5). The STRUCTURAL diff catches missing nodes because it walks the tree — reproduce every node.
- **Selector by inline-style substring fails**: browsers/React serialize inline style with a space after the colon (`font-size: 13.5px`), so `[style*="font-size:13.5px"]` never matches. Use a stable attribute — a prototype runtime's `data-*` (DataChisel stamps `data-dc-tpl` on every templated node), or a `data-testid` you add to the build.
- **Measuring an empty/loading state** → wrong numbers. Seed a populated instance (a type×status matrix surfaces every branch, incl. empty/stub states).
- **`Geist` vs `Geist Variable` false-mismatch** → font-family normalization strips ` Variable` and quotes; if you see a phantom family diff, that's why.
- **width/height on a fluid box flagged as drift** → they reflect the container, not a token. The engine marks them advisory (`~`); don't chase them.
- **Figma serializer traps**: `letterSpacing -4` is `-4%` → `-0.04em`; `textCase`/`lineHeight.unit`/`effects`/`opacity`/gradient/`componentPropertyValues` get stripped — read `node.*` raw (see figma-extract.md).
- **50%-opacity overlay "looks blurry"** = a lie (two text engines never match pixels). Validate by number.
- **Forgot `document.fonts.ready` / unpinned viewport** → font metrics differ run-to-run. The engine awaits fonts + pins viewport/DSF; keep it that way.
- **Client-rendered prototype can't be static-parsed** (template + `var()` unresolved) — it must be rendered; the engine does this.
- **±0.5px tolerance hides a half-px cluster** (10 vs 10.5). If a "pass" still looks off, tighten `--tol 0`.

## Best practice
- **Documented deviation wins over the source**: a red row that matches an intentional override in DESIGN.md/CLAUDE.md (e.g. kebab menu vs the prototype's inline link) means the BUILD is right — don't revert it to the source. Reconcile before "fixing".
- **Accepted deviation ends the loop honestly**: a prop that can't converge for a real reason (fluid width, font hinting, dynamic length) may be accepted IF justified + reported + logged — never by silently ignoring the row or burying it in an arbitrary.
- **Wrapper offset ≠ missing nodes**: a matched-count cascade of missing+extra is a structural offset → re-anchor (`nodes[]` subtree override), don't add or delete nodes.
- **Inherited props report where they PAINT, and the fix may be on the ancestor**: `getComputedStyle` resolves inherited values (color, font-*, line-height, letter-spacing, text-*) even on nodes that don't set them. The engine only surfaces them on ink-bearing nodes (text/leaf), so a wrong ancestor value shows once at the leaf, not echoed on every wrapper. When you fix it, the real source may be an ancestor that sets the value, not the leaf that inherits it.
- **`⚠ shapes diverge` = don't trust the rows**: when the built nests a node many wrappers deeper than the design, path-pairing mispairs and the drift table is phantom. Map the nodes semantically yourself (LLM > path code) and pin explicit `nodes[]` pairs with `self: true` (element-to-element, depth-independent); then the numbers are real.
- **Baseline-first**: a needed token missing/wrong → fix `tokens.css` + `DESIGN.md` first, don't patch per-component with arbitraries.
- **`~token` hint = baseline drift, not arbitrary**: a `~text-info (ΔRGB 6)` / `~rounded-lg (off +1px)` means the design value is CLOSE to a project token but not equal — the token is stale/off, or it's a deliberate deviation. Don't blindly snap to it and don't scatter arbitrary hex; decide at the baseline (Phase 9).
- **Baseline conflict is a decision, not an override**: design value with no token that contradicts an adopted token (tile 9px vs `rounded-tile` 11px) → confirm which is canonical; fix the baseline, not the instance.
- **Data-gap ≠ invent data**: backend DTO missing a field → render the honest "—"/empty state, record it, hand to `/sp-plan` → `/sp-build`.
- **Loop to 100% AND 0 missing nodes** — a green prop table with a missing footer is not done.
- **Fan out per component/subtree** for large surfaces (one subagent each) so no context holds the whole tree; the compare stays deterministic (numbers on disk), immune to context loss.
- **New component → codegen-seed**, don't hand-type from prose.
- **Add `data-testid` on the build side** for stable pairings; pin tricky pairs via `nodes[]` overrides.

## Baseline & component reuse
- **No design tokens anywhere → establish the baseline first, don't scatter arbitraries.** Figma with variables → resolve `boundVariables` (`figma_get_variables`) → seed tokens. Token-less (raw prototype / Figma w/o variables) → `--harvest` tallies recurring values into a starter `tokens.css`; rename semantically, save, then port. Port-with-arbitraries is an acknowledged tech-debt choice, never silent.
- **100% fidelity ≠ right component.** The pixel engine can't tell a hand-rolled `<div>` from the project's real `<Button>` — they measure identical. On the Figma path, `figma_get_component_for_development(codebasePath)` flags nodes that are instances of existing components (`Buttons/Button` with variants); import and reuse them instead of reproducing markup.

## Map recipe (var/px → token)
`var(--x)` → the project's token class · px → nearest scale token (radius/type/spacing), else arbitrary `[Npx]` + add-token note · `dashed`/overlay markup → the DS primitive · gradient → brand-gradient utility · per-domain hue → shared visual util.

---

## Lessons log (appended by Phase 11)
<!-- One dated entry per lesson: `YYYY-MM-DD  <component> · symptom → correct fix`. Newest on top. -->
