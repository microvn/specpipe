# fidelity engine — live demo

A hand-made design/built pair that reproduces the **coverage blind-spot** the engine now
catches: a stat row with an icon and a progress bar whose **fill + icon colour drift** (blue →
green) in the build. Two map keys show the before/after:

- **`shallow`** — a `self`-anchor-only map pinning just `#row` + `#iconbox`. Every *measured*
  property passes and there are 0 missing nodes, but the fill/icon were never measured. The
  **COVERAGE** axis reports `2 / 8 visual design nodes measured (25%)` and the run **FAILs with
  `insufficient coverage`** — it can no longer read as a match. (Before the fix this printed
  `PASS — fidelity 100% · 0 missing`.)
- **`full`** — the same surface with no overrides, so the engine auto-walks the whole subtree,
  measures the SVG `fill` + the progress bar `background-color`, and **FAILs on the actual colour
  drift** with a `bg-primary` token fix.

## Run it

From any repo that has Playwright installed (the engine resolves the *project's* Playwright):

```
SKILL=path/to/sp-port-webui
node "$SKILL/references/fidelity.mjs" shallow --project "$SKILL/references/fidelity.demo"
node "$SKILL/references/fidelity.mjs" full    --project "$SKILL/references/fidelity.demo"
```

If Playwright isn't resolvable from the demo dir (e.g. running inside the kit repo itself), point
the engine at one explicitly with `--pw /abs/path/to/node_modules/playwright`.

The deterministic regression matrix that asserts all of this (and the rest of the engine) lives
in `../fidelity.selftest.mjs`.
