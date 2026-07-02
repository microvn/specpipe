---
description: |
  Pixel-faithful web-UI port — rebuild a design surface (HTML prototype OR Figma) in the
  project's real components, then PROVE the match with measured computed-style diffs instead
  of eyeballing. A committed engine renders both the design and the built component, walks the
  whole subtree (container → deepest child), reads every node's full computed style, and prints
  a numeric Δ table + structural diff + token-fix per failing row. You apply the suggested
  tokens and loop until fidelity is 100% with zero missing nodes.
  Use when asked to "port this to shadcn/the design system", "make it match the prototype",
  "match Figma 1:1", "pixel-perfect this", "port UI", "port the design", "khớp prototype",
  "port từ Figma", "dựng UI đúng thiết kế", "pixel-to-pixel", or invoked via /sp-port-webui.
  Proactively invoke (do NOT hand-port from a screenshot or prose) when a canonical design
  source exists (a prototype HTML file, or a Figma URL/node) and the built UI must match it.
  Web/DOM stacks only (React/Vue/Svelte/HTML) — the engine reads getComputedStyle, which
  native mobile (Flutter/Kotlin/Swift) has no equivalent for; that is a separate skill.
  Data missing from the backend is NOT invented — it is reported as a data-gap and handed to
  /sp-plan → /sp-build. Skip for behaviour-only work (use /sp-build) or non-visual changes.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion, Agent, WebSearch, mcp__figma-console__*
---
Pixel-faithful web-UI port — measured, not eyeballed. Rebuild a design surface in the project's real components and drive it to a **100%-fidelity** report against the design source of truth.

This skill exists because prose-driven porting drifts: someone reads a spec's "UI Notes" + glances at the design and hand-codes it, and modality colours fall to gray, a card loses its size-stat / chips / footer, a chip grid goes 3-col instead of 5. The fix is to stop guessing and **measure** — compare real `getComputedStyle` numbers, node-by-node and property-by-property, between the design and the build, so every gap is a concrete, actionable row ("font-size −1px → `text-base`", "tile missing in build") with no human eyeballing and no vision model.

It is really **two things**: (A) **draft** a new component by machine-translating the design block (cut most drift up front), then (B) **measure-and-fix in a loop** until the numbers match. Everything else (screenshot CI gate, no-drift linter, vision "taste" review) is optional and out of scope for v1 — see Non-goals.

## The engine (read before running)

The measured-diff engine is `references/fidelity.mjs`, shipped **inside this skill**. It is NOT copied into projects — it runs in place and resolves the **project's** Playwright by explicit path, so a `devkit upgrade` keeps every project on the latest engine (a copied script would fork and rot). Let `SKILL_DIR` be the directory holding this SKILL.md. Invoke:

```
node "$SKILL_DIR/references/fidelity.mjs" <component-key> --project <repo-root> [--watch|--probe|--all|--cache|--reference f.json|--tol 0.5]
```

It reads a per-component **selector map** that lives in the PROJECT (`<repo>/scripts/fidelity.map.json`) — project config, versioned with the project's code. It walks both mapped subtrees from their root, reads a canonical-but-complete computed-style set (DevTools-grade; `--all` dumps the raw ~320-prop set), pairs nodes by structural position, and prints:

```
┌─ datasets/card ─────────────────────────────────────────────────────────────────
 NODE            PROP           DESIGN               BUILT                Δ      TOKEN FIX
 ✗ @modality-tile border-radius 11px                 10px                 +1px   rounded-tile
 ✗ @card-name     font-size     13.5px               12.5px               -1px   text-base
 ✗ svg            color         rgb(24,188,242)      rgb(113,113,122)     ≠      text-modality-image
└──────────────────────────────────────────────────────────────────────────────────
STRUCTURAL (node in design, missing in built):
  ✗ missing 0>4  @footer   "Attach to project" band
SUMMARY  47 design nodes · 46 measured · 1 missing · 0 extra
         1557 props checked · 1520 pass · 37 fail
         FAIL — fidelity 97.6%  (gate: 100% within ±0.5px / exact color+token, 0 missing nodes)
```

Exit code is non-zero while failing (local guide, or wire as a Playwright CI gate). `~` rows are advisory (width/height reflect layout, not tokens) and don't gate. The `TOKEN FIX` column is reverse-mapped from the **project's** design tokens (colours/shadows resolved live from the built page, scalars parsed from the token file) — never baked into the skill. An exact match → the token class; a **close-but-not-equal** token → a `~hint` (e.g. `~text-info (ΔRGB 6)` / `~rounded-lg (off +1px)`) that flags a **baseline drift** — the design value doesn't match your token (stale token, or a deliberate deviation): decide via Phase 9. Only past the threshold does it fall back to an arbitrary `[Npx]` (add the token to the baseline first).

