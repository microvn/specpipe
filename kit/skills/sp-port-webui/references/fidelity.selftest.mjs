#!/usr/bin/env node
/**
 * fidelity.selftest.mjs — deterministic regression matrix for the fidelity engine.
 *
 * Writes a fixed DESIGN card + several BUILT variants (each exercising one branch)
 * into a temp dir, runs fidelity.mjs headless against each, and asserts behaviour.
 * Cases:
 *   identical   — built === design → 100%, exit 0
 *   drift       — radius/font drift + a missing node + an extra node → flagged, exit 1
 *   advisory    — only width differs → NOT counted (~), stays 100% / exit 0
 *   colordrift  — a modality colour dropped to gray → suggests text-modality-image, exit 1
 *   equiv       — same values, font "Geist" vs "Geist Variable" + hex colours → no false fail
 *   tol-pass    — a 0.5px length delta is within tolerance → pass
 *   tol-fail    — a 1px non-advisory delta fails
 *   reference   — --emit-reference then --reference round-trip (Figma path) + hex in the tree
 *   err-key     — unknown component key → exit 2 with a helpful message
 *   err-sel     — a root selector that matches nothing → clear error, non-zero
 *
 * Needs Playwright+chromium (resolved by walking up from the temp dir, created under
 * cwd). Run from a repo that has Playwright; SKIPs (not fails) when it's absent.
 *   node references/fidelity.selftest.mjs [--keep]
 */
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ENGINE = path.join(HERE, 'fidelity.mjs')
const KEEP = process.argv.includes('--keep')

const ROOT_TOKENS = ':root{--radius-tile:11px;--radius-xl:12px;--radius-md:8px;--color-modality-image:#18bcf2;--color-info:#2563eb;--color-foreground:#09090b}'
const TOKENS_CSS = `:root{--radius-tile:11px;--radius-xl:12px;--radius-md:8px;--text-base:13.5px;--text-base--line-height:19px;--text-sm:12.5px;--text-lg:15px;--color-modality-image:#18bcf2;--color-info:#2563eb;--color-foreground:#09090b}`
const RESET = '*{margin:0;box-sizing:border-box}body{font-family:sans-serif}'

// DESIGN: card > head > (tile[modality blue], name[Geist 13.5/600]) + footer.
const DESIGN = `<!doctype html><meta charset="utf8"><style>${RESET}</style>
<div id="card" style="width:260px;padding:16px;border:1px solid #e4e4e7;border-radius:12px;background:#fff">
  <div id="head" style="display:flex;align-items:center;gap:10px">
    <span id="tile" style="width:34px;height:34px;border-radius:11px;display:grid;place-items:center;background:rgba(24,188,242,.13);color:rgb(24,188,242)">I</span>
    <span id="name" style="font-size:13.5px;font-weight:600;font-family:'Geist';color:#09090b">AV Night Drive</span>
  </div>
  <div id="footer" style="margin-top:13px;border-top:1px solid #e4e4e7;padding-top:11px;font-size:12px;color:rgb(37,99,235)">Attach to project</div>
</div>`

// BUILT variants — each is DESIGN with ONE branch perturbed. head/tile/name/footer patched via placeholders.
const built = (o = {}) => `<!doctype html><meta charset="utf8"><style>${RESET}
${ROOT_TOKENS}</style>
<div id="card" style="width:${o.cardW || 260}px;padding:${o.pad || 16}px;border:1px solid #e4e4e7;border-radius:12px;background:#fff">
  <div id="head" style="display:flex;align-items:center;gap:10px">
    <span id="tile" style="width:34px;height:34px;border-radius:${o.tileR || 11}px;display:grid;place-items:center;background:rgba(24,188,242,.13);color:${o.tileColor || 'rgb(24,188,242)'}">I</span>
    <span id="name" style="font-size:${o.nameFs || 13.5}px;font-weight:600;font-family:${o.nameFf || "'Geist'"};color:${o.nameColor || '#09090b'}">AV Night Drive</span>
    ${o.extra ? '<span id="extra" style="font-size:11px;color:#71717a">EXTRA</span>' : ''}
  </div>
  ${o.noFooter ? '' : '<div id="footer" style="margin-top:13px;border-top:1px solid #e4e4e7;padding-top:11px;font-size:12px;color:rgb(37,99,235)">Attach to project</div>'}
</div>`

