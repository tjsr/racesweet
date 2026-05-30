# RaceSweet Agent instructions

## Typescript style

When writing Typescript, always prefer arrow functions over regular functions.

Imports should always be of ESModule format, and avoid require unless absolutely unavoidable.

Imports should be sorted alphabetically.

## Data mutation and persistence

Any instruction that changes race data must be implemented through the admin service layer and must be persisted immediately.

Do not perform direct in-memory admin mutations from UI/controller code paths without going through the service persistence flow.

Persisted administrative changes must be reapplied on load so client-visible state reflects previous edits.

Event and session metadata changes must go through the event catalog service layer, append immutable ledger mutations, persist immediately, and rebuild active-event state from the stored ledger on load.

Event-scoped screens such as Events, Entrants, Categories, and Sessions should derive their current context from the active event rather than maintaining separate competing sources of truth.

System-wide data source configuration must be persisted through the system config service layer (not transient UI-only state), including source definitions, event assignments, and per-session assignment mode.

Session data-source assignment supports default event-wide source selection or specific per-session overrides; when applying session sources, imported data should be pushed into the active race state so crossings/results are recalculated.

Apical API source flows should authenticate first using configured auth headers, then query the available event list, then pull event data for configured event IDs with configured timeout/poll settings.

Category metadata in the event catalog should store structured rules (distance mode, team-size/age/gender composition constraints, and per-session start assignments) instead of free-form or UI-only state.

Category starts are session-linked and may include multiple session assignments per category.

Entrant/category scaffolding should be derived from imported event data IDs when available (participant entrantId/categoryId), not from synthetic broad assignment.

Persisted catalog mutations that affect entrant/category/session structure should continue to support push-back via the configured event-catalog upstream callback.

The Events page right pane is a session summary list view; session editing belongs in the Sessions page.

## Tests

Unit tests should always be written for all code.  Integration tests should in some way at least cover all code once over, but are permitted to assert multiple conditions or flows within a single test.

Where possible, unit tests should mock out expensive operations.

## Ledger data format

Remember that all data and modifications should occur in a ledger format, where modifications are an action and all previous data is immutable.  State becomes modified by instructions in sequence over time, and once modified never changes.  If we change an entrants category or name for example, the original information will not change but we log a change in the event data to indicate that it has to be updated.  That update is then reflected in the model.

These changes are sent either by the server as an update to all clients, or stored in the event log when the data is persisted locally.  Every update event is sent to the controller, which will write that log entry to disk, and may also push that event to the server responsible for handling the event.