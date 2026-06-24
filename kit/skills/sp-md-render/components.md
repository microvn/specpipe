# Components catalog for sp-md-render

Copy these snippets verbatim into the body slot. Do not invent new CSS classes. Do not add `<style>` or `<script>` tags — the template already has them.

All `id` attributes must be kebab-case slugs derived from the heading text, deduplicated by appending `-2`, `-3` on collision.

---

## §1. Section headings

```html
<h2 id="kebab-slug">Section title</h2>
<h3 id="kebab-slug-sub">Subsection</h3>
<h4>Eyebrow / non-anchored label</h4>
```

H1 is reserved for the page title (template). Don't emit additional H1s.

---

## §2. TOC entries (sidebar)

Placed inside `<nav class="toc">`. One link per H2; H3 nested via `.h3` class.

```html
<a href="#section-id" data-target="section-id">Section title</a>
<a href="#section-id-sub" data-target="section-id-sub" class="h3">Subsection</a>
```

`data-target` MUST match the element `id` exactly — the scroll-spy uses it.

---

## §3. TL;DR card

Render only if the source has a `## TL;DR` / `## Tóm tắt` / `## Summary` section. Place before the first H2.

```html
<aside class="tldr">
  <div class="tldr-label">TL;DR</div>
  <ul>
    <li>Bullet one.</li>
    <li>Bullet two.</li>
  </ul>
</aside>
```

Max ~10 bullets. Keep each ≤ 1 line. If source is prose, render as `<p>` inside the card instead of `<ul>`.

---

## §4. Step cards

Use when source has 3+ sequential imperative items (numbered list with verbs, "Step N:", "Bước N:").

```html
<ol class="steps">
  <li class="step">
    <div class="step-title">Open the dashboard</div>
    <div class="step-body">Navigate to <code>/admin/dashboard</code> and sign in.</div>
  </li>
  <li class="step">
    <div class="step-title">Run the migration</div>
    <div class="step-body">
      <p>Execute <code>bin/migrate up</code>. Wait for the green check.</p>
    </div>
  </li>
</ol>
```

The numbered badge is generated via CSS counter. Don't hardcode "1.", "2." in the title.

---

## §5. Callouts

Map GFM admonitions to the matching variant. Source emojis in callout body pass through; do NOT add emojis to the title.

### NOTE — neutral aside

```html
<div class="callout note">
  <svg class="ico" aria-hidden="true"><use href="#i-note"/></svg>
  <div>
    <div class="callout-title">Note</div>
    <p>Body text. Identifiers like <code>SHA256</code> stay verbatim.</p>
  </div>
</div>
```

### TIP — recommendation

```html
<div class="callout tip">
  <svg class="ico" aria-hidden="true"><use href="#i-tip"/></svg>
  <div>
    <div class="callout-title">Tip</div>
    <p>Body text.</p>
  </div>
</div>
```

### WARN — caution

```html
<div class="callout warn">
  <svg class="ico" aria-hidden="true"><use href="#i-warn"/></svg>
  <div>
    <div class="callout-title">Warning</div>
    <p>Body text.</p>
  </div>
</div>
```

### DANGER — destructive / irreversible

```html
<div class="callout danger">
  <svg class="ico" aria-hidden="true"><use href="#i-danger"/></svg>
  <div>
    <div class="callout-title">Danger</div>
    <p>Body text.</p>
  </div>
</div>
```

**Title translation:** match `{{LANG}}` — vi: Ghi chú / Mẹo / Cảnh báo / Nguy hiểm. en: Note / Tip / Warning / Danger.

---

## §6. Code blocks

The copy button is auto-injected by template JS. Optional language label appears top-left.

```html
<pre class="code"><span class="lang">bash</span><code>cd /tmp
./build.sh --release</code></pre>
```

No language? Omit the `<span class="lang">`:

```html
<pre class="code"><code>raw text without language hint</code></pre>
```

**HTML-escape** `<`, `>`, `&` inside the `<code>` body. Do not syntax-highlight (no extra spans).

---

## §7. Mermaid diagram

For fenced ```mermaid blocks. The CDN script in the template renders them on load.

```html
<div class="mermaid">
graph TD
  A[Start] --> B{Decision}
  B -->|yes| C[Do thing]
  B -->|no| D[Skip]
</div>
```

Preserve source Mermaid syntax verbatim — do NOT HTML-escape inside `.mermaid`.

---

## §8. Tables

GFM table → HTML table. Wraps with horizontal scroll on narrow screens via CSS.

```html
<table class="md-table">
  <thead>
    <tr><th>Column A</th><th>Column B</th></tr>
  </thead>
  <tbody>
    <tr><td>value 1</td><td><code>identifier</code></td></tr>
    <tr><td>value 2</td><td>value 3</td></tr>
  </tbody>
</table>
```

---

## §9. Comparison cards

For "X vs Y", pros/cons, or two-column trade-off discussions.

### Generic two-column

```html
<div class="compare">
  <div>
    <h4>Option A</h4>
    <p>Body for A.</p>
  </div>
  <div>
    <h4>Option B</h4>
    <p>Body for B.</p>
  </div>
</div>
```

### Pros / cons (left=good, right=bad)

```html
<div class="compare pro">
  <div>
    <h4>Pros</h4>
    <ul><li>Fast</li><li>Cheap</li></ul>
  </div>
  <div>
    <h4>Cons</h4>
    <ul><li>Risky migration</li></ul>
  </div>
