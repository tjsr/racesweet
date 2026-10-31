# Mobile-responsive administration controls

## Purpose and acceptance criteria

Make RaceSweet administration practical on phones and tablets without creating
parallel desktop and mobile interfaces. The first delivery covers the controls
used to enter and configure event, session, category, entrant, and data-source
information. Every control must have one shared state, validation, service
action, and persistence path regardless of viewport or input method.

The feature is accepted when the Events, Sessions, Categories, Entrants, and
System data-source configuration flows can be completed on a 360px-wide touch
device and a desktop browser using the same React control implementations. All
writes must still use their existing service and immutable-ledger or system
configuration flows, including upstream callbacks where applicable.

## Current state and preconditions

- `events-layout` is a three-column desktop grid and currently collapses to a
  single column below 980px. It does not provide list-to-detail mobile
  navigation or a touch-specific action hierarchy.
- Events, Sessions, Categories, Entrants, and System data-source panels already
  contain the required business flows, draft state, unsaved-change warnings, and
  service callbacks. These flows are the source of truth and must not be
  duplicated in a mobile component.
- The application already uses MUI for many controls, but several administration
  panels still include raw interactive selects, checkboxes, radios, inputs, and
  textareas. Existing hidden native selects used as testing workarounds must be
  removed when the corresponding shared MUI control is adopted.
- `SessionCategoriesPanel` uses HTML drag-and-drop and hover-only affordances.
  It is not sufficient for touch or keyboard reordering.
- The section navigation is a persistent tile rail. On a narrow viewport it
  leaves too little width for forms and needs a responsive presentation.

## Resolved decisions and implementation questions

- **Single-interface rule:** do not add `MobileEventsPage`, mobile-only forms,
  duplicate hidden inputs, or separate mobile persistence handlers. Shared
  components may change layout or presentation at a breakpoint but consume the
  same props, draft state, validation, and callbacks.
- **Responsive thresholds:** phone is below 600px, tablet is 600px through
  959px, and desktop is 960px and wider. Use the same shared MUI theme breakpoints
  in CSS and `useMediaQuery`; do not scatter unrelated pixel values.
- **Control library:** standardize on MUI. The hidden native file input is the
  only permitted raw input because browsers require it for file picking; it must
  be triggered and described by a MUI button/field.
- **Ordering:** replace hand-written HTML5 drag handling with one reorderable
  list implementation that supports pointer, touch, and keyboard sensors. The
  selected library and any new dependency must be evaluated for React 19 and
  current TypeScript compatibility before adoption.
- **Persistence:** this is a renderer/UI refactor. It does not change Event
  Catalog mutation semantics, service methods, system configuration persistence,
  or data formats. A restart-version update is not expected unless implementation
  introduces a process-start-only dependency.

## Requirements and design

### Shared responsive primitives

- Create `AdminMasterDetailLayout` for list/detail administration screens. It
  receives one list React node, one detail React node, selected-item metadata,
  and a selection/back callback. It renders side-by-side panes at desktop width;
  at phone and tablet widths it displays the same panes one at a time. Selecting
  an item moves to the existing detail pane and Back returns to the existing
  list pane without clearing the draft or unsaved-change guard.
- Create `AdminFormSection` and `AdminFieldGrid`. They provide labelled sections,
  consistent vertical spacing, full-width fields below 600px, and one/two-column
  field placement at larger widths. Fields remain in logical reading/tab order
  when the visual grid changes.
- Create `AdminActionBar` for save, activate/apply, and destructive actions.
  It wraps on desktop and tablet, stacks primary actions first on phones, and is
  sticky at the bottom of the detail pane on phones. It includes safe-area inset
  padding, pending/success/error status, and never obscures the final field.
- Create `AdminSelectField` as the standard MUI select control for finite option
  sets and `AdminAutocompleteField` for long searchable lists. Both expose one
  accessible label, one value, one change handler, 48px minimum touch target,
  helper/error text, and no shadow native select used only for tests.
- Create `AdminChoiceGroup` from MUI Checkbox, RadioGroup, Switch, or
  ToggleButtonGroup as appropriate. It replaces native checkbox/radio choices,
  uses clear labels, and makes the complete label touchable.
- Create `ResponsiveDataList` from one row data model. Its rows use desktop
  column layout and phone labelled stacked layout through CSS, rather than a
  separate table and card renderer. Horizontal scrolling is allowed only for
  read-only data that cannot reasonably be summarized.
- Create `ResponsiveDialog` and responsive Section Navigation. Both own a
  single item/action model: dialogs become full-screen on phones, and the
  section rail becomes a temporary MUI drawer on phones. The selected section,
  labels, permissions, and navigation callbacks remain shared.

