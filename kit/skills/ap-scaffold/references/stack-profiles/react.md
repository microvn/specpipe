# Stack Profile — React (web frontend / full-stack FE)

<!--
A dated, research-VERIFIABLE starting suggestion — NOT a hard rule and NOT skill logic.
ap-scaffold MAY offer this as a default the user confirms; the Bootstrap Brief always wins,
and currency MUST be re-checked at scaffold time (versions and "best practice" move).
Override freely. Absence of a profile is fine — research the stack instead.

This file is the TEMPLATE for adding more profiles (laravel.md, fastapi.md, go-cli.md …):
keep them short, dated, opinion-as-data, with the "verify + don't over-install" cautions.

THIS IS A KIT-BUNDLED SEED. It is OVERWRITTEN on `devkit upgrade`. Do NOT hand-edit it as your
personal store — instead COPY it to `~/.claude/stack-profiles/<stack>.md` (your global defaults,
survives upgrades) or `./.claude/stack-profiles/<stack>.md` (this project). Lookup precedence:
project > user/global > this bundled seed; and the Bootstrap Brief overrides all of them.
-->

**Current as of:** 2026-06 — VERIFY each choice's currency with a web search at scaffold time before trusting it.

## Conventions (the patterns the example module demonstrates)

- **Server state / data layer:** TanStack Query (React Query) — never keep server state in a client store.
- **Client state:** Zustand — only for genuine client-only state.
- **Validation:** Zod — schemas shared between forms and API boundaries.
- **Forms:** React Hook Form + Zod resolver.
- **UI kit:** shadcn/ui + Tailwind (or the team's kit).
- **Structure:** feature-based — `features/<name>/{components,hooks,services,types}`; `core/` for the request client + providers.
- **Tests:** per the ARCHITECTURE §4 test rule — unit co-located sibling (`.test.tsx`, one suffix repo-wide), e2e as its own package.

## Why these

Widely adopted, composable, typed end-to-end. The scaffold's ONE example module wires a single slice through all of them — one query (React Query) → input validated by Zod → render — so every ap-build story copies an established pattern instead of improvising (this is what keeps cross-feature seams consistent).

## Caution

**Do NOT pre-install what the skeleton doesn't exercise.** The walking skeleton demonstrates the pattern with ONE thin slice; it does not scaffold empty stores/forms/components for features that don't exist yet. Pre-built infrastructure with no consumer is orphan code.
