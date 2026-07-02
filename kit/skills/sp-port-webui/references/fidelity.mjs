#!/usr/bin/env node
/**
 * fidelity.mjs — the measured computed-style diff engine behind /sp-port-webui.
 *
 * It renders the BUILT component (via the PROJECT's Playwright) and diffs it,
 * property-by-property and node-by-node, against a REFERENCE captured from the
 * design source of truth (an HTML prototype it renders, or a Figma extraction an
 * agent feeds in). It walks the WHOLE subtree — container → deepest child — and
 * reads the FULL computed style of every node (DevTools-grade), so nothing is
 * skipped. Output is a numeric Δ table + a structural diff + a coverage line that
 * PROVES every design node was found and measured. No screenshots, no vision
 * model, no eyeballing.
 *
 * This file lives INSIDE the skill bundle and is NEVER copied into a project — it
 * resolves the project's Playwright by explicit path so a `devkit upgrade` keeps
 * every project on the latest engine. The per-component selector map, by contrast,
 * is project config and lives in the project.
 *
 * Usage:
 *   node <skill>/references/fidelity.mjs <key> --project <repo> [flags]
 *
 * Sources & references (one reference tree, three producers):
 *   prototype  → engine renders the HTML and captures the reference tree itself.
 *   figma      → an agent extracts nodes via MCP into a reference tree JSON; pass --reference.
 *   cache      → reuse a previously emitted reference tree; pass --reference (or --cache).
 *
 * Flags:
 *   --project <dir>       project root (Playwright + tokens resolve here; default cwd)
 *   --map <path>          selector map (default: <project>/scripts/fidelity.map.json)
 *   --pw <name|dir>       explicit Playwright module to import (else auto-resolve)
 *   --tokens <css>        design-token CSS file (else config.tokensCss / auto-detect)
 *   --reference <json>    load the reference tree instead of rendering the source
 *   --emit-reference <p>  write the captured reference tree here (cache / inspect)
 *   --cache               shorthand: read/write <project>/scripts/.fidelity-cache/<key>.json
 *   --probe               print a DOM outline of both roots (to author selectors)
 *   --all                 show matching props too (full dump), not only mismatches
 *   --watch               re-measure the built side on any change under <project>/src
 *   --tol <px>            length tolerance (default 0.5)
 *   --depth <n>           max tree depth to walk (default 8)
 *   --headed              run the browser headed (debugging)
 *   --strict-size         count width/height as failures (default: advisory)
 *   --json                machine-readable output
 *
 * Exit: non-zero when any non-advisory prop fails or a design node is unpaired
 * (suppressed under --watch). Local guide + optional CI gate — not required in CI.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, watch, readdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2)
const key = argv.find((a) => !a.startsWith('--'))
const has = (n) => argv.includes(`--${n}`)
const val = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d }

const PROJECT = path.resolve(val('project', process.cwd()))
const OPTS = {
  mapPath: path.resolve(PROJECT, val('map', 'scripts/fidelity.map.json')),
  pw: val('pw', null),
  tokens: val('tokens', null),
  reference: val('reference', null),
  emitReference: val('emit-reference', null),
  cache: has('cache'),
  probe: has('probe'),
  harvest: has('harvest'),
  all: has('all'),
  watch: has('watch'),
  tol: parseFloat(val('tol', '0.5')),
  depth: parseInt(val('depth', '8'), 10),
  headed: has('headed'),
  strictSize: has('strict-size'),
  json: has('json'),
}

if (!key) {
  console.error('usage: node fidelity.mjs <component-key> --project <repo> [--map p] [--reference j] [--watch|--probe|--all|--cache] [--tol px] [--depth n]')
  process.exit(2)
}

// ---------------------------------------------------------------------------
// Property vocabulary
//   PRIORITY = the props design tokens control → shown first, get a TOKEN FIX.
//   Everything else in the FULL computed set is still measured and flagged when
//   it differs (grouped; --all dumps matches too). ADVISORY = context-driven, not
//   token drift (a fluid card's width reflects its container).
// ---------------------------------------------------------------------------
const CAPTURE = [
  'width', 'height', 'display', 'box-sizing',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'border-top-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
  'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing',
  'text-transform', 'text-align', 'text-decoration-line', 'white-space', 'text-overflow', 'vertical-align',
  'color', 'background-color', 'background-image', 'opacity', 'box-shadow',
  'outline-width', 'outline-style', 'outline-color',
  'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-self', 'flex-grow', 'flex-shrink', 'flex-basis', 'order',
  'row-gap', 'column-gap', 'grid-template-columns', 'grid-template-rows',
  'position', 'top', 'right', 'bottom', 'left', 'z-index', 'overflow-x', 'overflow-y', 'object-fit', 'aspect-ratio', 'transform', 'visibility',
]
const ADVISORY = new Set(['width', 'height'])
const LEN = new Set([
  'width', 'height', 'padding', 'margin', 'gap', 'row-gap', 'column-gap',
  'border-width', 'border-radius', 'font-size', 'letter-spacing', 'top', 'right', 'bottom', 'left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
])
const COLOR = new Set(['color', 'background-color', 'border-color', 'outline-color',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'])
const CORNERS4 = ['top-left', 'top-right', 'bottom-right', 'bottom-left']
// Volatile — skipped even under --all (logical aliases, non-visual, currentColor-derived).
const SKIP = /(transition|animation|cursor|will-change|-webkit-|-moz-|^content$|^unicode|^speak|^voice|^cue|^pause|^rest|pointer-events|user-select|touch-action|tab-size|perspective|transform-origin|^inset|block-size$|inline-size$|border-(block|inline)|-start-|-end-)/

// ---------------------------------------------------------------------------
// Playwright — resolved from the PROJECT (explicit paths), never bundled here.
// ---------------------------------------------------------------------------
function loadChromium() {
  const req = createRequire(path.join(PROJECT, 'package.json'))
  const names = [OPTS.pw, 'playwright', '@playwright/test'].filter(Boolean)
  for (const n of names) {
    try { const m = req(n); if (m && m.chromium) return m.chromium } catch { /* try next */ }
  }
  throw new Error(
    `Playwright not resolvable from ${PROJECT}. Install it (\`npm i -D @playwright/test && npx playwright install chromium\`) ` +
    `or pass --pw <name|dir>. The engine stays in the skill; it needs the project's Playwright.`)
}

