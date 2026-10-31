# Officials

## Purpose and acceptance criteria

Provide a dedicated Officials area in Participants for managing race officials
without representing them as entrants. Maintain a shared official directory,
assign officials to events and sessions in many-to-many roles, and provide
searchable contact lists that can be printed, exported to CSV, and generated as
PDF.

Acceptance requires all official/profile and assignment writes to be immutable
Event Catalog ledger mutations with persistence, rebuild, and upstream callback
effects. Officials must never appear in entrant counts, start lists, grids, or
results calculations.

## Current state and preconditions

- Current catalog entrants and participant data are race entities and cannot be
  reused for officials.
- Event Catalog ledger/service and event/session selectors are the required
  persistence and scoping mechanisms. Participants is the owning UI context.
- Print support exists through browser rendering; generated PDF and CSV need a
  shared export utility that can also support start-list reports.

## Resolved decisions and implementation questions

- **Identity scope:** maintain one shared Event Catalog official directory so a
  profile can be assigned to many events without becoming an entrant.
- **Assignment cardinality:** officials and roles are many-to-many at both
  event-wide and optional session scope.
- **Contact output:** the initial release provides print, CSV, and generated PDF
  from one filtered contact-list projection.

## Requirements and design

### Directory and assignments

- Add a catalog-wide `OfficialProfile` collection. A profile has stable ID,
  display name, email, phone, position, responsibilities (string list), notes,
  structured availability slots, archived flag, and audit metadata.
- An availability slot has optional start/end ISO instants and one of
  `available` or `unavailable`; invalid ranges are rejected. It records
  scheduling availability only and does not change race timing.
- Add `OfficialAssignment` records with stable ID, official ID, event ID,
  optional session ID, role name, optional responsibility override, and notes.
  An omitted session means event-wide. Multiple officials may share a role and
  one official may have many event-wide or session-specific assignments.
- Add immutable profile create/update/archive and assignment create/update/remove
  mutations, reducers, and Event Catalog service methods. Archive preserves
  profile/assignment history but prevents new assignments; unarchive is an
  explicit immutable update.
- Validate official existence, event/session ownership, duplicate equivalent
  assignments, email/phone formats when provided, and availability ranges.

### Participants UI and outputs

- Add a MUI Officials area in Participants with searchable directory results,
  archive filtering, detail editor, event/session assignment editor, and an
  assignment list scoped to the active event.
- Use event and session dropdowns from the catalog rather than editable IDs.
  Show archived historical assignments with a clear archived label and prevent
  creating new ones from them.
- Build one filtered contact-list projection for screen, print, CSV, and PDF.
  Include name, position, role, event/session, contact details, responsibilities,
  availability summary, and notes only when the operator selects the detailed
  layout. The default marshal list omits private notes.
- CSV must escape values and use stable column order. PDF and print use the same
  projection/order; PDF generation is a client-side shared export utility, not
  a server-side unauthenticated document endpoint.

## Failure handling

- Do not allow deletion that would erase official history. Archive instead.
- Prevent cross-event session assignments and duplicate role records before a
  mutation is appended.
- Export failures leave the list untouched and show an operator-visible error;
  they never alter catalog data.
- Explicitly isolate official selectors from entrant and participant selectors
  so missing/archived officials cannot affect timing computations.

## Test plan

- Unit-test profile/assignment validation, mutation replay, archive semantics,
  event/session scoping, availability, and contact-list projection.
- Service tests prove every write persists, rebuilds catalog state, and invokes
  the configured upstream callback.
- UI integration-test create, edit, search, archive, many-to-many assignment,
  session filtering, and disabled assignment for archived profiles.
- Add regressions proving officials are excluded from entrant counts, session
  participants, start-list rows, grids, and result calculations.
- Test print/CSV/PDF export content, field escaping, privacy layout selection,
  and no catalog mutation during export.

## Implementation checklist

- Extend Event Catalog types, mutations, reducers, persistence, and services.
- Add Participants Officials UI and shared contact export projection/PDF utility.
- Add the full service, UI, export, and race-exclusion test coverage; run
  TypeScript and lint checks.