### Touch, keyboard, and layout rules

- All interactive targets must be at least 48px in both dimensions or have a
  48px touchable container. Icon-only actions require visible tooltip-on-focus
  and an accessible name.
- Do not make an action reachable only by hover, context menu, mouse drag, or
  a narrow table column. Pointer actions must have keyboard equivalents and
  screen-reader status announcements.
- Use `inputMode`, `type`, autocomplete hints, and appropriate MUI field props
  for numeric identifiers, dates, times, URLs, email, and free text. Date/time
  entry must preserve existing event-timezone handling.
- Use accordions or progressive disclosure for long data-source forms. Sections
  with validation errors automatically reveal their error summary, but no section
  collapses while it contains focused input or unsaved invalid changes.
- Preserve normal browser zoom and do not use a font size below 16px for editable
  phone inputs. Maintain visible focus states and sufficient contrast in light
  and dark themes.

### Reordering and dense configuration

- Create `ReorderableAdminList` with a single ordered item collection and
  `onReorder` callback. It supports pointer drag, touch drag, keyboard lift/move/
  drop, accessible position announcements, and always-visible Move up/Move down
  fallback buttons for compact phone use.
- Migrate session category/start-wave ordering to this component. Add a visible
  Add start wave action instead of relying on hover-only drop zones; preserve
  current start-sequence validation before saving.
- Replace data-source configuration tables and raw form controls with MUI fields,
  choice groups, `ResponsiveDataList`, and section accordions. File selection
  continues to use the shared `FileSelectionField` with its hidden native file
  input as the sole browser-required exception.

### Page migration sequence

1. Build the responsive primitives and global theme/CSS tokens, then migrate
   section navigation and unsaved-changes dialogs.
2. Migrate Events: event list/detail layout, event details form, event source
   assignments, track-map controls, and actions.
3. Migrate Sessions: selector, list/detail layout, session details, source
   assignments, category assignments, and start-sequence ordering.
4. Migrate Categories and Entrants: lists, detail forms, identifier/entry
   controls, multi-select assignment, batch actions, and destructive controls.
5. Migrate System data-source configuration: source type selection, every raw
   configuration choice/field, file controls, and dense decoder/source lists.

Every migration preserves existing component/service callbacks. Page-level
components compose shared primitives; they do not fork by platform or write to
catalog/system state directly.

## Failure handling

- Unsaved changes survive list/detail pane transitions, orientation changes, and
  responsive breakpoint changes. Existing warning dialogs remain the sole save,
  discard, or cancel decision point.
- A failed save keeps the user on the same detail pane, preserves its draft,
  focuses or links to the actionable error, and does not silently navigate back.
- Touch reordering failures restore the last persisted ordering and announce the
  result. Invalid start sequences never reach the Event Catalog service.
- The app remains usable when CSS media queries, pointer sensors, clipboard, or
  file-picker capabilities are unavailable: controls retain keyboard/text
  fallbacks and show a local explanatory error where needed.

## Test plan

- Unit-test each shared primitive’s prop contract, breakpoint selection, focus
  order, touch-target classes, validation/error rendering, and action-bar state.
- Test `AdminMasterDetailLayout` at 360px, 600px, 768px, 960px, and 1280px;
  verify selecting/backing does not unmount or reset form draft state.
- Test responsive navigation drawer/rail behavior, full-screen dialogs, sticky
  action-bar safe-area styles, and light/dark focus visibility.
- Add pointer, touch, and keyboard integration tests for `ReorderableAdminList`,
  including start-wave insertion, reordering, cancellation, announcements, and
  persisted `startSequence` service effects.
- Add page integrations for Events, Sessions, Categories, Entrants, and System
  data sources at phone, tablet, and desktop widths. Each must perform a real UI
  edit and assert the existing service/persistence callback was invoked exactly
  as it is on desktop.
- Add regressions that fail if migrated panels render raw visible input, select,
  textarea, checkbox, radio, or button elements instead of MUI controls. Permit
  only the documented hidden file input.
- Run the relevant Vitest suites, `npm run lint`, TypeScript checks, and the
  repository Markdown lint command if it becomes available.

## Implementation checklist

- Inventory every visible administration control and map it to a shared
  responsive primitive before migration begins.
- Add shared responsive components, theme breakpoints, and CSS tokens with unit
  coverage before changing page behavior.
- Migrate pages in the specified order, retaining service boundaries and adding
  page regression coverage at each step.
- Remove obsolete raw controls, hidden duplicate selects, hover-only interactions,
  and superseded CSS only after their shared replacements are covered by tests.
- Confirm no full application-process restart is needed; update
  `src/app/restartVersion.ts` only if implementation proves otherwise.
