# components.md — Catalog for ap-spec-render

11 HTML snippets. The AI copies them verbatim and fills in content. **Never invent CSS classes.**

Conventions: `{{X}}` is a placeholder string. `[...]` is a description (does not appear in output). `// comment` is a note and does not appear in output.

---

## §1 — Topbar meta extra

Content of `{{META_EXTRA}}` in the template, inserted after `{{LAST_UPDATED}}`:

**Single-spec:**
```html
<span class="sep">·</span><span>{{N_STORIES}} stories</span><span class="sep">·</span><span>{{N_AS}} AS</span>
```

**Multi-spec:**
```html
<span class="sep">·</span><span>{{N_SPECS}} specs</span><span class="sep">·</span><span>{{N_STORIES}} stories</span><span class="sep">·</span><span>{{N_AS}} AS</span>
```

---

## §2 — Sidebar TOC

Replace `<!-- TOC_ENTRIES -->`. Structure depends on layout.

**Single-spec:**
```html
<div class="toc-group">Overview</div>
<a href="#tldr" data-target="tldr">TL;DR</a>
<a href="#overview" data-target="overview">Overview</a>
<a href="#data-model" data-target="data-model">Data Model</a>  // skip if the spec has no data model

<div class="toc-group">Stories <span class="count">{{N_STORIES}}/{{N_AS}}</span></div>
<a href="#s-001" data-target="s-001"><span class="p p0">P0</span>S-001 · {{short title, max 30 chars}}</a>
// ... 1 entry per story, badge matching priority

<div class="toc-group">Reference</div>
<a href="#constraints" data-target="constraints">Constraints</a>
<a href="#existing" data-target="existing">What Already Exists</a>
<a href="#not-in-scope" data-target="not-in-scope">Not in Scope</a>
<a href="#changelog" data-target="changelog">Change Log</a>
<a href="#snapshots" data-target="snapshots">Snapshots</a>  // skip if the directory is empty
```

**Multi-spec:**
```html
<div class="toc-group">Overview</div>
<a href="#tldr" data-target="tldr">TL;DR</a>
<a href="#subspecs" data-target="subspecs">Sub-specs ({{N_SPECS}})</a>
<a href="#data-model" data-target="data-model">Shared Data Model</a>

<div class="toc-group">{{Sub-spec display name}} <span class="count">{{N_STORIES_IN_SUB}}/{{N_AS_IN_SUB}}</span></div>
<a href="#{{subslug}}-s-001" data-target="{{subslug}}-s-001"><span class="p p0">P0</span>S-001 · {{short title}}</a>
// ... per sub-spec

<div class="toc-group">Reference</div>
<a href="#constraints" data-target="constraints">Constraints ({{TOTAL_C}})</a>
<a href="#not-in-scope" data-target="not-in-scope">Not in Scope</a>
<a href="#changelog" data-target="changelog">Change Log</a>
```

**Rules:**
- Story title in the TOC is at most ~30 chars. Truncate at a word boundary, not mid-word.
- HTML `id` is namespaced by sub-spec slug: `signup-s-001`, `store-s-001`. The sub-spec slug is the part after `<feature>-` in the filename.
- Group name uses a readable display name: `onboarding-step-store.md` → group `Step 1 — Store`. If you cannot infer a clean name, fall back to the filename.

---

## §3 — TL;DR card

Mandatory. Generated from the Overview + story list, max ~10 bullets.

```html
<section class="tldr" id="tldr">
  <div class="tldr-label">TL;DR</div>
  <p>{{1–2 sentence summary with <b>key decisions</b> inline}}</p>
  <ul>
    <li><b>{{S-NNN or Sub-spec name}}</b> {{title}} — {{key behavior}} ({{N}} AS, {{Pn}})</li>
    // ...
  </ul>
</section>
```

**Rules:**
- Opening sentence states the phase/scope decision (e.g. "Phase 1, single-tab, email-only.").
- Bullets: 1 per story (single-spec) or 1 per sub-spec (multi-spec).
- Bold the ID and the key concept. Plain prose for the rest.

---

## §4 — Story card

