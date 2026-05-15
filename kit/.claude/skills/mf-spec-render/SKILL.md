---
description: |
  Render spec markdown (single or multi-spec feature) into a self-contained,
  scannable HTML file: sidebar TOC with scroll-spy, story cards with P-badges,
  collapsible Given/When/Then for each AS, constraint callouts, dark/light theme,
  search filter.

  Use when asked to "render spec", "xem spec đẹp", "spec html", "tạo view cho spec",
  "preview spec", or after /mf-plan finishes writing or updating a spec.

  This skill is user-invoked, not auto-called. /mf-plan only writes the spec
  markdown — it suggests this command at the end so the user chooses whether
  to generate the HTML view.

  Proactively suggest this skill when the user is reading a long spec markdown
  in chat ("hard to scan", "lots to read") or after a Mode C update has made
  any existing <feature>.html stale.

  Skip for files that are not specs (investigation, explore doc — defer V1+).

  Idempotent: re-rendering overwrites the previous .html. Safe to run anytime.
allowed-tools: Read, Write, Bash, Glob, Grep
---

Render `docs/specs/<feature>/<feature>.md` (plus sub-specs if any) into a self-contained `<feature>.html`.

The source `.md` is the truth. The HTML is a **view layer**: regenerable, never hand-edited. Target output token cost ≈ source markdown size × 1.2 — `template.html` and `components.md` are read-only inputs (cached across calls), and CSS/JS never enters the output token stream.

---

## Inputs

`$ARGUMENTS` may be:

- **Feature slug** (`customer-onboarding`) — resolves to `docs/specs/<slug>/<slug>.md`
- **Path to a root spec** (`docs/specs/billing/billing.md`) — renders that directory
- **Path to a directory** (`docs/specs/billing/`) — renders that directory
- **`--all`** — bulk re-render every `docs/specs/*/<name>/<name>.md`
- **Empty** — list all `docs/specs/*/` and prompt the user to pick

In every case, output is written to `<spec-dir>/<feature>.html` and overwrites any existing file.

---

## Skill files (read once before generating)

Resolved relative to this `SKILL.md`:

- `template.html` — HTML skeleton with embedded CSS, JS, and SVG sprite. Contains `{{PLACEHOLDER}}` strings and `<!-- TOC_ENTRIES -->`, `<!-- CONTENT_START -->`, `<!-- CONTENT_END -->` slots. **Read once, never modified.**
- `components.md` — Catalog of 11 HTML snippets to copy verbatim. **Read once.**
- `examples/user-auth.md` + `examples/user-auth.html` — Reference input/output pair. Read one pair to calibrate quality before rendering.

**Read all three before producing any output.** Do not invent CSS classes, do not generate component markup from scratch, do not add new `<style>` or `<script>` tags.

---

## Workflow

### Step 1 — Resolve inputs

1. Parse `$ARGUMENTS` to determine the spec directory.
2. List files: `ls docs/specs/<feature>/*.md` — distinguish the root spec (`<feature>.md`) from sub-specs (`<feature>-*.md`).
3. List `snapshots/` if present (for the Snapshots section).
4. Read the root spec fully. Read each sub-spec fully.
5. Read `template.html`, `components.md`, and one example pair.

**Classify layout:**

| # | Condition | Layout |
|---|-----------|--------|
| L1 | Root spec only, no sub-specs | **Single-spec** — each `## H2` becomes a section; sidebar groups: "Overview" + "Reference" |
| L2 | Root + 1 or more sub-specs | **Multi-spec** — each sub-spec becomes a section with `.subspec-head`; sidebar groups by sub-spec name |

### Step 2 — Parse each spec.md

For each `.md`, extract:

- **Frontmatter:** `**Created**`, `**Last updated**`, `**Status**`, `**Snapshot limit**` (regex the `**Key:** value` lines at the top of the file).
- **Overview** paragraph (the text under `## Overview`).
- **Sub-specs table** (root only, optional) — list rows `[name](./path)` + scope.
- **Data Model** section (root, optional).
- **Stories** — each `### S-NNN: Title (Pn)` produces a story object with:
  - `id` (S-NNN, namespaced by sub-spec slug in multi-spec layout)
  - `priority` (P0/P1/P2 from the `(Pn)` suffix)
  - `title`
  - `description` (the paragraph after `**Description:**`)
  - `acceptance_scenarios[]` — each `AS-NNN:` produces an object with `id`, `desc` (the 1-line summary after the ID), `given`, `when`, `then`, `data` (optional), `setup` (optional)