---

## Procedure (Phase 0–11)

### Phase 0 — Base preflight (GATE — no base, no run)
1. **Resolve the source** from `$ARGUMENTS` / the request: an HTML prototype (path or URL) or **Figma** (URL + node id). Record `source: prototype | figma`.
2. **If `source=figma`, PROBE for a Figma MCP** before anything else: figma-console (`figma_get_component_for_development`, `figma_get_token_values`, `figma_execute`) or the Figma Dev Mode MCP (`get_design_context`, `get_code`, `get_variable_defs`). **None available → STOP**: "Porting from Figma needs a Figma MCP to pull node properties; none is connected." Do not guess values from a screenshot.
3. **Check the base**: Node + the project's Playwright (`@playwright/test` or `playwright`) + a chromium binary, resolvable from the repo. **Missing → AskUserQuestion for permission to install** (`npm i -D @playwright/test && npx playwright install chromium`). **Declined → STOP** — the engine cannot run without it. (Confirm the runnable dev server + a way to reach the surface authed; if the app is auth-gated, use the seeded session. Playwright Component Testing is a cleaner built-side host but supports React ≤18 only — skip it on React 19+.)
4. **Load lessons** (see Phase 11): read `references/port-lessons.md` (seed) + `~/.claude/sp-port-webui/lessons.md` (user) + `<repo>/.specpipe/port-lessons.md` (project) so this run doesn't repeat known mistakes.

### Phase 1 — Establish the design-token baseline (source of truth)
Find everything design-related: the token file (`tokens.css` / tailwind theme / `globals.css`), `DESIGN.md`, `CLAUDE.md`, project memory `*.md`, component conventions. Many candidates or conflict → **AskUserQuestion** "Which file is the real token source?". This is the basis for the reverse-map (`--tokens <css>` or map `_config.tokensCss`).

**No baseline at all?** If the project has NO design tokens, do not silently port with hardcoded arbitraries. Establish the baseline first (baseline-first), by degree of source:
- **Figma with variables** → resolve them: values carry `boundVariables` (VariableID). `figma_get_variables` / `figma_get_token_values` / `figma_export_tokens` → resolve to token names+values → seed `tokens.css` + `DESIGN.md`.
- **Token-less source (raw prototype, or Figma with no variables)** → **derive by frequency**: `node <skill>/references/fidelity.mjs <key> --project . --harvest` renders the design, tallies recurring colours/radii/type/spacing, and prints a starter `tokens.css`. Review, rename to semantic roles, save, note in `DESIGN.md`.
- Then port against the new baseline. Or, if the user chooses, port with arbitraries as **acknowledged tech-debt** (AskUserQuestion; never silent). Consider handing greenfield token setup to `/sp-scaffold` (it owns `DESIGN.md`).

### Phase 2 — App ready & seeded
Ensure the built app runs and the surface is reachable **populated** — measure a real, seeded instance, never an empty state. Seed a **type × status matrix** so every display branch renders (this also surfaces empty/stub states, e.g. an attach-dialog with no projects). Never measure placeholder/loading UI.

### Phase 3 — Locate the surface in the source
Prototype: grep by route name / `<!-- COMMENT -->` / rendered text; note that a client-rendered prototype (template engine, `var()`) must be **rendered** to resolve values — the engine does this. Figma: get the node id of the target frame/component.

### Phase 4 — Map the roots (+ setup), not every node
Create/extend the PROJECT's `scripts/fidelity.map.json` entry: `source`, the **root selector** on each side, and `setup` steps (navigate to the route, hover, seed). Run `--probe` to dump both DOM outlines and pick stable selectors — prefer a stable attribute (a prototype runtime's `data-*`, or a `data-testid` you add to the built component). The engine auto-walks the whole subtree from the root; you only pin the root. Add `nodes[]` overrides ONLY when the built markup wraps differently from the design (extra `<div>`/Slot). A plain override re-anchors a subtree (paths relative to the anchor — one wrapper); `self: true` measures just the two matched elements (depth-independent — many wrappers). When the engine prints `⚠ shapes diverge`, switch to `self` pairs you map by hand (Decision rule 3). Overrides need the rendered design (prototype path), not `--reference`/`--cache`. See `references/fidelity.map.example.json`.

