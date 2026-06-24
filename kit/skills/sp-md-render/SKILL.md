---
description: |
  Render any markdown file into a self-contained, scannable HTML view:
  sidebar TOC with scroll-spy, anchored headings, code copy buttons,
  Mermaid diagrams, callouts (note/warn/danger/tip), step cards,
  comparison cards, collapsible long sections, light/dark theme, TOC search.

  Use when asked to "render markdown", "md sang html", "xem md đẹp",
  "preview this doc", "make this readable", "md2html", or for any
  long-form markdown that is not a /sp-plan spec (investigation reports,
  explore docs, design notes, retros, READMEs, RFCs, meeting notes).

  Proactively suggest when the user is reading a long .md in chat
  ("hard to scan", "lots to read", "tl;dr this") or after a skill that
  writes a long markdown artefact finishes (e.g. /sp-investigate,
  /sp-explore, /retro).

  For /sp-plan spec files (structured stories + acceptance scenarios),
  use [[sp-spec-render]] instead — it understands S-NNN / AS-NNN /
  C-NNN / P-badges. This skill is the generic counterpart for arbitrary
  markdown without a fixed schema.

  Idempotent: re-rendering overwrites the previous .html. Safe anytime.
allowed-tools: Read, Write, Bash, Glob, Grep
---

Render an arbitrary markdown file into a self-contained `<file>.html` next to it.

The source `.md` is the truth. The HTML is a **view layer**: regenerable, never hand-edited. `template.html` and `components.md` are read-only inputs.

---

## Inputs

`$ARGUMENTS` may be:

- **Path to a .md file** (`docs/investigate/payment-bug-2026-05-16.md`) — render to `<file>.html` next to it.
- **`--out <path>`** — custom output destination.
- **Path to a directory** — list `*.md` files inside and prompt the user to pick.
- **Empty** — prompt the user for a file path.

Output is written to `<file>.html` (or `--out`) and overwrites any existing file.

**Refuse politely** if the file looks like a /sp-plan spec (has `### S-\d{3}:` headings) — tell the user to run `/sp-spec-render` instead. Quick check: `grep -q '^### S-[0-9]\{3\}:' <file>`.

---

## Skill files (read once before generating)

Resolved relative to this `SKILL.md`:

- `template.html` — HTML skeleton with embedded CSS, JS, Mermaid CDN, SVG sprite. Contains `{{PLACEHOLDER}}` strings and `<!-- TOC_ENTRIES -->`, `<!-- CONTENT_START -->`, `<!-- CONTENT_END -->` slots. **Read once, never modified.**
- `components.md` — Catalog of HTML snippets to copy verbatim. **Read once.**
- `examples/` — Reference input/output pairs (if any). If empty, proceed without — the catalog is enough.

**Read all available inputs before producing any output.** Do not invent CSS classes, do not generate component markup from scratch, do not add new `<style>` or `<script>` tags.

---

## Workflow

### Step 1 — Resolve and classify input

1. Parse `$ARGUMENTS` to find the source `.md`.
2. Reject if it looks like a /sp-plan spec (see above).
3. Read the source fully. Read `template.html` and `components.md`.
4. **Detect language** of the source prose. Default `vi` if Vietnamese dominates, `en` for English, otherwise the source's language. UI labels translate to match — see placeholder table in Step 3.

### Step 2 — Analyze content (analyzer pattern)

Walk the markdown and decide, for each chunk, the best component (see `components.md`). This is the core difference from `sp-spec-render`: there is no fixed schema. Use judgment.

Heuristics:

| Source pattern | Component |
|---|---|
| First `# Title` | Page title (template `<h1>`) |
| First paragraph after H1, ≤ 200 chars | Subtitle (`{{SUBTITLE}}`) |
| `## Section` | `<h2 id="...">` section anchor |
| `### Subsection` | `<h3 id="...">` |
| Prose paragraphs | `<p>` |
| Numbered actions ("Step 1: …", `1. Do X` chains ≥ 3 with imperative verbs) | Step cards (§4) |
| Fenced ```mermaid block | Mermaid diagram (§7) |
| Other fenced ```lang code | Code block with copy button (§6) |
| `> [!NOTE]` / `> [!TIP]` / `> [!WARNING]` / `> [!DANGER]` / `> [!IMPORTANT]` (GFM admonitions) | Callout (§5) |
| Blockquote starting with "Don't" / "Never" / "Cảnh báo" / "Lưu ý" | Mapped DANGER / WARN / NOTE callout |
| GFM table | `<table class="md-table">` (§8) |
| Pros/cons or "X vs Y" pair | Comparison cards (§9) |
| Inline `<details>` | Pass through |
| H3 section > 80 lines, or "Appendix" / "Full log" / "Phụ lục" | Wrap in `<details class="collapsible">` (§10) |
| Plain `ul` / `ol` not matching step heuristic | `<ul>` / `<ol>` (§11) |
| Inline `` `code` `` | `<code>` verbatim |
| Source has `## TL;DR` / `## Tóm tắt` | TL;DR card (§3) at top |

