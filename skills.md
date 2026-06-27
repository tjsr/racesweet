# Panel Refactor Guide

Use this when moving a single React section into `src/views/panels/<name>.tsx`.

## Default Pattern

1. Create `src/views/panels/<panelName>.tsx`.
2. Move only the JSX for that section into the panel.
3. Pass data and callbacks in as props.
4. Keep page-level state, routing, and save/delete orchestration in the parent view.
5. Add `src/views/panels/<panelName>.test.tsx` for the extracted panel.
6. Leave integration tests on the page if they already cover the same flow.

## Token-Saving Rules

- Read only the files that directly own the section, its props, and its tests.
- Prefer one focused panel test over re-reading the whole page tree.
- Use `rg` for discovery and direct file reads for context.
- Keep the extracted component presentational when possible.
- Do not widen scope unless the panel needs new state or service calls.

## Naming Convention

- Panel file: `src/views/panels/<camelCaseName>.tsx`
- Test file: `src/views/panels/<camelCaseName>.test.tsx`
- Export: `export const <PascalCaseName>Panel = ...`

## Model Choice

- Use the smallest capable model for simple panel moves.
- Escalate to a stronger model only if the panel depends on tricky shared state, side effects, or cross-file test updates.
