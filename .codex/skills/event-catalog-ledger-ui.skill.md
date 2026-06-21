---
name: event-catalog-ledger-ui
description: Use when changing RaceSweet Events, Entrants, Categories, Sessions, Results, or Reports UI that reads or writes event catalog data, entrant teams, category/session assignment, or analytics event/session scope.
---

# Event Catalog Ledger UI

Use the event catalog service boundary for all event, session, category, and entrant writes.

## Checklist

- Read `AGENTS.md`, `src/app/eventCatalog.ts`, and `src/app/eventCatalogService.ts` before changing catalog UI behavior.
- Use scoped controls instead of editable raw IDs for event/category/session/entrant/participant relationships.
- Persist edits through `EventCatalogService`; do not mutate catalog state directly in React components.
- Preserve immutable ledger semantics: append mutations, persist, rebuild state from the ledger, and keep upstream callback behavior intact.
- Treat entrant `categoryId` as the primary editable category. Mirror `categoryIds` from it for normal single-category edits.
- Represent rider team membership with `teamEntrantId`; do not encode membership only in display text or transient UI state.
- For session-scoped analytics UI, load/apply assigned session sources through the existing source application flow.
- Add or update service unit tests and UI integration tests for every user-visible catalog behavior change.