Each `### S-NNN: Title (Pn)` becomes one `<article>`.

```html
<article class="story" id="{{namespaced-id}}">
  <header class="story-head">
    <span class="badge {{p0|p1|p2}}">{{P0|P1|P2}}</span>
    <span class="id">{{S-NNN}}</span>
    <span class="title">{{Story title}}</span>
    <span class="badge count">{{N}} AS</span>
  </header>
  <div class="story-body">
    <p class="story-desc">{{description, wrap identifiers in <code>}}</p>
    {{ if the story has **Applies Constraints**:
    <p class="story-desc"><b>Applies:</b> {{one <code>C-NNN</code> per bound constraint, space-separated}}</p>
    }}
    <div class="as-list">
      // §5 AS entries here
    </div>
  </div>
</article>
```

**Rules:**
- `id` is namespaced by sub-spec slug in multi-spec layout: `signup-s-001`. Single-spec: `s-001`.
- `badge p0/p1/p2` lowercase to match the priority.
- Description is the paragraph after `**Description:**` in the spec; preserve technical identifiers as `<code>`.
- If a story has no AS, still render the card. Inside `as-list`, put `<p style="color:var(--fg-muted);font-size:13px">No acceptance scenarios yet.</p>`.

---

## §5 — Acceptance Scenario

Each `AS-NNN` becomes a `<details>`. The first AS of each story is `open`; the rest start collapsed.

### §5a — Given/When/Then style (typical for P0, P1)

```html
<details class="as"{{ open if this is the first AS in the story}}>
  <summary class="as-head">
    <span class="id">{{AS-NNN}}</span>
    <span class="desc">{{1-line description from the spec}}</span>
    <span class="chev">›</span>
  </summary>
  <div class="as-body">
    <dl class="gwt">
      <dt>Given</dt><dd>{{state, wrap identifiers in <code>}}</dd>
      <dt>When</dt><dd>{{action}}</dd>
      <dt>Then</dt><dd>{{expected}}</dd>
    </dl>
    {{ if has Data:
    <div class="as-data"><b>Data:</b> {{data}}</div>
    }}
    {{ if has Setup:
    <div class="as-data"><b>Setup:</b> {{setup}}</div>
    }}
  </div>
</details>
```

### §5b — Prose flow style (P2 or when the spec does not split Given/When/Then)

```html
<details class="as">
  <summary class="as-head">
    <span class="id">{{AS-NNN}}</span>
    <span class="desc">{{short title}}</span>
    <span class="chev">›</span>
  </summary>
  <div class="as-body">
    <p class="as-prose">{{flow description + expected behavior}}</p>
  </div>
</details>
```

**Rules:**
- The `desc` in the summary is a 1-line summary, not the full Given/When/Then.
- Wrap `<code>` around every identifier: HTTP code, route, field name, function name, env var.
- Drop "Setup" if it duplicates Given. Drop "Data" if it is trivial.
- Do not bloat the AS body. An AS is a contract test — `Given X. When Y. Then Z.` is enough.

---

## §6 — Constraint callout

### §6a — Single callout (single-spec, or per-sub-spec when grouped)

```html
<div class="callout">
  <svg class="ico" aria-hidden="true"><use href="#i-warn"/></svg>
  <div>
    <p class="callout-title">{{C-NNN · short name}}</p>
    <p>{{constraint body, wrap identifiers in <code>}}</p>
    {{ if cross-surface invariant (has scope/surfaces/coverage):
    <p><b>Cross-surface invariant.</b> Scope: {{<code>S-NNN</code> …}}. Surfaces: {{<code>surface</code> …}}. Coverage: {{per surface, <code>surface</code> → <code>AS-NNN</code> | <code>GAP-NNN</code>}}.</p>
    }}
  </div>
</div>
```

// Cross-surface invariant block: reuses the callout's plain `<p>` (no new class, no inline style).
// Render it ONLY for a constraint carrying scope/surfaces/coverage; omit for ordinary constraints.

### §6b — Grouped constraints (multi-spec, more than 5 constraints per sub-spec)

