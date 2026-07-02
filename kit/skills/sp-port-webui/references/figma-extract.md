# Figma → reference tree (feed the fidelity engine)

When `source=figma`, the engine can't render a "design" DOM — **you** (the agent, via a Figma MCP) extract the target node's properties into a **reference tree** JSON in the exact schema the engine emits, then run it with `--reference`. The engine measures the built component live and diffs it against your tree, node-by-node.

## Rule 0 — pull `node.*` raw, never trust a JSON serializer

Most Figma JSON tools (`get_node`, `scan_text_nodes`, some `get_design_context` shapes) **strip or unit-flatten** the properties that decide fidelity. Use a plugin-execution channel that exposes raw node values — figma-console `figma_execute`, or read carefully from Dev Mode `get_design_context` + `get_variable_defs`. Traps to decode (each has bitten real ports):

| Property | Symptom if you trust the serializer | Correct read |
|---|---|---|
| `letterSpacing` | returns `-4` → you write `-4px`, text crushes | `node.letterSpacing.unit`; `PERCENT −4%` → `-0.04em` |
| `lineHeight` | number with no unit → wrong leading | `node.lineHeight.unit` (`AUTO`/`PIXELS`/`PERCENT`) |
| `textCase` | content is mixed-case but renders UPPERCASE | `node.textCase`; `UPPER` → `text-transform:uppercase` |
| `textDecoration` | underline/strike missing | `node.textDecoration` |
| `effects` | drop/inner shadow, blur missing | `node.effects[]` → `box-shadow` |
| `opacity<1` | translucent layer renders solid | `node.opacity` |
| gradient fills | stops simplified, angle lost | `node.fills[]` `GRADIENT_*` → `gradientStops`+`gradientTransform` |
| variant state | active/hover/disabled guessed | `node.componentPropertyValues` on the instance |

Validate numerically (bounding boxes, computed values), never a 50%-opacity overlay — two text engines never match pixel-for-pixel and it lies.

## Reference-tree schema (must match the engine exactly)

An array, one object per node, in document order, walked from the mapped root. `path` is the index chain from the root (`"0"`, `"0>0"`, `"0>1>2"`) — the engine pairs design↔built by identical `path`. `style` keys are **CSS computed-style property names** with **CSS-normalized values** (lengths as `"Npx"`, colours as `"rgb(r,g,b)"`/`"rgba(...)"`), because they're compared against the built page's `getComputedStyle`.

```json
[
  { "path": "0", "tag": "div", "testid": null, "role": null, "text": "", "childCount": 3,
    "style": { "width": "260px", "border-top-left-radius": "12px", "border-top-right-radius": "12px",
               "border-bottom-right-radius": "12px", "border-bottom-left-radius": "12px",
               "padding-top": "16px", "padding-right": "16px", "padding-bottom": "16px", "padding-left": "16px",
               "background-color": "rgb(255,255,255)", "box-shadow": "0px 1px 2px 0px rgba(0,0,0,0.05)" } },
  { "path": "0>0", "tag": "span", "testid": null, "role": null, "text": "", "childCount": 1,
    "style": { "width": "34px", "height": "34px", "border-top-left-radius": "11px",
               "background-color": "rgba(24,188,242,0.13)", "color": "rgb(24,188,242)" } }
]
```

## Figma → CSS mapping (what to write into `style`)

| Figma | CSS prop(s) |
|---|---|
| `absoluteBoundingBox.width/height` | `width` / `height` (`"Npx"`) |
| `cornerRadius` / `topLeftRadius`… | the four `border-*-radius` (`"Npx"`) |
| `paddingTop/Right/Bottom/Left` | `padding-*` |
| `itemSpacing` (auto-layout) | `row-gap`/`column-gap` (or `gap`) |
| `layoutMode` HORIZONTAL/VERTICAL | `display:flex` + `flex-direction:row|column` |
| `primaryAxisAlignItems`/`counterAxis…` | `justify-content`/`align-items` |
| solid `fills[0]` on a frame | `background-color` (rgba from `{r,g,b,a}`×255) |
| solid `fills[0]` on TEXT / vector | `color` |
| `strokes[0]`+`strokeWeight` | `border-*-width` + `border-*-color` + `border-style:solid` |
| `fontName.family` / `.style` | `font-family` / `font-weight` (Regular400/Medium500/Semi Bold600/Bold700) + `font-style` |
| `fontSize` | `font-size` (`"Npx"`) |
| `lineHeight` (resolve unit) | `line-height` (`"Npx"`; AUTO → the rendered px) |
| `letterSpacing` (resolve unit) | `letter-spacing` (PERCENT→`em`; the engine also accepts px) |
| `textCase` | `text-transform` |
| `effects[]` DROP_SHADOW | `box-shadow` (`offsetX offsetY radius spread color`) |
| `opacity` | `opacity` |

Colour helper: `rgb(round(r*255),round(g*255),round(b*255))`, add alpha when `a<1`.

## Extraction snippet (adapt to your MCP channel)