- **Constraints** — each `- C-NNN:` bullet becomes a callout. If a single spec has more than 10, group them collapsed by sub-spec.
- **What Already Exists** — paragraph or bullet list.
- **Not in Scope** — bullet list.
- **Change Log** — table of entries.

**Counts:**

- Story count, AS count, sub-spec count → used for the topbar meta.
- Status class: `Draft` → `.status.draft`, `Active` → `.status.active`, `Deprecated` → `.status.deprecated`.

### Step 3 — Build output buffer

Copy `template.html` content into an in-memory string buffer. Replace placeholders (values from Step 2):

| Placeholder | Value | Notes |
|-------------|-------|-------|
| `{{LANG}}` | ISO 639-1 code | Detect from the source prose. Default `vi` if Vietnamese dominates, `en` for English. |
| `{{FEATURE}}` | feature slug | Appears twice: in `<title>` and `<h1>`. |
| `{{SUBTITLE}}` | 1-line description | Pulled from the root Overview, max 200 chars. |
| `{{VERSION}}` | from frontmatter, or snapshot count + 1 | Default `1` if absent. |
| `{{LAST_UPDATED}}` | ISO date from frontmatter | |
| `{{UPDATED_LABEL}}` | "updated" / "cập nhật" | Match `{{LANG}}`. |
| `{{META_EXTRA}}` | `<span class="sep">·</span><span>N specs</span><span class="sep">·</span><span>N stories</span><span class="sep">·</span><span>N AS</span>` | Multi-spec includes `N specs`; single-spec omits it. |
| `{{STATUS}}` | `Active` / `Draft` / `Deprecated` | |
| `{{STATUS_CLASS}}` | `active` / `draft` / `deprecated` | Lowercase. |
| `{{TOC_LABEL}}` | "Mục lục" / "Contents" | |
| `{{SEARCH_PLACEHOLDER}}` | "Tìm story…" / "Search story…" | |
| `{{SKIP_LABEL}}` | "Bỏ qua menu" / "Skip to content" | |
| `{{THEME_TIP}}` | "Đổi theme" / "Toggle theme" | |

### Step 4 — Render TOC

Replace `<!-- TOC_ENTRIES -->` with entries. Use §2 in `components.md`.

**Single-spec layout:**

```
[Overview]   TL;DR · Overview · Data Model (if any)
[Stories]    1 entry per story with P-badge
[Reference]  Constraints · What Already Exists · Not in Scope · Change Log · Snapshots
```

**Multi-spec layout:**

```
[Overview]            TL;DR · Sub-specs · Shared Data Model
[<Sub-spec 1 name>]   count "5/19"  | 1 entry per story (P-badge + S-NNN + short title)
[<Sub-spec 2 name>]   ...
...
[Root]
[Reference]           Constraints · Not in Scope · Change Log
```

Story link text format: `<span class="p p0">P0</span>S-NNN · <short title, max ~30 chars>`

### Step 5 — Render body

Replace the slot between `<!-- CONTENT_START -->` and `<!-- CONTENT_END -->` with the body, in this order:

1. **TL;DR card** (§3) — mandatory, generated from overview + story list. Max 10 bullets.
2. **Sub-specs table** (multi-spec only, §10b) — if the root has a Sub-specs table.
3. **Shared Data Model** (multi-spec) or **Data Model** (single, §10c) — collapsed by default for long tables.
4. **Per sub-spec** (multi-spec) or **Stories** section (single):
   - Sub-spec header: `<h2 class="subspec-head">` with an eyebrow `SUB-SPEC` / `STEP 1..4` / `ROOT` (§7).
   - Brief overview paragraph below the header.
   - Story cards (§4) in the order from spec.md. Within each story, the first AS is `open` and the rest are collapsed (§5).
5. **Constraints** (§6):
   - Single spec → flat list of callouts.
   - Multi-spec → grouped by sub-spec; each group is a `<details class="collapsible">`. The Root group defaults to `open`, sub-spec groups default closed.
6. **What Already Exists** (§10a) — plain prose section.
7. **Not in Scope** (§10d) — bullet list with `<b>` around each item name.
8. **Change Log** (§8) — collapsed table. Multi-spec adds a `Spec` column.
9. **Snapshots** (§9) — collapsed list, only if the directory contains files. Skip the section entirely when empty.

### Step 6 — Write file

