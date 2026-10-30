# RaceSweet feature implementation plan

This document is the working plan for the requested RaceSweet features. Each
feature should use the service and immutable ledger flows required by the
repository's `AGENTS.md` instructions, and include UI, persistence, and
integration coverage.

## 1. Manual timing entry

### Core timing workflow

- [ ] Add a **Manual Time Entry** view in the Timing context.
- [ ] Allow operators to choose an event, session, checkpoint, and
  entrant/transmitter.
- [ ] Support accurate crossing timestamps in the event's configured timezone.
- [ ] Validate duplicate crossings, invalid session assignments, and unknown
  transmitters.
- [ ] Persist valid entries as immutable Event Catalog ledger mutations and
  trigger crossing and result recalculation.
- [ ] Provide correction and reversal actions that append mutations instead of
  changing historical records.

### Mobile quick-entry workflow

- [ ] Provide a mobile-first, full-screen **Quick Entry** mode in Timing.
- [ ] Display one prominent focused entry field and a large MUI numeric keypad.
- [ ] Allow operators to switch to alphabetic input for identifiers that
  contain letters.
- [ ] Optimize for rapid one-handed operation with large touch targets and a
  submit/next-entry flow.
- [ ] Associate every entry with the selected event, session, checkpoint, and
  locally captured timestamp.

### Offline cache and API delivery

- [ ] Write submitted crossings to a durable local outbox/cache before an API
  delivery attempt.
- [ ] Push queued crossings to the timing API endpoint whenever connectivity is
  available.
- [ ] Retain entries until the server explicitly confirms that it accepted the
  crossing.
- [ ] Recover pending entries after a network interruption, renderer reload, or
  application restart.
- [ ] Give each crossing a client-generated ID/idempotency key so retries cannot
  create duplicate server crossings.
- [ ] Surface clear entry states: draft, queued, sending, accepted, rejected,
  and needs attention.
- [ ] Retain rejected source records so operators can correct and resubmit them
  using ledger-safe mutations.

### Voice entry

- [ ] Add mobile voice activation using device speech recognition.
- [ ] Parse spoken numeric identifiers into the same Quick Entry field used by
  the keypad.
- [ ] Support common spoken number forms, corrections, and operator confirmation
  before submission.
- [ ] Fall back cleanly when microphone permission or speech recognition is not
  available.
- [ ] Route voice-derived values through the same validation, local cache, API,
  and server-confirmation workflow as manually keyed values.

### Manual timing verification

- [ ] Add unit tests for validation, correction, reversal, and result
  recalculation.
- [ ] Add tests for keypad input, alphabetic switching, and mobile rendering.
- [ ] Add tests for offline queueing, retry, idempotency, rejection, restart
  recovery, and acceptance confirmation.
- [ ] Add tests for speech-recognition parsing and unavailable-permission
  fallback.

## 2. Configurable display screens

- [ ] Add a **Display Screens** area in Reports for creating named remote
  display screens.
- [ ] Provide a component palette, initially including event title, clock,
  leaderboard, results table, sponsor image, and text panel.
- [ ] Build an admin-editable layout canvas for component position, size,
  settings, and calculated-data bindings.
- [ ] Persist display definitions and settings through the appropriate service
  layer and ledger flow.
- [ ] Provide a view mode that hides all editor and selection controls.
- [ ] Serve published screens through the web server for remote clients.
- [ ] Provide preview, publish/unpublish, and access-control behaviour.
- [ ] Test layout persistence, calculated-data updates, edit and view modes,
  and remote screen rendering.

## 3. Event replay mode

- [x] Add an **Event Replay** area in Reports.
- [x] Allow selection of a completed or active event/session as a replay source.
- [x] Expose a socket endpoint for remote clients to subscribe to event data.
- [x] Support live forwarding, real-time replay, and configurable accelerated
  replay speeds.
- [x] Replay events using intervals derived from the recorded race data and
  scaled by the selected speed.
- [ ] Define socket messages for connection, snapshot, replay state, race
  update, seek/reset, completion, and error.
- [x] Send a current-state snapshot to clients that join during a replay.
- [x] Provide controls for start, pause, resume, reset, speed, and selected data
  stream.
- [x] Test ordering, timing, speed scaling, late subscribers, reconnection, and
  replay completion.

## 4. Officials

- [ ] Add an **Officials** area to the Participants context.
- [ ] Model officials separately from entrants.
- [ ] Capture name, contact details, position, responsibilities, notes, and
  availability.
- [ ] Allow event-wide and session-specific role assignments.
- [ ] Support search, edit, archive, and printable/exportable contact lists.
- [ ] Persist every change through Event Catalog ledger mutations and configured
  upstream callbacks.
- [ ] Ensure officials never appear in entrant counts, start lists, grids, or
  results calculations.
- [ ] Test creation, assignment, persistence, event scoping, and exclusion from
  race calculations.

## 5. Start lists and grids

- [ ] Add a **Start Lists & Grids** area in Reports.
- [ ] Derive report data from sessions, categories, entrants, start assignments,
  and grid positions.
- [ ] Support filtering by event, session, category, and start group.
- [ ] Offer layouts for a traditional start list, race grid, and compact marshal
  sheet.
- [ ] Include entrant number, name, team, category, class, grid/start position,
  and timing/transmitter details when available.
- [ ] Provide print-friendly output and export support.
- [ ] Update reports when source Event Catalog data changes.
- [ ] Test derived ordering, missing data, filtering, printing, and export.

## Implementation guardrails

- [ ] Use MUI for all new interactive controls.
- [ ] Keep event, session, category, entrant, and race-data changes within their
  required service and immutable-ledger flows.
- [ ] Add unit and integration tests for each public feature path, including
  persistence and configured upstream callback effects.
- [ ] Update `src/app/restartVersion.ts` if a completed change requires a full
  application-process restart.