// wrapper: values MATCH the design, but an extra <div id="wrap"> is inserted inside
// #head (as shadcn/Slot often does). Whole-tree path pairing shifts and floods with
// missing+extra; a nodes[] override anchored by id must make it clean again.
const WRAPPER = `<!doctype html><meta charset="utf8"><style>${RESET}
${ROOT_TOKENS}</style>
<div id="card" style="width:260px;padding:16px;border:1px solid #e4e4e7;border-radius:12px;background:#fff">
  <div id="head" style="display:flex;align-items:center;gap:10px">
    <div id="wrap" style="display:flex;align-items:center;gap:10px">
      <span id="tile" style="width:34px;height:34px;border-radius:11px;display:grid;place-items:center;background:rgba(24,188,242,.13);color:rgb(24,188,242)">I</span>
      <span id="name" style="font-size:13.5px;font-weight:600;font-family:'Geist';color:#09090b">AV Night Drive</span>
    </div>
  </div>
  <div id="footer" style="margin-top:13px;border-top:1px solid #e4e4e7;padding-top:11px;font-size:12px;color:rgb(37,99,235)">Attach to project</div>
</div>`

const VARIANTS = {
  identical: built(),
  drift: built({ tileR: 10, nameFs: 12.5, noFooter: true, extra: true }),
  advisory: built({ cardW: 300 }),
  colordrift: built({ tileColor: '#71717a' }),
  equiv: built({ nameFf: "'Geist Variable'", nameColor: '#09090b' }),
  tolpass: built({ pad: 16.5 }),
  tolfail: built({ pad: 17 }),
  wrapper: WRAPPER,
}