```html
<details class="collapsible"{{ open if this is the Root group}}>
  <summary><b>{{Sub-spec display name}} (C-{{start}}..C-{{end}})</b> <span class="count">{{N}} invariants</span></summary>
  <div><div class="constraints">
    // §6a callouts here
  </div></div>
</details>
```

**Rules:**
- `.callout-title` uses the `C-NNN · short name` format. The short name is 2–4 words summarizing the constraint.
- Single-spec, or fewer than 5 constraints per sub-spec → flat §6a list.
- Multi-spec with many constraints → grouped §6b. Root group `open`, sub-spec groups closed.
- If a group has more than 8 callouts → optionally merge a few into a single `C-XXX..C-YYY` callout to avoid a wall of yellow. Each merged callout must still represent one coherent idea.

---

## §7 — Sub-spec section header (multi-spec only)

```html
<h2 class="subspec-head" id="{{subspec-slug}}"><span class="ix">{{EYEBROW}}</span>{{Display Title}}</h2>
<p style="color:var(--fg-muted);font-size:13.5px;margin-top:-4px">{{1-line overview of the sub-spec}}</p>
```

**Eyebrow values:**
- `SUB-SPEC` — generic sub-spec
- `STEP 1`, `STEP 2`, `STEP 3`, `STEP 4` — wizard step sub-specs
- `ROOT` — cross-cutting / root spec stories
- A custom eyebrow is fine when the sub-spec name suggests a clear role

**Display title:** from the `## Overview` of the sub-spec, or the filename. Keep it short (≤60 chars).

---

## §8 — Change Log (collapsed)

### §8a — Single-spec

```html
<h2 id="changelog">Change Log</h2>
<details class="collapsible">
  <summary>{{N}} entries <span class="count">expand</span></summary>
  <div>
    <table class="changelog">
      <thead><tr><th>Date</th><th>Change</th><th>Ref</th></tr></thead>
      <tbody>
        <tr><td class="date">{{YYYY-MM-DD}}</td><td>{{change}}</td><td>{{ref or —}}</td></tr>
      </tbody>
    </table>
  </div>
</details>
```

### §8b — Multi-spec (adds a Spec column)

```html
<h2 id="changelog">Change Log</h2>
<details class="collapsible">
  <summary>{{N}} entries across {{N_SPECS}} specs <span class="count">expand</span></summary>
  <div>
    <table class="changelog">
      <thead><tr><th>Date</th><th>Spec</th><th>Change</th><th>Ref</th></tr></thead>
      <tbody>
        <tr><td class="date">{{date}}</td><td>{{spec name}}</td><td>{{change}}</td><td>{{ref or —}}</td></tr>
      </tbody>
    </table>
  </div>
</details>
```

**Rules:**
- Sort entries by date DESC (newest first).
- Empty `Ref` → render as `—`.

---

## §9 — Snapshots (collapsed)

```html
<h2 id="snapshots">Snapshots</h2>
<details class="collapsible">
  <summary>{{N}} snapshots <span class="count">history</span></summary>
  <div>
    <div class="snapshots-list">
      <div class="snapshot-row">
        <span class="date">{{YYYY-MM-DD}}</span>
        <a href="snapshots/{{filename}}">snapshots/{{filename}}</a>
        <span class="reason">{{M-code if known}}{{: short reason}}</span>
      </div>
      // ...
    </div>
  </div>
</details>
```

**Rules:**
- Sort by date DESC.
- Read the `**Reason:**` line inside each snapshot file to fill `reason` (M1/M2/.../M6 + short).
- If the `snapshots/` directory does not exist or is empty → **skip the entire section**, do not render the header.

---

## §10 — Plain sections

### §10a — Overview / What Already Exists

```html
<h2 id="{{slug}}">{{Heading}}</h2>
<p>{{prose, wrap identifiers in <code>}}</p>
```

Skip the section if the spec does not have it.

### §10b — Sub-specs table (multi-spec only)

```html
<h2 id="subspecs">Sub-specs</h2>
<table class="subspec-table">
  <thead><tr><th>Sub-spec</th><th>Scope</th></tr></thead>
  <tbody>
    <tr><td>{{sub-spec name}}</td><td>{{scope description, wrap identifiers in <code>}}</td></tr>
  </tbody>
</table>
```

