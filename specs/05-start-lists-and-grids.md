# Start lists and grids

## Purpose and acceptance criteria

Add Start Lists & Grids to Reports. It derives operational reports from the
current Reports event/session selection and Event Catalog data, supports
category and start-group filtering, and renders traditional start lists, race
grids, and compact marshal sheets for print, CSV, and PDF output.

Acceptance requires output to update when catalog data changes, use exactly the
same ordered projection for every output format, and never infer or invent a
grid position: only explicit `startOrder` values produce grid positions.

## Current state and preconditions

- Reports already has selected event/session state, catalog entrants/entries,
  categories, and event/session option models.
- Categories, session category assignments, session start sequence, entries,
  entrant relationships, identifiers, and `startOrder` are existing sources for
  a derived report. The feature must not mutate them.
- A shared print/CSV/PDF export utility introduced for Officials is the export
  integration point. Reports uses MUI filter controls.

## Resolved decisions and implementation questions

- **Selection:** inherit the Reports event/session selection and provide only
  category and start-group filters inside this report.
- **Grid precedence:** show only explicit `startOrder` values; qualifying
  results never fill a missing grid position.
- **Distribution:** provide print, CSV, and generated PDF output from the same
  filtered ordered rows.

## Requirements and design

### Derived report model

- Build a pure `StartListReportRow` projection from the selected event/session:
  entrant/entry IDs, entrant name, participant names, race/bib number, team,
  category/class, selected session, start group, explicit grid/start position,
  transmitter/chip/plate identifiers, vehicle, and completeness flags.
- Include only catalog entries and entrants that belong to the selected event
  and session. Resolve participant/entrant/team membership through catalog
  relationships; do not query unrelated active state.
- Derive start groups from the selected session’s ordered `startSequence`,
  including category and start-wave items. Entries without a matching sequence
  appear in an `Unassigned` group.
- A grid position is present only when `startOrder` is explicitly stored on the
  applicable entry or entrant. Do not derive positions from qualifying results.
  Rows with no explicit position remain `Unassigned` and sort after positioned
  rows within their group.
- Sort positioned rows by numeric start order, then normalized race/bib number,
  then entrant name. Sort unassigned rows by normalized race/bib number then
  entrant name. Preserve this ordering for screen, print, CSV, and PDF.

### Reports UI and layouts

- Add `start-lists-grids` to the Reports report-type state. It inherits the
  current Reports event/session selection; it does not add competing event or
  session state.
- Add MUI filters for category and start group, plus layout selection:
  traditional start list, race grid, or compact marshal sheet. Clearly identify
  missing category, team, identifier, and start-position data rather than
  fabricating values.
- Traditional list emphasizes position and entrant identity; race grid presents
  position cells in order; marshal sheet prioritizes start group, number, name,
  class, and transmitter details. All layouts use the same filtered row model.
- Provide Print, Download CSV, and Download PDF actions. The generated PDF and
  CSV are built from the same filtered projection and use the currently selected
  layout’s column rules. Print uses print CSS and does not mutate view state.

## Failure handling

- With no selected event/session, show a clear empty-state prompt and disable
  export controls. With no eligible rows, export a labeled empty report only
  after explicit operator confirmation.
- Skip dangling catalog references safely and show a data-warning count; never
  include entities from another event as a fallback.
- Missing `startOrder` is normal report data, not an error. Duplicate explicit
  positions remain visible with a warning so marshals can resolve them.
- Export-generation failures surface an error without altering Report state or
  catalog data.

## Test plan

- Unit-test the row projection, event/session isolation, start-sequence group
  mapping, explicit-only grid position policy, sorting, filters, dangling
  references, missing fields, and duplicate positions.
- Add report UI integration tests for Reports selection inheritance, each
  layout, filters, empty states, warnings, and responsive render behavior.
- Test print, CSV, and PDF outputs against the same fixture projection, stable
  column/order rules, CSV escaping, and no mutation side effects.
- Add a two-event regression fixture proving no entrant, category, session, or
  start-group row leaks from an unrelated event.

## Implementation checklist

- Add the pure projection and shared export adapters with focused tests.
- Extend Reports state/navigation and implement the three MUI layouts.
- Add print styles and CSV/PDF actions, then run relevant Vitest, TypeScript,
  and lint checks.