```js
// Runs in the Figma plugin context (e.g. figma_execute). Returns the reference tree.
const ROOT_ID = "NODE_ID_OF_THE_SURFACE"
const px = (n) => `${Math.round(n * 100) / 100}px`
const rgb = (c) => c.a < 1 ? `rgba(${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)},${Math.round(c.a*100)/100})`
                           : `rgb(${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)})`
const solid = (fills) => Array.isArray(fills) && fills.find(f => f.visible!==false && f.type==='SOLID')
const out = []
const walk = (n, pathArr) => {
  const s = {}
  if (n.absoluteBoundingBox) { s['width']=px(n.width); s['height']=px(n.height) }
  if ('cornerRadius' in n && typeof n.cornerRadius==='number')
    ['top-left','top-right','bottom-right','bottom-left'].forEach(c => s[`border-${c}-radius`]=px(n.cornerRadius))
  if ('paddingTop' in n) { s['padding-top']=px(n.paddingTop); s['padding-right']=px(n.paddingRight); s['padding-bottom']=px(n.paddingBottom); s['padding-left']=px(n.paddingLeft) }
  if (n.layoutMode && n.layoutMode!=='NONE') { s['display']='flex'; s['flex-direction']=n.layoutMode==='HORIZONTAL'?'row':'column'; if (n.itemSpacing!=null){ s['row-gap']=px(n.itemSpacing); s['column-gap']=px(n.itemSpacing) } }
  const f = solid(n.fills)
  if (f) s[n.type==='TEXT' ? 'color' : 'background-color'] = rgb(f.color)
  if (n.type==='TEXT') {
    if (n.fontSize) s['font-size']=px(n.fontSize)
    if (n.fontName) { s['font-family']=n.fontName.family; s['font-weight']=({Thin:100,Light:300,Regular:400,Medium:500,'Semi Bold':600,SemiBold:600,Bold:700}[n.fontName.style]||400)+'' }
    if (n.textCase==='UPPER') s['text-transform']='uppercase'
    if (n.lineHeight && n.lineHeight.unit==='PIXELS') s['line-height']=px(n.lineHeight.value)
    if (n.letterSpacing && n.letterSpacing.unit==='PERCENT') s['letter-spacing']=(n.letterSpacing.value/100)+'em'
    if (n.letterSpacing && n.letterSpacing.unit==='PIXELS') s['letter-spacing']=px(n.letterSpacing.value)
  }
  if (Array.isArray(n.effects)) { const sh=n.effects.filter(e=>e.visible!==false&&e.type==='DROP_SHADOW').map(e=>`${px(e.offset.x)} ${px(e.offset.y)} ${px(e.radius)} ${px(e.spread||0)} ${rgb(e.color)}`).join(', '); if (sh) s['box-shadow']=sh }
  if (typeof n.opacity==='number' && n.opacity<1) s['opacity']=n.opacity+''
  out.push({ path: pathArr.join('>'), tag: n.type==='TEXT'?'span':'div', testid: null, role: null, text: (n.type==='TEXT'?(n.characters||''):'').slice(0,30), childCount: (n.children||[]).length, style: s })
  ;(n.children||[]).forEach((c,i)=> walk(c, [...pathArr, i]))
}
walk(await figma.getNodeByIdAsync(ROOT_ID), [0])
return out
```

Write the result to `<repo>/scripts/.fidelity-cache/<key>.json` (or any path) and run:

```
node "$SKILL_DIR/references/fidelity.mjs" <key> --project <repo> --reference scripts/.fidelity-cache/<key>.json
```

Tag names (`div`/`span`) are approximate — pairing is by `path`, not tag — but keep TEXT nodes as `span` so the engine's ink heuristic reports their `color`. If the built structure wraps differently from Figma auto-layout, add `nodes[]` overrides in the map or adjust which Figma nodes you emit so the `path` chains line up.

## Before building: reuse existing components (Code Connect)
Do NOT hand-roll a node that your codebase already has as a component. Call `figma_get_component_for_development(nodeId, codebasePath: <project>/src/components)` — it returns `compositionDependencies` (which child nodes are INSTANCEs of which components, with their variant props, e.g. a `Buttons/Button` with `Size=lg, Hierarchy=Link color`) and scans your codebase for matches. If a node maps to an existing component, import and use it (`<Button variant="link" size="lg">`), don't reproduce it with divs. The pixel engine cannot catch this — it's a separate axis (right component vs right pixels). Build any missing sub-component standalone first, then compose.

## No variables to resolve? Derive the baseline
If the Figma has no bound variables (or you're on a raw prototype) and the project has no tokens, there's nothing to resolve. Run `fidelity.mjs <key> --harvest` to tally the design's recurring values into a starter `tokens.css`, rename semantically, then port against it (SKILL Phase 1). Never scatter arbitraries silently.

## Auto Layout
A node with Auto Layout maps cleanly to flex/gap. A node using absolute positioning (no Auto Layout) has no flex semantics — the measured diff still works on final px, but structure won't map to flex; flag it rather than inventing a flex layout.