// ---------------------------------------------------------------------------
// Design-token reverse-map — built from the project's token CSS + the live page.
//   Scalars (radius / font-size / tracking / spacing) parsed from the token file.
//   Colours + shadows resolved LIVE from the built page (a probe div) so
//   color-mix()/var() chains resolve to real rgb. Nothing is baked into the skill.
// ---------------------------------------------------------------------------
function detectTokensCss(cfg) {
  if (OPTS.tokens) return path.resolve(PROJECT, OPTS.tokens)
  if (cfg?.tokensCss) return path.resolve(PROJECT, cfg.tokensCss)
  for (const c of ['src/styles/tokens.css', 'src/index.css', 'src/styles/globals.css', 'app/globals.css', 'styles/globals.css', 'src/app.css']) {
    const p = path.resolve(PROJECT, c)
    if (existsSync(p)) return p
  }
  return null
}
function parseScalarTokens(cssPath) {
  const css = cssPath && existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : ''
  const radius = new Map(), text = new Map(), tracking = new Map(), spacing = new Map()
  const grab = (re, cb) => { let m; while ((m = re.exec(css))) cb(m) }
  grab(/--radius-([\w-]+):\s*([\d.]+)px/g, (m) => radius.set(+m[2], `rounded-${m[1]}`))
  grab(/--(?:text|font-size)-([\w-]+):\s*([\d.]+)px;/g, (m) => { if (!m[1].includes('-line-height')) text.set(+m[2], `text-${m[1]}`) })
  grab(/--(?:tracking|letter-spacing)-([\w-]+):\s*(-?[\d.]+)(em|px)/g, (m) => tracking.set(m[2] + m[3], `tracking-${m[1]}`))
  grab(/--spacing-([\w-]+):\s*([\d.]+)px/g, (m) => spacing.set(+m[2], m[1]))
  const colorNames = new Set()
  grab(/(--[\w-]+):\s*(#[0-9a-fA-F]{3,8}|color-mix\([^;]+|rgba?\([^;]+|hsl[^;]+|oklch[^;]+)/g, (m) => colorNames.add(m[1]))
  const palette = [...colorNames].filter((n) => !/^--(radius|text|font-size|tracking|letter-spacing|spacing|shadow|ok-shadow|ease|animate)/.test(n))
  return { radius, text, tracking, spacing, palette, found: !!(cssPath && existsSync(cssPath)) }
}
function twSpacing(px) { if (px === 0) return '0'; const n = px / 4; return Number.isInteger(n) ? String(n) : null }

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------
function normColor(v) {
  if (!v) return ''
  if (v === 'transparent' || /rgba?\([^)]*,\s*0\)$/.test(v)) return 'transparent'
  // hex (#rgb / #rrggbb / #rrggbbaa) — reference bags (Figma) may carry hex; computed
  // style is always rgb(), so normalise both to the same rgb()/rgba() form.
  const h = v.trim().match(/^#([0-9a-fA-F]{3,8})$/)
  if (h) {
    let x = h[1]
    if (x.length === 3) x = x.split('').map((c) => c + c).join('')
    const r = parseInt(x.slice(0, 2), 16), g = parseInt(x.slice(2, 4), 16), b = parseInt(x.slice(4, 6), 16)
    const a = x.length === 8 ? Math.round((parseInt(x.slice(6, 8), 16) / 255) * 100) / 100 : 1
    return a === 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`
  }
  const m = v.match(/rgba?\(([^)]+)\)/)
  if (!m) return v.trim()
  const p = m[1].split(/[,\/\s]+/).filter(Boolean).map(Number)
  let a = p.length >= 4 ? Math.round(p[3] * 100) / 100 : 1
  return a === 1 ? `rgb(${p[0]},${p[1]},${p[2]})` : `rgba(${p[0]},${p[1]},${p[2]},${a})`
}
const normWs = (v) => (v || '').replace(/\s+/g, ' ').trim()
const normFont = (v) => normWs(v).split(',')[0].replace(/["']/g, '').toLowerCase().replace(/\s+variable$/, '')

// ---------------------------------------------------------------------------
// Token suggestion for a failing prop (reverse-map the DESIGN value → a class)
//
// Exact match → the token class. NO exact match but a token is CLOSE → a `~hint`
// (e.g. `~text-info (ΔRGB 6)`), which surfaces a prototype-vs-token BASELINE drift
// (a stale/slightly-off token) instead of silently degrading to an arbitrary. The
// operator then decides: fix the token to the design (baseline-first) or accept a
// deliberate deviation. Only past the threshold do we fall back to arbitrary.
// ---------------------------------------------------------------------------
const parseRgb = (s) => { const m = String(s).match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/); return m ? [+m[1], +m[2], +m[3]] : null }
function nearestColor(target, live) {
  const t = parseRgb(target); if (!t) return null
  let best = null
  for (const [k, stem] of Object.entries(live.colors)) {
    const c = parseRgb(k); if (!c) continue
    const d = Math.round(Math.hypot(c[0] - t[0], c[1] - t[1], c[2] - t[2]))
    if (!best || d < best.d) best = { stem, d }
  }
  return best && best.d <= 14 ? best : null   // ~perceptually close
}
function nearestPx(px, map, tol) {
  let best = null
  for (const [v, cls] of map) { const d = Math.round(Math.abs(v - px) * 100) / 100; if (!best || d < best.d) best = { cls, d, v } }
  return best && best.d <= tol && best.d > 0 ? best : null
}
const off = (v, ref) => `${v - ref >= 0 ? '+' : ''}${Math.round((v - ref) * 100) / 100}px`

function suggest(prop, refVal, live, S) {
  if (COLOR.has(prop)) {
    const pre = prop === 'color' ? 'text' : prop.startsWith('background') ? 'bg' : 'border'
    const st = live.colors[normColor(refVal)]
    if (st) return `${pre}-${st}`
    const n = nearestColor(normColor(refVal), live)
    return n ? `~${pre}-${n.stem} (ΔRGB ${n.d} — token off / deviation?)` : ''
  }
  if (prop === 'box-shadow') return live.shadows[normWs(refVal)] || ''
  if (prop === 'font-family') return normFont(refVal).includes('mono') ? 'font-mono' : 'font-sans'
  if (prop === 'font-weight') return ({ 400: 'font-normal', 500: 'font-medium', 600: 'font-semibold', 700: 'font-bold' })[parseInt(refVal, 10)] || ''
  if (prop === 'text-transform') return refVal === 'none' ? 'normal-case' : refVal
  if (prop.endsWith('radius')) { const px = parseFloat(refVal); if (S.radius.get(px)) return S.radius.get(px); const n = nearestPx(px, S.radius, 2); return n ? `~${n.cls} (off ${off(n.v, px)})` : `rounded-[${px}px]` }
  if (prop === 'font-size') { const px = parseFloat(refVal); if (S.text.get(px)) return S.text.get(px); const n = nearestPx(px, S.text, 1.5); return n ? `~${n.cls} (off ${off(n.v, px)})` : `text-[${px}px]` }
  if (prop.startsWith('padding') || prop.startsWith('margin') || prop === 'gap' || prop.endsWith('-gap')) {
    const px = parseFloat(refVal)
    const side = prop[0] === 'p' ? 'p' : prop[0] === 'm' ? 'm' : 'gap'
    let axis = ''
    if (side !== 'gap' && prop.includes('-')) { const seg = prop.split('-')[1]; axis = seg === 'left' || seg === 'right' ? 'x' : 'y' }
    if (S.spacing.get(px)) return `${side}${axis}-${S.spacing.get(px)}`
    const n = twSpacing(px); return n != null ? `${side}${axis}-${n}` : `${side}${axis}-[${px}px]`
  }
  if (prop === 'border-width' || (prop.startsWith('border') && prop.endsWith('width'))) { const px = parseFloat(refVal); return px === 1 ? 'border' : px === 0 ? 'border-0' : `border-[${px}px]` }
  return ''
}

// ---------------------------------------------------------------------------
// In-page tree snapshot: walk root→leaves, capture full (or priority) computed
// style + a structural path. This runs in the browser for both sides, and is the
// exact schema an agent emits for the Figma reference (see references/figma-extract.md).
// ---------------------------------------------------------------------------
const SNAPSHOT_FN = function (rootSel, opts) {
  const root = document.querySelector(rootSel)
  if (!root) return { error: 'root not found: ' + rootSel }
  const out = []
  const walk = (el, pathArr, depth) => {
    if (depth > opts.depth) return
    const cs = getComputedStyle(el)
    const style = {}
    if (opts.all) { for (let i = 0; i < cs.length; i++) { const p = cs[i]; style[p] = cs.getPropertyValue(p) } }
    else { for (const p of opts.capture) style[p] = cs.getPropertyValue(p) }
    const directText = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').slice(0, 30)
    out.push({
      path: pathArr.join('>'),
      tag: el.tagName.toLowerCase(),
      testid: el.getAttribute('data-testid') || null,
      role: el.getAttribute('role') || null,
      text: directText,
      childCount: el.children.length,
      style,
    })
    const kids = [...el.children]
    for (let i = 0; i < kids.length; i++) walk(kids[i], [...pathArr, i], depth + 1)
  }
  walk(root, [0], 0)
  return { nodes: out }
}

// ---------------------------------------------------------------------------
// Browser side
// ---------------------------------------------------------------------------
const VIEWPORT = { width: 1440, height: 900 }
async function openPage(browser, url) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
  return page
}
async function runSetup(page, steps = []) {
  for (const s of steps) {
    if (s.click) await page.click(s.click, { timeout: 15_000 })
    else if (s.hover) await page.hover(s.hover, { timeout: 15_000 })
    else if (s.waitFor) await page.waitForSelector(s.waitFor, { timeout: 15_000 })
    else if (s.fill) await page.fill(s.fill.selector, s.fill.value)
    else if (s.evaluate) await page.evaluate(s.evaluate)
  }
}
// Trigger an interactive state on `sel` so its (and descendants') :hover/:focus styles apply.
async function applyState(page, sel, state) {
  await page.mouse.move(0, 0)
  if (state === 'hover') await page.hover(sel, { timeout: 8000 }).catch(() => {})
  else if (state === 'focus') await page.focus(sel, { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(80)
}
async function clearState(page) { await page.mouse.move(0, 0).catch(() => {}); await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur()).catch(() => {}) }
async function snapshot(page, rootSel) {
  const r = await page.evaluate(`(${SNAPSHOT_FN.toString()})(${JSON.stringify(rootSel)}, ${JSON.stringify({ depth: OPTS.depth, capture: CAPTURE, all: OPTS.all })})`)
  if (r.error) throw new Error(r.error)
  return r.nodes
}
async function resolveLiveTokens(page, palette) {
  return page.evaluate((names) => {
    const probe = document.createElement('div'); document.body.appendChild(probe)
    const colors = {}
    for (const n of names) {
      probe.style.color = ''; probe.style.color = `var(${n})`
      const c = getComputedStyle(probe).color
      if (c) { const key = c.replace(/\s+/g, ''); if (!(key in colors)) colors[key] = n.replace(/^--(color-)?/, '') }
      probe.style.color = ''
    }
    const shadows = {}
    for (const s of ['sm', 'md', 'lg', 'xl', 'focus', '2xl']) {
      probe.style.boxShadow = ''; probe.style.boxShadow = `var(--shadow-${s})`
      const v = getComputedStyle(probe).boxShadow
      if (v && v !== 'none') shadows[v.replace(/\s+/g, ' ').trim()] = `shadow-${s}`
    }
    probe.remove()
    return { colors, shadows }
  }, palette)
}

// ---------------------------------------------------------------------------
// Compare two snapshot trees. Pairing is by structural path (both walked the same
// way from their mapped root). Unpaired nodes → structural missing / extra.
// ---------------------------------------------------------------------------
function labelFor(n) { const p = n && n.prefix ? `${n.prefix}·` : ''; return p + (n.testid ? `@${n.testid}` : n.role ? `${n.tag}[${n.role}]` : n.tag + (n.text ? ` “${n.text.slice(0, 12)}”` : '')) }

function normalize(prop, v) {
  if (COLOR.has(prop)) return normColor(v)
  if (prop === 'font-family') return normFont(v)
  if (LEN.has(prop) || prop === 'line-height') { const n = parseFloat(v); return Number.isNaN(n) ? normWs(v) : n }
  return normWs(v)
}
function row(label, prop, rv, bv, live, S) {
  if (rv == null && bv == null) return null
  const rn = normalize(prop, rv), bn = normalize(prop, bv)
  let pass, delta = ''
  if (typeof rn === 'number' || typeof bn === 'number') {
    const a = typeof rn === 'number' ? rn : NaN, b = typeof bn === 'number' ? bn : NaN
    if (Number.isNaN(a) && Number.isNaN(b)) return null
    const d = (b || 0) - (a || 0)
    delta = (d >= 0 ? '+' : '') + Math.round(d * 100) / 100 + 'px'
    pass = Math.abs(d) <= OPTS.tol
  } else {
    pass = rn === bn
    if (rn === 'transparent' && bn === 'transparent') pass = true
  }
  return { prop: label, ref: String(rv ?? '—').slice(0, 26), built: String(bv ?? '—').slice(0, 26), delta, fix: pass ? '' : suggest(prop, rv, live, S), advisory: ADVISORY.has(label), pass }
}
// Collapse a 4-side/4-corner family into ONE row when uniform on both sides; else per-side.
function fam(label, keys, R, B, live, S) {
  const rvs = keys.map((k) => R[k]), bvs = keys.map((k) => B[k])
  const uni = (a) => a.every((x) => x === a[0])
  if (uni(rvs) && uni(bvs)) { const r = row(label, label, rvs[0], bvs[0], live, S); return r ? [r] : [] }
  return keys.map((k, i) => row(k, k, rvs[i], bvs[i], live, S)).filter(Boolean)
}
function diffNode(refN, builtN, live, S) {
  const R = refN.style, B = builtN.style, rows = []
  const push = (...rs) => rs.forEach((r) => r && rows.push(r))
  const plain = (props) => props.forEach((p) => push(row(p, p, R[p], B[p], live, S)))
  const side = (s) => Math.max(parseFloat(R['border-' + s + '-width']) || 0, parseFloat(B['border-' + s + '-width']) || 0)
  const anyBorder = ['top', 'right', 'bottom', 'left'].some((s) => side(s) > 0)
  const positioned = (R.position && R.position !== 'static') || (B.position && B.position !== 'static')
  const isGrid = /grid/.test(R.display || '') || /grid/.test(B.display || '')
  const isFlex = /flex/.test(R.display || '') || /flex/.test(B.display || '')

  push(row('width', 'width', R.width, B.width, live, S), row('height', 'height', R.height, B.height, live, S))
  push(...fam('padding', ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'], R, B, live, S))
  push(...fam('margin', ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'], R, B, live, S))
  push(...fam('border-width', ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'], R, B, live, S))
  if (anyBorder) { push(row('border-style', 'border-top-style', R['border-top-style'], B['border-top-style'], live, S)); push(...fam('border-color', ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'], R, B, live, S)) }
  push(...fam('border-radius', CORNERS4.map((c) => `border-${c}-radius`), R, B, live, S))
  // Typography + `color` are INHERITED props: getComputedStyle returns the value
  // resolved from an ancestor even when the node doesn't set it. On a layout node
  // with no painted text that inherited value is invisible, so reporting it there is
  // phantom noise (one wrong ancestor → a mismatch echoed on every descendant). Only
  // compare these where ink is actually painted (direct text / a text-ish tag / a leaf).
  // Where it IS reported, the fix may belong on this node or the ancestor that sets it.
  const INK = /^(svg|path|rect|circle|polygon|line|use|i|span|a|button|label|p|h[1-6]|td|th|li|em|strong|small|code|b)$/
  const showsInk = refN.text || builtN.text || INK.test(refN.tag) || refN.childCount === 0
  if (showsInk) plain(['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-transform', 'text-align', 'text-decoration-line', 'white-space', 'text-overflow', 'vertical-align', 'color'])
  plain(['background-color', 'background-image', 'opacity', 'box-shadow'])
  push(row('display', 'display', R.display, B.display, live, S))
  if (isFlex) plain(['flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-self', 'flex-grow', 'flex-shrink', 'flex-basis', 'order'])
  if (R['row-gap'] === R['column-gap'] && B['row-gap'] === B['column-gap']) push(row('gap', 'gap', R['row-gap'], B['row-gap'], live, S))
  else plain(['row-gap', 'column-gap'])
  // grid tracks only when there's a real multi-track template (a single "34px" track
  // just echoes the box size, already covered by width/height).
  const multiTrack = (v) => v && /\s/.test(v)
  if (isGrid) ['grid-template-columns', 'grid-template-rows'].forEach((p) => { if (multiTrack(R[p]) || multiTrack(B[p])) push(row(p, p, R[p], B[p], live, S)) })
  plain(['overflow-x', 'overflow-y', 'object-fit', 'aspect-ratio', 'transform', 'visibility', 'z-index'])
  push(row('position', 'position', R.position, B.position, live, S))
  if (positioned) plain(['top', 'right', 'bottom', 'left'])
  if (OPTS.all) { const done = new Set(rows.map((r) => r.prop)); Object.keys(R).forEach((p) => { if (!SKIP.test(p) && !done.has(p)) push(row(p, p, R[p], B[p], live, S)) }) }
  return rows
}

// ---------------------------------------------------------------------------
// Report (matches the agreed harness format)
// ---------------------------------------------------------------------------
const TTY = process.stdout.isTTY
const c = {
  red: (s) => TTY ? `\x1b[31m${s}\x1b[0m` : s, grn: (s) => TTY ? `\x1b[32m${s}\x1b[0m` : s,
  yel: (s) => TTY ? `\x1b[33m${s}\x1b[0m` : s, dim: (s) => TTY ? `\x1b[2m${s}\x1b[0m` : s,
  bold: (s) => TTY ? `\x1b[1m${s}\x1b[0m` : s, cyn: (s) => TTY ? `\x1b[36m${s}\x1b[0m` : s,
}
const pad = (s, n) => { s = String(s); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length) }

function report(key, groups, structural, coverage) {
  const W = [22, 20, 20, 20, 8, 24]
  console.log('\n┌─ ' + c.bold(key) + ' ' + '─'.repeat(Math.max(0, 96 - key.length)))
  console.log(' ' + c.dim(['NODE', 'PROP', 'DESIGN', 'BUILT', 'Δ', 'TOKEN FIX'].map((h, i) => pad(h, W[i])).join(' ')))
  let shown = 0
  for (const g of groups) {
    const visible = OPTS.all ? g.rows : g.rows.filter((r) => !r.pass)
    if (!visible.length) continue
    let first = true
    for (const r of visible) {
      const mark = r.pass ? c.grn('✓') : r.advisory ? c.yel('~') : c.red('✗')
      const node = first ? labelFor(g.ref) : ''
      const deltaCol = r.delta || (r.pass ? '0' : '≠')
      console.log(' ' + mark + ' ' + pad(node, W[0] - 2) + ' ' + pad(r.prop, W[1]) + ' ' +
        pad(r.ref, W[2]) + ' ' + pad(r.built, W[3]) + ' ' + pad(deltaCol, W[4]) + ' ' +
        (r.pass ? c.dim('—') : !r.fix ? c.dim('(no token — arbitrary)') : r.fix.startsWith('~') ? c.yel(r.fix) : c.grn(r.fix)))
      first = false; shown++
    }
  }
  if (!shown) console.log(' ' + c.grn('✓ every measured property within tolerance across all nodes'))
  console.log('└' + '─'.repeat(98))

  console.log('\n' + c.bold('STRUCTURAL') + c.dim(' (node in design, missing in built)'))
  if (!structural.missing.length) console.log(' ' + c.grn('✓ no missing nodes'))
  for (const n of structural.missing) console.log(' ' + c.red('✗ missing ') + pad(n.path, 14) + ' ' + labelFor(n))
  if (structural.extra.length) {
    console.log(c.bold('EXTRA') + c.dim(' (node in built, absent in design)'))
    for (const n of structural.extra) console.log(' ' + c.yel('⚠ extra   ') + pad(n.path, 14) + ' ' + labelFor(n))
  }

  const { totalProps, fail, nodesRef, nodesBuilt, paired } = coverage
  const ok = fail === 0 && structural.missing.length === 0
  const raw = totalProps ? ((totalProps - fail) / totalProps) * 100 : 100
  const pct = ok ? '100' : Math.min(99.9, Math.floor(raw * 10) / 10).toFixed(1)  // never show 100 while failing
  console.log('\n' + c.bold('SUMMARY') + `  ${nodesRef} design nodes · ${paired} measured · ${structural.missing.length} missing · ${structural.extra.length} extra`)
  console.log(`         ${totalProps} props checked · ${totalProps - fail} pass · ${fail} fail`)
  console.log('         ' + (ok
    ? c.grn(`PASS — fidelity 100%  (all mapped props within ±${OPTS.tol}px / exact color+token, 0 missing nodes)`)
    : c.red(`FAIL — fidelity ${pct}%  (gate: 100% within ±${OPTS.tol}px / exact color+token, 0 missing nodes)`)))
  console.log('         ' + c.dim(`re-run after edits:  node <skill>/references/fidelity.mjs ${key} --project ${path.relative(process.cwd(), PROJECT) || '.'} --watch`))
}

// ---------------------------------------------------------------------------
// Probe — DOM outline for authoring selectors
// ---------------------------------------------------------------------------
function printProbe(nodes, label) {
  console.log(`\n─── ${label} outline (${nodes.length} nodes) ───`)
  for (const n of nodes) {
    const depth = n.path.split('>').length - 1
    const s = n.style
    console.log('  '.repeat(depth) + `${n.path}  <${n.tag}${n.testid ? ` data-testid=${n.testid}` : ''}> ` +
      c.dim(`[${s.display} ${s['font-size']}/${s['font-weight']} r=${s['border-top-left-radius']}] `) + (n.text ? `“${n.text}”` : ''))
  }
}

// ---------------------------------------------------------------------------
// One pass
// ---------------------------------------------------------------------------
function loadMap() {
  if (!existsSync(OPTS.mapPath)) { console.error(`no map at ${OPTS.mapPath}`); process.exit(2) }
  const map = JSON.parse(readFileSync(OPTS.mapPath, 'utf8'))
  const entry = map[key]
  if (!entry) { console.error(`no entry "${key}". Keys: ${Object.keys(map).filter((k) => !k.startsWith('_')).join(', ')}`); process.exit(2) }
  return { map, entry, cfg: map._config || {} }
}
function cacheFile() { return path.resolve(PROJECT, 'scripts/.fidelity-cache', `${key.replace(/\//g, '_')}.json`) }

async function captureReference(browser, entry, cfg) {
  // explicit reference file (figma extraction or prior cache)
  const refFile = OPTS.reference || (OPTS.cache && existsSync(cacheFile()) ? cacheFile() : null)
  if (refFile && existsSync(refFile)) return { nodes: JSON.parse(readFileSync(refFile, 'utf8')), page: null }

  if (entry.source === 'figma' && !refFile) {
    console.error(`source=figma needs a reference tree. Extract it via MCP (see references/figma-extract.md) then pass --reference <json>.`); process.exit(2)
  }
  // render the prototype and capture the tree ourselves
  const url = entry.prototype.url || pathToFileURL(path.resolve(cfg.designRoot ? path.resolve(PROJECT, cfg.designRoot) : PROJECT, entry.prototype.file)).href
  console.log(c.dim(`⏳ rendering design    ${url}  → ${entry.prototype.selector}`))
  const page = await openPage(browser, url)
  await page.waitForSelector('body', { timeout: 30_000 })
  await runSetup(page, entry.prototype.setup)
  await page.evaluate(() => document.fonts && document.fonts.ready)
  const nodes = await snapshot(page, entry.prototype.selector)
  if (OPTS.emitReference || OPTS.cache) {
    const out = OPTS.emitReference ? path.resolve(PROJECT, OPTS.emitReference) : cacheFile()
    mkdirSync(path.dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(nodes, null, 2))
  }
  return { nodes, page }   // page kept open for nodes[] override subtree snapshots; closed by runOnce
}

// Pair two node arrays by structural path (relative to each subtree root) and diff.
function pairAndDiff(refNodes, builtNodes, live, S, labelPrefix = '') {
  const builtByPath = new Map(builtNodes.map((n) => [n.path, n]))
  const refByPath = new Map(refNodes.map((n) => [n.path, n]))
  const groups = [], missing = [], extra = []
  let totalProps = 0, fail = 0, paired = 0
  for (const rn of refNodes) {
    const bn = builtByPath.get(rn.path)
    if (!bn) { missing.push({ ...rn, prefix: labelPrefix }); continue }
    paired++
    const rows = diffNode(rn, bn, live, S)
    const graded = rows.filter((r) => !r.advisory)
    totalProps += graded.length; fail += graded.filter((r) => !r.pass).length
    groups.push({ ref: labelPrefix ? { ...rn, prefix: labelPrefix } : rn, built: bn, rows, prefix: labelPrefix })
  }
  for (const bn of builtNodes) if (!refByPath.has(bn.path)) extra.push({ ...bn, prefix: labelPrefix })
  return { groups, missing, extra, totalProps, fail, paired, nRef: refNodes.length }
}

async function runOnce(browser) {
  const { entry, cfg } = loadMap()
  const tokensCss = detectTokensCss(cfg)
  const S = parseScalarTokens(tokensCss)

  const baseDir = cfg.designRoot ? path.resolve(PROJECT, cfg.designRoot) : PROJECT
  const builtUrl = entry.built.url
    || (entry.built.file ? pathToFileURL(path.resolve(baseDir, entry.built.file)).href : null)
    || (cfg.builtBaseUrl || '') + (entry.built.path || '')
  console.log(c.dim(`⏳ rendering built app  ${builtUrl}  → ${entry.built.selector}`))
  const built = await openPage(browser, builtUrl)
  await built.waitForSelector('body', { timeout: 30_000 })
  await runSetup(built, entry.built.setup)
  await built.evaluate(() => document.fonts && document.fonts.ready)
  const live = await resolveLiveTokens(built, S.palette)
  const builtNodes = await snapshot(built, entry.built.selector)

  const { nodes: refNodes, page: designPage } = await captureReference(browser, entry, cfg)
  const closeAll = async () => { await built.context().close(); if (designPage) await designPage.context().close() }

  if (OPTS.probe) { printProbe(refNodes, 'DESIGN'); printProbe(builtNodes, 'BUILT'); await closeAll(); return 0 }

  const overrides = Array.isArray(entry.nodes) ? entry.nodes : []
  let agg
  if (overrides.length && designPage) {
    // nodes[] re-anchoring: measure each (refSel ↔ builtSel) subtree independently, with
    // paths RELATIVE to each anchor — this jumps over wrapper <div>s that would otherwise
    // shift every path and break whole-tree pairing (Decision rule 3). Root auto-walk off.
    console.log(c.dim(`   ${overrides.length} anchor override(s) active — measuring anchored subtrees`))
    agg = { groups: [], missing: [], extra: [], totalProps: 0, fail: 0, paired: 0, nRef: 0 }
    const absorb = (r) => { agg.groups.push(...r.groups); agg.missing.push(...r.missing); agg.extra.push(...r.extra); agg.totalProps += r.totalProps; agg.fail += r.fail; agg.paired += r.paired; agg.nRef += r.nRef }
    // `self: true` → measure ONLY the two matched elements (no child walk), so arbitrary
    // depth divergence between design and built doesn't matter. This is where an LLM's
    // semantic node↔node mapping lands: it aligns the nodes, the engine measures precisely.
    const grab = async (page, sel, self) => { const ns = await snapshot(page, sel); return self ? ns.slice(0, 1) : ns }
    for (const ov of overrides) {
      const label = ov.name || ov.refSel
      absorb(pairAndDiff(await grab(designPage, ov.refSel, ov.self), await grab(built, ov.builtSel, ov.self), live, S, label))
      for (const st of ov.states || []) {
        await applyState(designPage, ov.refSel, st); await applyState(built, ov.builtSel, st)
        absorb(pairAndDiff(await grab(designPage, ov.refSel, ov.self), await grab(built, ov.builtSel, ov.self), live, S, `${label}:${st}`))
        await clearState(designPage); await clearState(built)
      }
    }
  } else {
    if (overrides.length && !designPage) console.log(c.yel(`   nodes[] overrides need the rendered design (not --reference/--cache) — ignoring; using root pairing`))
    agg = pairAndDiff(refNodes, builtNodes, live, S)
  }

  const structural = { missing: agg.missing, extra: agg.extra }
  const coverage = { totalProps: agg.totalProps, fail: agg.fail, nodesRef: agg.nRef, nodesBuilt: builtNodes.length, paired: agg.paired }
  console.log(c.dim(`   matched ${agg.paired} / ${agg.nRef} design nodes · ${structural.missing.length} missing · ${structural.extra.length} extra` + (S.found ? '' : c.yel(`  (no token file found${tokensCss ? '' : ' — suggestions degrade to arbitrary'})`))))

  // Divergence detector — path-pairing is only trustworthy when the two trees share a shape.
  // When they diverge (many unpaired, or built is much deeper), auto-pairing produces phantom
  // drift; alert the operator to hand the node↔node mapping to the LLM and pin it as explicit
  // `self` pairs (which measure element-to-element, depth-independently). Rule 3.
  const maxDepth = (ns) => ns.reduce((m, n) => Math.max(m, n.path.split('>').length), 0)
  const unpaired = structural.missing.length + structural.extra.length
  const ratio = agg.paired + unpaired ? unpaired / (agg.paired + unpaired) : 0
  const dGap = maxDepth(builtNodes) - maxDepth(refNodes)
  if (ratio > 0.30 || (!overrides.length && Math.abs(dGap) >= 2)) {
    console.log(c.yel(`⚠ shapes diverge — design depth ${maxDepth(refNodes)} vs built depth ${maxDepth(builtNodes)}, ${unpaired} unpaired (${Math.round(ratio * 100)}%).`))
    console.log(c.yel(`  Path-pairing is UNRELIABLE here — the rows below may be phantom drift. Have the LLM map`))
    console.log(c.yel(`  nodes semantically (run --probe to see both trees) and pin them as explicit nodes[] pairs`))
    console.log(c.yel(`  with "self": true (element-to-element, ignores wrapper depth). See fidelity.map.example.json.`))
  }

  if (OPTS.json) console.log(JSON.stringify({ key, groups: agg.groups, structural, coverage }, null, 2))
  else report(key, agg.groups, structural, coverage)

  await closeAll()
  return agg.fail || structural.missing.length ? 1 : 0
}

// ---------------------------------------------------------------------------
// Harvest — derive an implicit baseline from a token-less design by frequency.
// When neither the project NOR the source declares tokens (raw prototype, or a
// Figma with no variables), there is nothing to resolve — so tally the recurring
// computed values; the ones that repeat ARE the de-facto design system. Propose a
// starter tokens.css for the human to rename semantically, then port against it.
// (baseline-first for the greenfield case — don't scatter arbitraries.)
// ---------------------------------------------------------------------------
function rgbToHex(rgb) {
  const p = parseRgb(rgb); if (!p) return rgb
  return '#' + p.map((n) => n.toString(16).padStart(2, '0')).join('')
}
async function harvestOnce(browser) {
  const { entry, cfg } = loadMap()
  const { nodes, page } = await captureReference(browser, entry, cfg)
  if (page) await page.context().close()
  const T = { color: new Map(), radius: new Map(), fontSize: new Map(), family: new Map(), weight: new Map(), space: new Map(), shadow: new Map() }
  const bump = (m, k) => { if (k != null && k !== '') m.set(k, (m.get(k) || 0) + 1) }
  for (const n of nodes) {
    const s = n.style
    if (n.text) { const cc = normColor(s.color); if (cc && cc !== 'transparent') bump(T.color, cc); const fs = parseFloat(s['font-size']); if (fs) bump(T.fontSize, fs + 'px'); bump(T.family, normFont(s['font-family'])); bump(T.weight, s['font-weight']) }
    const bg = normColor(s['background-color']); if (bg && bg !== 'transparent') bump(T.color, bg)
    if ((parseFloat(s['border-top-width']) || 0) > 0) { const bc = normColor(s['border-top-color']); if (bc && bc !== 'transparent') bump(T.color, bc) }
    const r = parseFloat(s['border-top-left-radius']); if (r > 0) bump(T.radius, r + 'px')
    for (const p of ['padding-top', 'padding-left', 'row-gap', 'column-gap']) { const v = parseFloat(s[p]); if (v > 0) bump(T.space, v + 'px') }
    const sh = normWs(s['box-shadow']); if (sh && sh !== 'none') bump(T.shadow, sh)
  }
  const byFreq = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])
  const byNum = (m) => [...m.entries()].sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
  const line = (label, entries) => entries.length ? `${label}  ${entries.map(([v, c]) => `${v} ×${c}`).join(' · ')}` : ''
  console.log('\n' + c.bold(`HARVEST — implicit baseline from ${key} (${nodes.length} nodes)`))
  console.log(c.dim('  No declared tokens — these are the RECURRING values (candidates to tokenize).\n'))
  console.log(line('COLOR    ', byFreq(T.color)))
  console.log(line('RADIUS   ', byNum(T.radius)))
  console.log(line('FONT-SIZE', byNum(T.fontSize)))
  console.log(line('SPACING  ', byNum(T.space)))
  console.log(line('FAMILY   ', byFreq(T.family)) + (T.weight.size ? c.dim(`   weights: ${byFreq(T.weight).map(([v, c2]) => `${v}×${c2}`).join(', ')}`) : ''))
  if (T.shadow.size) console.log(line('SHADOW   ', byFreq(T.shadow)))
  // proposed starter tokens.css (value-ordered; human renames to semantic roles)
  const scale = (m, pre) => byNum(m).map(([v], i, a) => `  --${pre}-${['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'][i] || i}: ${v};`).join('\n')
  const colorLines = byFreq(T.color).map(([v], i) => `  --color-${i + 1}: ${rgbToHex(v)}; /* ×${T.color.get(v)} */`).join('\n')
  console.log('\n' + c.bold('Proposed tokens.css (rename to semantic roles, then save + add to DESIGN.md):'))
  console.log(':root{')
  if (T.radius.size) console.log(scale(T.radius, 'radius'))
  if (T.fontSize.size) console.log(scale(T.fontSize, 'text'))
  if (T.space.size) console.log(scale(T.space, 'spacing'))
  if (T.color.size) console.log(colorLines)
  console.log('}')
  console.log(c.dim('\nNext: rename tokens semantically, save to the project token file, note in DESIGN.md, then re-run the port to get real TOKEN FIX suggestions.'))
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const chromium = loadChromium()
const browser = await chromium.launch({ headless: !OPTS.headed })

if (OPTS.harvest) {
  try { await harvestOnce(browser) } catch (e) { console.error(c.red(String(e.stack || e))) }
  await browser.close()
  process.exit(0)
} else if (OPTS.watch) {
  const pass = async () => { try { await runOnce(browser) } catch (e) { console.error(c.red(String(e.message || e))) } }
  await pass()
  const srcDir = path.resolve(PROJECT, 'src')
  if (existsSync(srcDir)) {
    const dirs = new Set(); const collect = (d) => { dirs.add(d); for (const e of readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) collect(path.join(d, e.name)) }
    collect(srcDir)
    let t = null
    for (const d of dirs) watch(d, () => { clearTimeout(t); t = setTimeout(pass, 250) })
    console.log(c.dim('\n👀 watching src/ — save to re-measure. Ctrl-C to stop.'))
  }
} else {
  let code = 2
  try { code = await runOnce(browser) } catch (e) { console.error(c.red(String(e.stack || e))) }
  await browser.close()
  process.exit(code)
}