// ── temp workspace under cwd so the engine resolves the project's Playwright ──
const tmp = mkdtempSync(path.join(process.cwd(), '.fidelity-selftest-'))
let failures = 0
const check = (name, cond, detail = '') => { console.log((cond ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + name + (cond ? '' : `  \x1b[2m${detail}\x1b[0m`)); if (!cond) failures++ }
const run = (key, extra = []) => {
  try { return { code: 0, out: execFileSync('node', [ENGINE, key, '--project', tmp, ...extra], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) } }
  catch (e) { return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') } }
}

try {
  mkdirSync(path.join(tmp, 'scripts'), { recursive: true })
  writeFileSync(path.join(tmp, 'tokens.css'), TOKENS_CSS)
  writeFileSync(path.join(tmp, 'design.html'), DESIGN)
  const dUrl = pathToFileURL(path.join(tmp, 'design.html')).href
  const map = { _config: { tokensCss: 'tokens.css' } }
  for (const [k, html] of Object.entries(VARIANTS)) {
    writeFileSync(path.join(tmp, `${k}.html`), html)
    map[k] = { source: 'prototype', prototype: { url: dUrl, selector: '#card' }, built: { url: pathToFileURL(path.join(tmp, `${k}.html`)).href, selector: '#card' } }
  }
  // same wrapper build, but re-anchored by id via nodes[] overrides
  map['wrapper-anchored'] = {
    source: 'prototype',
    prototype: { url: dUrl, selector: '#card' },
    built: { url: pathToFileURL(path.join(tmp, 'wrapper.html')).href, selector: '#card' },
    nodes: [
      { name: 'tile', refSel: '#tile', builtSel: '#tile' },
      { name: 'name', refSel: '#name', builtSel: '#name' },
      { name: 'footer', refSel: '#footer', builtSel: '#footer' },
    ],
  }
  // hover state: design button turns info-blue on hover; built turns the WRONG colour on hover.
  const HOVER_DESIGN = `<!doctype html><meta charset="utf8"><style>*{margin:0}
    .btn{display:inline-block;padding:8px 12px;border-radius:8px;background:#18181b;color:#fff}
    .btn:hover{background:#2563eb}</style><div id="root"><button id="hb" class="btn">Go</button></div>`
  const HOVER_BUILT = `<!doctype html><meta charset="utf8"><style>:root{--color-info:#2563eb;--radius-md:8px}*{margin:0}
    .btn{display:inline-block;padding:8px 12px;border-radius:8px;background:#18181b;color:#fff}
    .btn:hover{background:#dc2626}</style><div id="root"><button id="hb" class="btn">Go</button></div>`
  writeFileSync(path.join(tmp, 'hoverDesign.html'), HOVER_DESIGN)
  writeFileSync(path.join(tmp, 'hoverBuilt.html'), HOVER_BUILT)
  map['hover'] = {
    source: 'prototype',
    prototype: { url: pathToFileURL(path.join(tmp, 'hoverDesign.html')).href, selector: '#root' },
    built: { url: pathToFileURL(path.join(tmp, 'hoverBuilt.html')).href, selector: '#root' },
    nodes: [{ name: 'btn', refSel: '#hb', builtSel: '#hb', states: ['hover'] }],
  }
  // deep divergence: built buries #child 3 wrappers deeper than the design. Same styles.
  const DEEP_DESIGN = `<!doctype html><meta charset="utf8"><style>*{margin:0}</style>
    <div id="root"><h3 id="title" style="font-size:16px;color:#09090b">Title</h3><div id="mid"><span id="child" style="font-size:15px;color:#18181b">Child</span></div></div>`
  const DEEP_BUILT = `<!doctype html><meta charset="utf8"><style>*{margin:0}</style>
    <div id="root"><h3 id="title" style="font-size:16px;color:#09090b">Title</h3><div id="a"><div id="b"><div id="c"><span id="child" style="font-size:15px;color:#18181b">Child</span></div></div></div></div>`
  writeFileSync(path.join(tmp, 'deepDesign.html'), DEEP_DESIGN)
  writeFileSync(path.join(tmp, 'deepBuilt.html'), DEEP_BUILT)
  const deepUrls = { d: pathToFileURL(path.join(tmp, 'deepDesign.html')).href, b: pathToFileURL(path.join(tmp, 'deepBuilt.html')).href }
  map['deep'] = { source: 'prototype', prototype: { url: deepUrls.d, selector: '#root' }, built: { url: deepUrls.b, selector: '#root' } }
  map['deep-self'] = {
    source: 'prototype', prototype: { url: deepUrls.d, selector: '#root' }, built: { url: deepUrls.b, selector: '#root' },
    nodes: [
      { name: 'title', refSel: '#title', builtSel: '#title', self: true },
      { name: 'child', refSel: '#child', builtSel: '#child', self: true },
    ],
  }
  // near-miss: design colour/size are CLOSE to a token but not exact → expect ~hints, not arbitrary.
  const NEAR_DESIGN = `<!doctype html><meta charset="utf8"><style>*{margin:0}</style>
    <div id="root"><span id="t" style="font-size:15.4px;color:rgb(36,97,234)">X</span></div>`
  const NEAR_BUILT = `<!doctype html><meta charset="utf8"><style>${ROOT_TOKENS}*{margin:0}</style>
    <div id="root"><span id="t" style="font-size:14px;color:rgb(9,9,11)">X</span></div>`
  writeFileSync(path.join(tmp, 'nearDesign.html'), NEAR_DESIGN)
  writeFileSync(path.join(tmp, 'nearBuilt.html'), NEAR_BUILT)
  map['nearmiss'] = { source: 'prototype', prototype: { url: pathToFileURL(path.join(tmp, 'nearDesign.html')).href, selector: '#root' }, built: { url: pathToFileURL(path.join(tmp, 'nearBuilt.html')).href, selector: '#root' } }
  // inherited typography: #box sets color+font-size, #mid (no text) inherits them, #leaf (text) inherits too.
  // The drift lives on #box; it must surface ONLY on the ink node (#leaf), NOT echo on the text-less #mid.
  const INH_DESIGN = `<!doctype html><meta charset="utf8"><style>*{margin:0}</style>
    <div id="box" data-testid="box" style="color:rgb(220,38,38);font-size:20px"><div id="mid" data-testid="mid"><span id="leaf" data-testid="leaf">Hi</span></div></div>`
  const INH_BUILT = `<!doctype html><meta charset="utf8"><style>*{margin:0}</style>
    <div id="box" data-testid="box" style="color:rgb(37,99,235);font-size:16px"><div id="mid" data-testid="mid"><span id="leaf" data-testid="leaf">Hi</span></div></div>`
  writeFileSync(path.join(tmp, 'inhDesign.html'), INH_DESIGN)
  writeFileSync(path.join(tmp, 'inhBuilt.html'), INH_BUILT)
  map['inherit'] = { source: 'prototype', prototype: { url: pathToFileURL(path.join(tmp, 'inhDesign.html')).href, selector: '#box' }, built: { url: pathToFileURL(path.join(tmp, 'inhBuilt.html')).href, selector: '#box' } }
  map['err-sel'] = { source: 'prototype', prototype: { url: dUrl, selector: '#nope' }, built: { url: dUrl, selector: '#card' } }
  writeFileSync(path.join(tmp, 'scripts', 'fidelity.map.json'), JSON.stringify(map, null, 2))

  // Playwright availability probe (first real run) → SKIP if absent
  const probe = run('identical')
  if (/Playwright not resolvable/.test(probe.out)) {
    console.log('\x1b[33mSKIP\x1b[0m — Playwright not resolvable from ' + process.cwd() + '. Run from a repo with Playwright installed.')
    process.exit(0)
  }

  console.log('CASE identical')
  check('exit 0', probe.code === 0, `got ${probe.code}`)
  check('fidelity 100% / 0 missing', /PASS — fidelity 100%/.test(probe.out) && /0 missing/.test(probe.out))

  console.log('CASE drift')
  const d = run('drift')
  check('exit 1', d.code === 1, `got ${d.code}`)
  check('tile radius 11→10 suggests rounded-tile', /border-radius[\s\S]*?rounded-tile/.test(d.out))
  check('name 13.5→12.5 suggests text-base', /font-size[\s\S]*?text-base/.test(d.out))
  check('radius collapses to one row (no per-corner)', !/border-top-left-radius/.test(d.out))
  check('no currentColor cascade', !/caret-color|column-rule-color/.test(d.out))
  check('missing footer detected', /1 missing/.test(d.out))
  check('extra chip detected', /1 extra/.test(d.out))

  console.log('CASE advisory (width-only)')
  const a = run('advisory')
  check('exit 0 (width is advisory, does not gate)', a.code === 0, `got ${a.code}`)
  check('still fidelity 100%', /PASS — fidelity 100%/.test(a.out))
  check('width shown as advisory ~ row', /~ .*width|width .*\+40px/.test(a.out) || /\+40px/.test(a.out))

  console.log('CASE colordrift')
  const cd = run('colordrift')
  check('exit 1', cd.code === 1, `got ${cd.code}`)
  check('gray tile suggests text-modality-image (live token)', /color[\s\S]*?text-modality-image/.test(cd.out))

  console.log('CASE equiv (font Variable + hex)')
  const eq = run('equiv')
  check('exit 0 — "Geist" vs "Geist Variable" not a false fail', eq.code === 0, `got ${eq.code}`)
  check('fidelity 100%', /PASS — fidelity 100%/.test(eq.out))

  console.log('CASE tolerance boundary')
  const tp = run('tolpass'), tf = run('tolfail')
  check('0.5px padding delta passes', tp.code === 0, `got ${tp.code}`)
  check('1px padding delta fails', tf.code === 1, `got ${tf.code}`)
  check('failing padding row present', /padding/.test(tf.out))

  console.log('CASE reference round-trip (Figma path) + hex in tree')
  run('identical', ['--emit-reference', 'ref.json'])
  const refPath = path.join(tmp, 'ref.json')
  check('--emit-reference wrote a tree', existsSync(refPath))
  if (existsSync(refPath)) {
    // patch a colour to hex — a hand-authored (Figma) reference may carry hex
    let tree = readFileSync(refPath, 'utf8').replace(/rgb\(24, 188, 242\)/g, '#18bcf2')
    writeFileSync(refPath, tree)
    const r = run('identical', ['--reference', 'ref.json'])
    check('--reference loads the tree', !/needs a reference tree/.test(r.out) && !/Playwright not resolvable/.test(r.out))
    check('hex in reference == rgb in build (no false fail)', r.code === 0 && /fidelity 100%/.test(r.out), `code ${r.code}`)
  }

  console.log('CASE wrapper offset — structural pairing breaks (Decision rule 3)')
  const w = run('wrapper')
  check('inserted wrapper floods missing+extra (cascade, not clean)', /[1-9]\d* missing · [1-9]\d* extra/.test(w.out) && w.code === 1, `code ${w.code}`)

  console.log('CASE wrapper + nodes[] override — re-anchor fixes it')
  const wa = run('wrapper-anchored')
  check('override log shows anchored subtrees', /anchor override\(s\) active/.test(wa.out))
  check('re-anchored → 0 missing · 0 extra', /0 missing · 0 extra/.test(wa.out))
  check('re-anchored → PASS 100% / exit 0', wa.code === 0 && /PASS — fidelity 100%/.test(wa.out), `code ${wa.code}`)

  console.log('CASE hover state (Decision rule 6)')
  const h = run('hover')
  check('default state passes, hover drift caught → exit 1', h.code === 1, `code ${h.code}`)
  check('hover row labelled btn:hover', /btn:hover/.test(h.out))
  check('hover background drift suggests bg-info', /background-color[\s\S]*?bg-info/.test(h.out))

  console.log('CASE deep divergence — multi-level wrapper gap warns')
  const dp = run('deep')
  check('emits a "shapes diverge" warning', /shapes diverge/.test(dp.out))
  check('warning points to self pairs', /"self": true/.test(dp.out))
  check('does not silently pass (unpaired → exit 1)', dp.code === 1, `code ${dp.code}`)

  console.log('CASE deep + self pairs — element-to-element, depth-independent')
  const ds = run('deep-self')
  check('self pairs resolve the divergence → 0 missing · 0 extra', /0 missing · 0 extra/.test(ds.out))
  check('self pairs → PASS 100% / exit 0', ds.code === 0 && /PASS — fidelity 100%/.test(ds.out), `code ${ds.code}`)
  check('no divergence warning once self-paired', !/shapes diverge/.test(ds.out))

  console.log('CASE near-miss token (baseline drift, not arbitrary)')
  const nm = run('nearmiss')
  check('close colour → ~text-info hint (not blank/arbitrary)', /~text-info \(ΔRGB/.test(nm.out))
  check('close font-size → ~text-lg (off ...) hint', /~text-lg \(off/.test(nm.out))
  check('flags the drift (exit 1)', nm.code === 1, `code ${nm.code}`)

  console.log('CASE inherited typography — reports on ink node, not text-less wrappers')
  const inh = run('inherit')
  check('drift surfaces on the ink leaf (@leaf)', /@leaf/.test(inh.out) && /font-size/.test(inh.out) && /color/.test(inh.out))
  check('inherited font-size NOT echoed on wrappers (one row, at the leaf)', (inh.out.match(/font-size/g) || []).length === 1, `${(inh.out.match(/font-size/g) || []).length} rows`)
  check('exit 1', inh.code === 1, `code ${inh.code}`)

  console.log('CASE harvest — derive baseline from a token-less design')
  const hv = run('drift', ['--harvest'])
  check('emits a HARVEST baseline proposal', /HARVEST — implicit baseline/.test(hv.out))
  check('tallies recurring RADIUS + FONT-SIZE', /RADIUS/.test(hv.out) && /FONT-SIZE/.test(hv.out))
  check('proposes a starter tokens.css (--radius-/--text-/--color-)', /--radius-/.test(hv.out) && /--text-/.test(hv.out) && /--color-1: #/.test(hv.out))
  check('harvest exits 0 (proposal, not a gate)', hv.code === 0, `code ${hv.code}`)

  console.log('CASE errors')
  const ek = run('does-not-exist')
  check('unknown key → exit 2 + lists keys', ek.code === 2 && /no entry/.test(ek.out))
  const es = run('err-sel')
  check('root selector matching nothing → non-zero + names it', es.code !== 0 && /#nope/.test(es.out))

  console.log('')
  if (failures) { console.log(`\x1b[31m${failures} assertion(s) failed\x1b[0m`); process.exit(1) }
  console.log('\x1b[32mall selftest assertions passed\x1b[0m')
} finally {
  if (!KEEP) rmSync(tmp, { recursive: true, force: true }); else console.log('kept: ' + tmp)
}