</div>
```

The `.pro` variant adds green/red left borders.

---

## §10. Collapsible section

Use for appendices, full logs, long detail sections (> 80 lines under one H3), or anything labeled "Details" / "Phụ lục" / "Full log".

```html
<details class="collapsible">
  <summary>Show full stack trace</summary>
  <div>
    <pre class="code"><code>... long output ...</code></pre>
  </div>
</details>
```

Defaults closed. Open by default only if the source explicitly opens it.

---

## §11. Plain lists

Use when content does not match the step-card heuristic — short scannable items, mixed prose, non-sequential.

```html
<ul>
  <li>First item with <code>some-code</code>.</li>
  <li>Second item.
    <ul>
      <li>Nested.</li>
    </ul>
  </li>
</ul>
```

Ordered:

```html
<ol>
  <li>One.</li>
  <li>Two.</li>
</ol>
```

---

## §12. Blockquote (non-callout)

For quotations, citations, or "as said by X" passages that are NOT admonitions.

```html
<blockquote>
  <p>The best code is no code at all.</p>
</blockquote>
```

---

## §13. Horizontal rule

```html
<hr>
```

Use sparingly — markdown `---` between major sections only.

---

## §14. Inline elements

- Inline code: `<code>identifier</code>`
- Bold: `<strong>important</strong>`
- Italic: `<em>nuance</em>`
- Link: `<a href="https://example.com">label</a>` (external links open in same tab; do not auto-add `target="_blank"`)
- Image: `<img src="path/to/image.png" alt="alt text">`

---

## §16. Task list (GFM `- [ ]`)

Map `- [ ]` / `- [x]` lines (GitHub-flavored markdown task list). Render checked items strikethrough automatically via CSS.

```html
<ul class="task-list">
  <li class="task-item">
    <input type="checkbox" disabled>
    <span class="task-text">Open ticket and reproduce locally.</span>
  </li>
  <li class="task-item">
    <input type="checkbox" disabled checked>
    <span class="task-text">Write failing test in <code>tests/billing.spec.ts</code>.</span>
  </li>
</ul>
```

Always emit `disabled` on the checkbox — the HTML is a view, not interactive state. `checked` reflects the source `- [x]`.

---

## §17. Strikethrough

Map markdown `~~text~~` → `<del>`. Inline element, lives inside paragraphs/lists.

```html
<p>Migration was <del>scheduled for Friday</del> pushed to Monday.</p>
```

Use `<del>` (semantic) over `<s>` (presentational). Color is muted via CSS — do not add inline styles.

---

## §18. Footnotes

Map Pandoc/GFM style: inline `[^1]` → superscript ref linking to a footnotes section at the bottom of the page.

**Inline reference (in body):**

```html
<sup class="fn-ref"><a href="#fn-1" id="fnref-1">1</a></sup>
```

**Footnotes section (once, at end of `<main>` after all body content):**

```html
<section class="footnotes" aria-label="Footnotes">
  <h4>Footnotes</h4>
  <ol>
    <li id="fn-1">
      The full citation or note. Identifiers stay verbatim: <code>RFC 8707</code>.
      <a class="fn-back" href="#fnref-1" aria-label="Back to text">↩</a>
    </li>
    <li id="fn-2">
      Second note.
      <a class="fn-back" href="#fnref-2" aria-label="Back to text">↩</a>
    </li>
  </ol>
</section>
```

Numbering must match between body refs and list items. Heading label "Footnotes" translates per `{{LANG}}` — vi: "Chú thích". The target item (when navigated via `#fn-N`) gets a highlight ring via `:target` CSS — no extra markup needed.

---

## §19. Figure with caption

Wrap an image that has a caption (markdown `![alt](src "title")` or explicit caption prose right after) into `<figure>`.

```html
<figure>
  <img src="diagrams/auth-flow.png" alt="OAuth flow with PKCE">
  <figcaption>Figure 1: OAuth 2.1 + PKCE handshake. Token exchange happens server-side.</figcaption>
</figure>
```

If the source image has no caption, use plain `<img>` (§14) instead — do not invent caption text.

---

## §20. Anchor copy link (auto-injected)

**You do not emit this markup.** Template JS auto-adds a `<a class="anchor" href="#id">#</a>` to every `<h2 id>` and `<h3 id>` on page load. Hover the heading to reveal it; click to copy the deep link to clipboard.

What you must ensure:

- Every section heading you want copyable has an `id` attribute.
- Do not emit your own `.anchor` element — the JS handles it.

CSS hides it by default and shows on `:hover` of the parent heading; on mobile it stays inline at .45 opacity so it's discoverable without hover.

---

## §21. UI label translations

UI chrome labels go into placeholders (template). Provide values matching `{{LANG}}`:

| Placeholder | en | vi |
|---|---|---|
| `{{TOC_LABEL}}` | Contents | Mục lục |
| `{{SEARCH_PLACEHOLDER}}` | Search… | Tìm trong trang… |
| `{{SKIP_LABEL}}` | Skip to content | Bỏ qua menu |
| `{{THEME_TIP}}` | Toggle theme | Đổi theme |
| `{{UPDATED_LABEL}}` | updated | cập nhật |
| `{{COPY_LABEL}}` | Copy | Sao chép |
| `{{COPIED_LABEL}}` | Copied | Đã chép |
| Footnotes heading (§18) | Footnotes | Chú thích |

Callout title translations (in body markup, not placeholders):

| Variant | en | vi |
|---|---|---|
| note | Note | Ghi chú |
| tip | Tip | Mẹo |
| warn | Warning | Cảnh báo |
| danger | Danger | Nguy hiểm |

For other source languages, translate consistently across all labels and titles.