Pulled from the Sub-specs table in the root spec.

### §10c — Data Model (collapsed)

```html
<h2 id="data-model">{{Shared Data Model | Data Model}}</h2>
<details class="collapsible">
  <summary>{{N}} tables <span class="count">click expand</span></summary>
  <div>
    <h3 style="margin:8px 0 6px;font-size:13px;color:var(--fg-muted)"><code>{{table_name}}</code> — {{new | extend}}</h3>
    <p style="font-size:13px;color:var(--fg-muted)">{{column summary in 1–2 lines, mention key columns + indices}}</p>
    // repeat per table
  </div>
</details>
```

**Rules:**
- Compress each table into one prose paragraph. Do not render the full schema table — readers go to spec.md for that.
- Highlight key columns and indices in the prose.

### §10d — Not in Scope

```html
<h2 id="not-in-scope">Not in Scope</h2>
<div class="nis">
  <ul>
    <li><b>{{Item name}}</b> — {{reason / defer note}}</li>
    // ...
  </ul>
</div>
```

---

## §11 — Inline code and identifier rules

**Hard rule:** every technical identifier is wrapped in `<code>`. Applies in story descriptions, AS bodies, callouts, prose, and the TL;DR.

- `AS-001`, `S-003`, `P0` → `<code>`
- File paths: `<code>src/middleware/auth.ts</code>`
- Routes: `<code>POST /api/login</code>`
- Field / variable names: `<code>sid</code>`, `<code>HttpOnly</code>`, `<code>email_verified_at</code>`
- Env vars: `<code>NODE_ENV</code>`, `<code>PLUGIN_LATEST_VERSION</code>`
- Enum values: `<code>'active'</code>`, `<code>"finished"</code>`
- HTTP status: `<code>200</code>`, `<code>4xx</code>`
- Error codes: `<code>EMAIL_EXISTS</code>`, `<code>RATE_LIMIT</code>`

**Do NOT** wrap `<code>` around:

- Personal names, product names, team names
- Abstract references to tables ("the user table") — only wrap when writing the literal table name
- Numbers in natural prose ("3 retries", "24 hours")

---

## Global rules

1. **One component per chunk.** Do not nest callouts inside stories inside collapsibles.
2. **First AS of each story is `open`**, the rest collapsed.
3. **Constraint groups collapsed by default.** Root group `open` in multi-spec.
4. **Change Log + Snapshots + Data Model always collapsed.**
5. **TL;DR is mandatory.** Even for short specs.
6. **Never invent CSS classes.** Use only classes defined in the template.
7. **Never generate `<style>` or `<script>`.** They already exist in the template.
8. **One Write call.** Build the full buffer, then Write once. Edit loops cause drift and waste tokens.
9. **Identifiers always `<code>`.** Do not let `AS-001` run as plaintext inside prose.
10. **Sort time DESC** for Change Log and Snapshots (newest first).

---

## Build flow (summary)

```
1. Read template.html + components.md + one example pair (cached)
2. Read spec.md (+ sub-specs if any)
3. Parse: frontmatter, sections, stories, AS, constraints, snapshots
4. Classify single vs multi-spec
5. Fill ~12 placeholder strings (§1 META_EXTRA, langs, etc.)
6. Render TOC (§2) — 1 line per heading or story
7. Render body section by section:
   - TL;DR (§3) — always first
   - Sub-specs table (§10b) — multi-spec only
   - Data Model (§10c) — collapsed
   - Per sub-spec: subspec-head (§7) + overview + stories (§4) + AS (§5)
   - Constraints (§6) — flat or grouped
   - What Already Exists (§10a) — prose
   - Not in Scope (§10d) — list
   - Change Log (§8) — collapsed
   - Snapshots (§9) — collapsed (skip if empty)
8. Write spec.html (once)
9. Verify: no leftover placeholders, every TOC id matches the body
```

Output token cost ≈ spec.md size × 1.2. CSS/JS/sprite never appear in the AI output stream after the initial template build.
