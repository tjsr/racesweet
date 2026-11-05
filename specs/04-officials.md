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
- **Assignment identity:** editing an assignment may change its position, role,
  availability, notes, responsibility override, or session within its event.
  Moving it to another official or event requires remove and create mutations
  so historical attribution remains clear.
- **Contact output:** the initial release provides print, CSV, and generated PDF
  from one filtered contact-list projection.
- **Navigation:** Participants owns three separate tabs: Entrants,
  Individuals, and Officials. One Event selector above the tabs scopes entrant
  editing, individual role badges and unlinked participant cards, official
  assignments, and contact outputs. The Officials tab contains role management
  and reports; the Individuals tab contains shared person details.
- **Directory cards:** show every saved Individual profile and, for the selected
  event, existing individual entrants and team members without a profile.
  Unlinked cards offer create-and-link or link-to-existing-profile actions. A
  card shows the person's participant and official roles for the selected event.
- **Shared identity:** add explicit immutable links from an Individual profile
  to an event entrant or a named team member. Linking never turns the official
  assignment into a race entry and never changes participant calculations.
- **PDF implementation:** use the shared client-side `tabularReport` utility
  backed by `pdfmake`; the same ordered report columns and rows feed CSV,
  browser print, and generated PDF.

### Clarifications resolved during implementation

- The Participants navigation section has separate Entrants and Individuals
  and Officials areas. The Individuals directory may hold a person who is an
  entrant in one event and an official in another.
- Add shared-identity links in spec 04. Each link names the event, entrant,
  optional team-member participant ID, and shared profile. A team itself
  cannot be linked as a person. A given entrant or team member may have only
  one active link; remove and create mutations change that relationship.
- Existing riders and named team members without profiles appear as cards in
  Individuals. Creating a profile from one of these cards appends the profile
  and identity link in one persisted ledger operation.
- License numbers and emergency contacts are shared Individual fields. They
  are managed in Individuals, regardless of whether a person is an entrant,
  team member, official, or both.
- Individuals owns editable first name, surname, gender, date of birth,
  contact details, licenses, emergency contacts, and private notes. Existing
  catalog rider and team-member names and demographic fields
  prefill a newly linked Individual profile. The shared profile is the editing
  source for these attributes after linking.
- Entrants displays a rider's name read-only and edits event entry properties
  such as category, parent team, start order, identifiers, and entry notes.
  Officials selects an Individual and edits event/session positions,
  responsibilities, and assignment notes. Both areas provide a route to the
  person's details in Individuals. Motorsport Entry panels also show linked
  drivers read-only and route personal edits to Individuals.

## Requirements and design

### Directory and assignments

- Add a catalog-wide `OfficialProfile` collection serving as the shared
  Individual directory. A profile has stable ID, display name, email, phone,
  notes, archived flag, and audit metadata. Legacy profile availability,
  position, and responsibilities remain readable.
- Extend the shared profile with structured license records (number, optional
  type, issuer, and expiry date) and emergency contacts (name, phone, optional
  relationship and email). Keep these private details out of default official
  contact exports. Preserve legacy position and responsibility data on edit;
  new official roles and responsibilities are defined per assignment.
- Store first name, surname, gender, and date of birth on the shared profile.
  Derive its display name from first name and surname for new edits, while
  reading legacy single-name profiles. Show the first license number input
  without requiring an add-row action.
- An assignment availability slot has optional start/end ISO instants and one
  of `available` or `unavailable`; invalid ranges are rejected. It records
  scheduling availability only and does not change race timing.
- Add `OfficialAssignment` records with stable ID, official ID, event ID,
  optional session ID, position, role name, optional responsibility override,
  structured availability slots, and notes. An omitted session means
  event-wide. Multiple officials may share a role and one official may have
  many event-wide or session-specific assignments.
- Add immutable profile create/update/archive and assignment create/update/remove
  mutations, reducers, and Event Catalog service methods. Archive preserves
  profile/assignment history but prevents new assignments; unarchive is an
  explicit immutable update.
- Add immutable `individual-linked` and `individual-unlinked` mutations. The
  link stores a name snapshot for historical display and remains outside race
  state. An archived directory profile cannot receive a new link. Links are
  managed from Entrants and can refer to entrants in any event.
- Add an atomic create-profile-and-link service operation for an unlinked
  entrant or team member card. It appends both immutable mutations, persists
  once, rebuilds state, and invokes the configured upstream callback once.
- A person-field edit on a linked profile appends the profile mutation and
  affected entrant or team-member projection mutations in one catalog write.
  Linking to an existing profile also mirrors its known identity fields while
  preserving missing demographic values already held on an entrant.
- Validate official existence, event/session ownership, duplicate equivalent
  assignments, email/phone formats when provided, and availability ranges.

### Participants UI and outputs

- Add a MUI Individuals card directory with search, archive filtering, profile
  editor, license and emergency contact editors, and unlinked participant
  cards. Keep the card controls usable with touch and constrained width.
- Add a distinct Officials tab with event/session assignment editor, scoped
  assignment cards, search across assignable Individuals, and contact outputs.
  Official duties, including position and availability, are assigned to an
  existing Individual profile; this tab does not edit person details.
- Show and edit entrant or team-member membership links on the relevant
  Entrants screen. Do not duplicate membership editing in Officials.
- Keep personal attributes editable only in Individuals. Show a linked rider's
  current name read-only in Entrants and offer an Open Individuals action that
  selects the rider's profile or unlinked card. Motorsport Entry driver rows
  open the corresponding Individual. Officials offers Edit individual details
  for the selected profile.
- Use event and session dropdowns from the catalog rather than editable IDs.
  Show archived historical assignments with a clear archived label and prevent
  creating new ones from them.
- Put the Event dropdown above all three tabs and remove the duplicate Entrants
  and Officials event selectors. Preserve the Entrants unsaved-change warning
  when the shared Event selector or tab changes.
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
  event/session scoping, availability, identity links, and contact-list
  projection.
- Service tests prove every write persists, rebuilds catalog state, and invokes
  the configured upstream callback.
- UI integration-test create, edit, search, archive, many-to-many assignment,
  session filtering, and disabled assignment for archived profiles. Test the
  three-tab navigation, one shared Event selector, card selection, unlinked
  participant promotion, shared license/emergency fields, and membership
  linking from Entrants.
- Test that first name, surname, gender, date of birth, license number, and
  emergency contact edits persist in Individuals, remain after tab changes,
  and update linked rider/team-member display fields via one ledger operation.
  Verify Entrants does not expose editable person fields.
- Add regressions proving officials are excluded from entrant counts, session
  participants, start-list rows, grids, and result calculations. Identity links
  must also leave imported race state and entrant membership unchanged.
- Test print/CSV/PDF export content, field escaping, privacy layout selection,
  and no catalog mutation during export.

## Implementation checklist

- Extend Event Catalog types, mutations, reducers, persistence, and services.
- Add separate Participants > Individuals and Participants > Officials tabs,
  Entrants membership controls, and the shared contact export projection/PDF
  utility.
- Add the full service, UI, export, and race-exclusion test coverage; run
  TypeScript and lint checks.