**TL;DR is optional here** (unlike spec-render). Only render if the source has it.

**Counts:** count H2 sections, code blocks, Mermaid diagrams → topbar meta.

### Step 3 — Build output buffer

Copy `template.html` into an in-memory string. Replace placeholders:

| Placeholder | Value |
|---|---|
| `{{LANG}}` | ISO 639-1 from detection |
| `{{TITLE}}` | First H1 text, or filename slug if absent |
| `{{SUBTITLE}}` | First paragraph after H1 (≤ 200 chars); empty if none |
| `{{DOC_TYPE}}` | `DOC` / `INVESTIGATION` / `EXPLORE` / `RFC` / `NOTES` / `RETRO` (infer from filename prefix; fallback `DOC`) |
| `{{DOC_TYPE_CLASS}}` | lowercase of above |
| `{{LAST_UPDATED}}` | ISO date from frontmatter (`date:` / `**Last updated**:`) else `$(date +%Y-%m-%d)` |
| `{{UPDATED_LABEL}}` | "updated" / "cập nhật" / matched language |
| `{{META_EXTRA}}` | `<span class="sep">·</span><span>N sections</span>` + optional diagrams / code blocks; skip zero counts |
| `{{TOC_LABEL}}` | "Contents" / "Mục lục" / matched |
| `{{SEARCH_PLACEHOLDER}}` | "Search…" / "Tìm trong trang…" / matched |
| `{{SKIP_LABEL}}` | "Skip to content" / "Bỏ qua menu" / matched |
| `{{THEME_TIP}}` | "Toggle theme" / "Đổi theme" / matched |
| `{{COPY_LABEL}}` | "Copy" / "Sao chép" / matched |
| `{{COPIED_LABEL}}` | "Copied" / "Đã chép" / matched |

### Step 4 — Render TOC

Replace `<!-- TOC_ENTRIES -->`. One entry per H2; H3 nested with `.toc a.h3` indent. Flat list ordered by appearance:

```html
<a href="#section-id" data-target="section-id">Section title</a>
<a href="#sub-id" data-target="sub-id" class="h3">Subsection</a>
```

### Step 5 — Render body

Replace the slot between `<!-- CONTENT_START -->` and `<!-- CONTENT_END -->` with body markup in source order. Use only components in `components.md`.

**Identifier preservation:** function names, file paths, routes, env vars, CLI flags stay verbatim in `<code>`.

**Mermaid:** ```mermaid block → `<div class="mermaid">…</div>`. CDN script in template renders it.

### Step 6 — Write file

Write the buffer to `<file>.html` (or `--out`). **One Write call.**

### Step 7 — Verify

Re-read the written file and check:

- [ ] No leftover `{{PLACEHOLDER}}` strings.
- [ ] No leftover slot comments.
- [ ] Every TOC `href="#x"` resolves to an element with `id="x"` (sample 5).
- [ ] Count of `<h2 id` matches H2 count from source.
- [ ] Each ```mermaid block produced one `<div class="mermaid">`.

Fix with targeted Edits if needed — don't rewrite the file.

Report:

```
✓ Rendered <filename> → <path>
  <N sections> · <N diagrams> · <N code blocks> · lang: <xx>
  Open: open <path>
```

---

## Rules

1. **Source is truth.** Never hand-edit HTML.
2. **One Write call.** Build buffer in memory, write once.
3. **No new CSS or components.** Use only template classes and `components.md` snippets.
4. **Never paraphrase technical content.** Identifiers, code, paths verbatim in `<code>`.
5. **Don't invent TL;DR.** Only render if source has it.
6. **No emojis in chrome.** Use SVG icons from template sprite. Source emojis pass through inside prose only.
7. **Long sections collapse.** > 80 lines under one H3 → wrap in `<details>`.

---

## Edge cases

- **Empty file / no headings** → render the prose as a single block, no TOC entries.
- **Heading ID collision** → suffix `-2`, `-3`; mirror in TOC.
- **Mermaid syntax invalid** → still emit `<div class="mermaid">`; the CDN shows its own inline error.
- **Frontmatter** → strip from body; read `date:` / `**Last updated**:` only.
- **Raw HTML in source** → pass through except `<script>` and `<style>` (strip for safety).
- **Source is a /sp-plan spec** → STOP, tell user to run `/sp-spec-render`.

---

## Anti-patterns

- ❌ Edit loop to assemble HTML — build buffer, Write once.
- ❌ New `<style>` blocks or inline CSS attributes.
- ❌ Inventing components not in `components.md`.
- ❌ Translating identifiers, routes, function names, CLI flags.
- ❌ Adding emojis to UI chrome.
- ❌ Rendering a spec file — defer to [[sp-spec-render]].

---

## Relationship with other skills

- [[sp-spec-render]] — sibling for /sp-plan specs (story cards, AS dl/dt, P-badges). This skill is the generic fallback.
- `/sp-investigate`, `/sp-explore`, `/retro` produce long markdown artefacts; suggest this skill at the end so the user can render an HTML view.