### Phase 5 — Seed the draft (NEW components only)
Machine-translate the design block into the project's components instead of hand-coding from prose — see `references/codegen-seed.md` (prototype block → JSX + token classes; Figma → `get_code`, then re-token to the project's system). Existing components: skip straight to measure.

**Reuse existing components, don't hand-roll (Figma).** Before building a Figma node from scratch, check whether it's an instance of a component your codebase already has: `figma_get_component_for_development(nodeId, codebasePath: <project>/src/components)` returns `compositionDependencies` (which nodes are instances of which components, with their variants) plus a scan of your codebase. If a node maps to an existing component (e.g. a Figma `Buttons/Button` → your `<Button variant="link" size="lg">`), **import and use it**, don't reproduce it with raw markup. The measured engine can't catch this (pixels match either way) — it's a separate, real axis. Build any missing sub-component standalone first, then compose.

### Phase 6 — Capture the reference (design side)
- **prototype**: the engine renders it and captures the reference tree (add `--cache`/`--emit-reference` to render once and reuse).
- **figma**: an agent extracts the nodes via MCP into the reference-tree JSON (same schema the engine emits) — follow `references/figma-extract.md`, which lists the serializer traps (`textCase`, `letterSpacing.unit` %→em, `lineHeight.unit`, `effects`, `opacity`, gradients, `componentPropertyValues`). Pass it with `--reference`.

### Phase 7 — Measure
`node "$SKILL_DIR/references/fidelity.mjs" <key> --project <repo>` → the Δ table + STRUCTURAL + COVERAGE. Read the numbers; do not re-measure by eye.