Write the buffer to `<spec-dir>/<feature>.html`. **One Write call, no Edit loop** — repeated Edits cause drift and waste tokens.

### Step 7 — Verify

Re-read the written file and check:

- [ ] No leftover `{{PLACEHOLDER}}` strings.
- [ ] No leftover `<!-- TOC_ENTRIES -->`, `<!-- CONTENT_START -->`, `<!-- CONTENT_END -->`.
- [ ] Every TOC `href="#x"` resolves to an element with `id="x"` in the body (sample 5 random IDs).
- [ ] Count of `<article class="story">` matches the number of stories parsed.
- [ ] Count of `<details class="as">` matches the number of AS parsed.

If anything is off, fix with targeted Edits — do not rewrite the whole file.

Report to the user:

```
✓ Rendered <feature> → <path>
  <N specs> · <N stories> · <N AS> · status: <Draft|Active|Deprecated>
  Open: open <path>
```

---

## Rules

1. **Source is truth.** The HTML is an idempotent regenerable view. Never hand-edit HTML.
2. **One Write call.** Build the full buffer in memory, then write once.
3. **No new CSS or components.** Use only the classes in the template and the snippets in `components.md`.
4. **Never paraphrase technical content.** Field names, routes, code identifiers stay verbatim, wrapped in `<code>`.
5. **Compact AS bodies.** Given/When/Then are 1–2 lines each. Long-form detail belongs in spec.md, not the HTML.
6. **Local IDs per sub-spec.** Story ID is local per sub-spec (signup:S-001, store:S-001 OK). The HTML element `id` is namespaced by sub-spec slug to avoid duplicates across the rendered file.
7. **TL;DR is mandatory.** Even for short specs.
8. **Constraints / Snapshots / Change Log collapsed by default.** The Root constraint group may open by default in multi-spec layout; everything else stays closed.

---

## Edge cases

- **Empty story list** → render TL;DR + frontmatter + a placeholder "No stories yet." Do not error.
- **No `snapshots/` directory** → skip the Snapshots section entirely; do not render the header.
- **Missing Status in frontmatter** → default to `Draft`.
- **Missing Last updated** → use `$(date +%Y-%m-%d)`.
- **Story without AS** → render the story card with a "No acceptance scenarios yet." stub. Do not skip the story.
- **AS without explicit Given/When/Then** (P2 prose style) → render the flow description instead of the dl/dt grid. See §5b.
- **Sub-spec link path does not resolve** → log a warning, skip that sub-spec, still render the rest.
- **Source `.md` contains embedded HTML** → pass through inside `story-desc` if safe.

---

## Anti-patterns

- ❌ Edit loop to generate the HTML piece by piece — causes drift, wastes tokens. Build the buffer, then Write once.
- ❌ Adding a new `<style>` block or inline CSS attribute on an element. All CSS comes from the template.
- ❌ Generating an inline SVG path for every callout. Use the `.callout .ico` class with the SVG snippet in `components.md`.
- ❌ Translating identifiers, routes, function names. Code and paths stay verbatim.
- ❌ Bloating AS bodies with long prose. An AS is a contract test, not a tutorial.
- ❌ Rendering when `<feature>.md` does not exist — STOP and tell the user to run `/mf-plan` first.

---

## Relationship with /mf-plan

This skill is decoupled from `/mf-plan`. `/mf-plan` writes the spec markdown and ends — it never calls this skill automatically. At the end of Phase 4 (new spec) and Mode C C5 (spec update), `/mf-plan` displays a 1–2 line hint telling the user to run `/mf-spec-render <feature>` if they want the HTML view.

This gives the user explicit control:

- Some users only want the markdown (faster, no extra tokens spent rendering).
- Some users render once and never again until they actually want to scan the spec.
- Some users re-render after every update to keep an HTML tab open as their primary reading surface.

Manual invocation cases:

- After `/mf-plan` finishes — generate or refresh the HTML view.
- After hand-editing `<feature>.md` for a typo (no spec semantics changed, but the HTML is now stale).
- Bulk re-render across the repo after updating `template.html` or `components.md` in this skill.
- Rendering specs written before this skill existed.

---

## Bulk re-render

If `$ARGUMENTS` is `--all`:

1. `ls docs/specs/*/` — for each directory containing `<name>/<name>.md`, render it.
2. Report totals: `Rendered N specs in X seconds.`

Useful after updating `template.html` or `components.md` in this skill.