### Phase 8 — Patch, pixel-to-pixel
**Reconcile each red row first (Decision rules below), then fix only genuine drift:** rule out a documented intentional deviation (rule 1 — don't revert it), a wrapper-offset structural cascade (rule 3 — re-anchor, don't add/remove nodes), and an acceptable non-convergent prop (rule 2 — accept + report, don't thrash). Then apply the suggested token per failing row and add missing structural nodes with **real data/props**. Work top-down (container → children) so inherited color/font cascade and clear child rows. Re-run under `--watch` for an instant fix-measure-fix loop. Drive to **100%: every non-advisory prop within tolerance (or explicitly accepted) AND zero unexplained missing nodes.**
- **Data-gap:** if a node needs data the backend DTO doesn't return, do **NOT** invent it — render the honest empty/"—" state, record a data-gap, and hand off: `/sp-plan` (add the field to the spec) → `/sp-build`.
- **Real drift only:** the comparison is the script's numbers on disk — never override a red row by "it looks fine". Context loss can't corrupt the compare; for a large surface, fan out one subagent per child component/subtree (sp-build auto-mode style) so no single context holds the whole tree.

### Phase 9 — Baseline conflict
When a design value has **no token and contradicts an adopted baseline token** (e.g. the prototype tile is 9px but `rounded-tile` is 11px), stop and surface it as a **baseline decision**: fix `tokens.css` + `DESIGN.md` first (baseline-first), don't thrash arbitrary `[9px]` values per-component. Confirm with the user which is canonical.

### Phase 10 — Tests + report
- **Faithful-structure tests = unit/component tests** (Vitest + Testing Library, or the project's runner): assert the faithful nodes exist (role/text/order) and **keep** the behavioural (AS-/C-) assertions intact. Run typecheck + the unit runner **green**. (The fidelity harness is the measuring tool, not a committed test by default; optionally wire it as a Playwright e2e gate. Do NOT use the Playwright MCP — it blocks `file://`; the engine uses the Playwright Node API.)
- **Report**: final fidelity table + coverage (M/N nodes measured, 0 missing) + data-gaps + hand-offs + any **accepted deviations** (rule 2) with their justification.

### Phase 11 — Capture lessons (close the loop)
Append what this port taught to the persistent, layered store so the skill improves each run:
- default → `~/.claude/sp-port-webui/lessons.md` (user-global, survives upgrade); repo-specific → `<repo>/.specpipe/port-lessons.md` (wins for that repo).
- One dated entry per lesson: `component · symptom → correct fix` (a new recurring drift + its token, a selector trick, a baseline decision, a serializer trap). **Maintainer promotion:** periodically fold high-value lessons back into `references/port-lessons.md` and ship via `devkit upgrade` — this is how the skill gets sharper over time.

---

## Decision rules (read before editing anything)

A red row is a *question*, not an order. Resolve each against these before you touch code — most bad ports come from "fixing" the wrong side.

1. **Documented deviation wins over the source.** The design source is authoritative **only** where the project hasn't deliberately overridden it. Before treating a diff as drift, check `DESIGN.md` / `CLAUDE.md` for an intentional deviation (e.g. "row actions → kebab, a deliberate deviation from the prototype's inline link"). If the diff matches a documented deviation, **the build is correct — leave it, don't revert to the source.** If unsure whether a deviation is intentional, ask; never silently un-do a deliberate design decision.
2. **Accepted deviation — the loop's only escape from 100%.** A prop that legitimately can't converge (fluid width set by the container, font hinting, dynamic text length) may be **accepted** IF you (a) state why, (b) list it in the report as an accepted deviation, and (c) log it to lessons. Never accept by silently ignoring a red row, and never bury it under an arbitrary value. Everything not accepted must reach tolerance.
3. **A cascade of missing+extra = a structural offset, not real drift.** When the built side inserts/removes wrappers, path-pairing shifts and STRUCTURAL floods with missing+extra siblings. Do **not** add/delete nodes to chase it. Fix by degree of divergence: **one wrapper** → add a `nodes[]` subtree override (re-anchors below it); **many/arbitrary wrapper levels** → the engine prints `⚠ shapes diverge` and path-pairing is unreliable — do NOT trust those rows. Instead **map the nodes semantically yourself** (you, the LLM, are better at "this design node ≈ that built node" than path code): run `--probe` to see both trees, then pin explicit `nodes[]` pairs with `"self": true` (measures element-to-element, ignoring wrapper depth). The engine then measures each aligned pair precisely.
4. **Font-size / letter-spacing match to the token step, not ±0.5px.** The default tolerance passes `10px` vs `10.5px`, but those are different scale tokens (`text-3xs` vs `text-2xs`). For type, treat a half-px delta as a FAIL and pick the exact token (or run `--tol 0` for that pass).
5. **Measure the fully-populated instance.** Seed the row/card/instance that renders **every conditional node** (chips, chunk-line, owner, badges). Measuring a sparse instance makes data-driven nodes look "missing" when they're just absent for lack of data — a false structural miss.
6. **Cover the themes and states the design defines.** If the project themes, port in **both light and dark** (token bugs often hide in one — re-run against each themed build). For interactive elements, add a `nodes[]` override with `states: ["hover"]` (or `"focus"`) on the anchor so the engine re-measures that subtree with the state triggered — hover/focus is where drift hides on buttons, links, and menus. (`disabled`/variant states aren't auto-triggered; measure those by pointing the map at a build rendered in that state.)
7. **Not every EXTRA node is wrong.** Built-side nodes that are non-visual (`sr-only`, focus wrappers, behavior-only containers with no box) are legitimate — keep them. Remove an extra only when it produces **visible** drift.
8. **Token vs arbitrary — the litmus.** Colour / type / radius / shadow / spacing → a token (missing one → add it to the baseline first, Phase 9). A pure one-off layout dimension with no semantic meaning (`w-[248px]` sidebar rail) → an arbitrary is fine. When in doubt, prefer the token.

When a rule doesn't resolve it and the choice changes the outcome, **ask** — don't guess a pixel value or reverse a design decision on your own.

## Non-goals (v1)
Built for real: the draft codegen + the measured-diff loop, for both prototype and Figma. **Documented but not built** (opt-in later, per project): screenshot-regression CI gate (`toHaveScreenshot`), a no-drift ESLint rule (forbid arbitrary `[..]`/hex/inline-style, assert composition), and a vision-judge "taste" pass (multimodal, non-deterministic, human-invoked). No native-mobile support (separate skill). No behaviour-matrix companion yet.

The engine is intentionally a single self-contained file (it must run standalone via `node`), so it exceeds the kit's ~350-line source guard by design — do not split it into modules that would break portability.

## Testing this skill
Two layers, tested differently:
- **Engine (deterministic):** `references/fidelity.selftest.mjs` writes a fixed design/built HTML pair with injected drift and asserts the engine flags it (right token fix, collapsed rows, missing/extra nodes, exit codes). Run it from a repo that has Playwright: `node "$SKILL_DIR/references/fidelity.selftest.mjs"`. It SKIPs (not fails) where Playwright/chromium is absent, so it stays out of the kit's browserless `npm test` and runs as an engine smoke — Phase 0 may run it to confirm the engine works in the target project before a port.
- **Procedure (LLM behaviour):** the phases + Decision rules are validated as scenarios (a behaviour-matrix / qa-benchmark), not asserts — deferred to a follow-up companion, like the other skills' `*-behavior-matrix`.
