# RaceSweet Agent instructions

## Branches

Always make sure when opening a terminal that we know firstly whether it is is a bash, powershell or cmd terminal first, then determine the version so that only commands and syntax valid for that format are attempted.

Then, whenever we create a new branch for an agent to work in, make sure the first thing we do is run `npm i` so that dependencies are installed.

## Typescript style

New agents should always run `npm i` before trying to run any kind of code or tests.

When writing Typescript, always prefer arrow functions over regular functions.

Imports should always be of ESModule format, and avoid require unless absolutely unavoidable.

Imports should be sorted alphabetically.

## Project structure

Place all files in the following locations:

- src: General source that doesn't fit in to any other below category.  
- src\app: Code relating to the electron app including IPC definitions and security objects only used in app mode.
- src\controller: Code for updating application state and calling endpoints.
- src\state: State management stores.  
- src\views: All UI-related code.  
- src\views\[context]: Controls that appear within any given context.
- src\views\context: Top-level view context panes.
- src\model: Data model and object definition.

## Data mutation and persistence

Any instruction that changes race data must be implemented through the admin service layer and must be persisted immediately.

Do not perform direct in-memory admin mutations from UI/controller code paths without going through the service persistence flow.

Persisted administrative changes must be reapplied on load so client-visible state reflects previous edits.

Event and session metadata changes must go through the event catalog service layer, append immutable ledger mutations, persist immediately, and rebuild active-event state from the stored ledger on load.

Event-scoped screens such as Events, Entrants, Categories, and Sessions should derive their current context from the active event rather than maintaining separate competing sources of truth.

Event catalog UI must prefer scoped selectors and read-only summaries over editable raw IDs. Do not expose event, category, session, entrant, or participant IDs as editable user fields when the app can provide an event-scoped dropdown, multi-select, or display label.

Entrant category editing uses `categoryId` as the primary category and mirrors `categoryIds` from that primary category for normal single-category rider/team edits. Team membership is represented on rider entrants using `teamEntrantId`.

Session, category, entrant, and event UI changes must write through `EventCatalogService` so immutable ledger mutations, file persistence, state rebuild, and configured upstream callbacks stay in the same flow.

System-wide data source configuration must be persisted through the system config service layer (not transient UI-only state), including source definitions, event assignments, and per-session assignment mode.

Session data-source assignment supports default event-wide source selection or specific per-session overrides; when applying session sources, imported data should be pushed into the active race state so crossings/results are recalculated.

Apical API source flows should authenticate first using configured auth headers, then query the available event list, then pull event data for configured event IDs with configured timeout/poll settings.

Apical Excel imports must preserve the Laps sheet `TimeOfDay` value through conversion and use it for crossing timestamps by combining it with the session/event date. Do not use `LapTimeSpan` or `CumulativeLapTimeSpan` as crossing timestamps; those fields are lap and elapsed durations.

Event and session imports that receive local clock times without an explicit timezone must parse those times in the event timezone. New events default to the system timezone, and saved events should persist that timezone through the event catalog ledger.

Category metadata in the event catalog should store structured rules (distance mode, team-size/age/gender composition constraints, and per-session start assignments) instead of free-form or UI-only state.

Category starts are session-linked and may include multiple session assignments per category.

Entrant/category scaffolding should be derived from imported event data IDs when available (participant entrantId/categoryId), not from synthetic broad assignment.

Persisted catalog mutations that affect entrant/category/session structure should continue to support push-back via the configured event-catalog upstream callback.

The Events page right pane is a session summary list view; session editing belongs in the Sessions page.

## Tests

Unit tests should always be written for all code.  Integration tests should in some way at least cover all code once over, but are permitted to assert multiple conditions or flows within a single test.

Where possible, unit tests should mock out expensive operations.

When adding new user-facing features, update or add the relevant unit and integration tests in the same change.  Tests must verify both the UI action and the service/persistence side effect, including any configured upstream/API callback when a feature writes event catalog data.

Feature work that creates or changes events, sessions, categories, entrants, data sources, or race data must update state only through the appropriate service layer.  Do not add UI-only state changes that bypass ledger mutation, persistence, or the configured API/upstream callback.

A job is failed if any Vitest test fails.  Existing test failures must be fixed before handoff, not treated as acceptable background noise unless there is a clearly documented external blocker.

Agents must solve existing code failures so the project passes relevant Vitest tests, TypeScript checks, and lint checks before reporting completion.

Run `npm i` before tests or lint whenever dependencies are missing, stale, or suspect.

All Markdown files must pass the repository's Markdown lint checks. When adding or editing Markdown, run the relevant Markdown lint command before handoff and fix any reported issues.

## Ledger data format

Remember that all data and modifications should occur in a ledger format, where modifications are an action and all previous data is immutable.  State becomes modified by instructions in sequence over time, and once modified never changes.  If we change an entrants category or name for example, the original information will not change but we log a change in the event data to indicate that it has to be updated.  That update is then reflected in the model.

These changes are sent either by the server as an update to all clients, or stored in the event log when the data is persisted locally.  Every update event is sent to the controller, which will write that log entry to disk, and may also push that event to the server responsible for handling the event.

## Local NPU agents

Check whether or not we have access to either a Qualcomm NPU agent or an own-hosted ollama model on an nVidia GPU.

When a task is small, read-only, and suitable for local inference, prefer the `qualcomm_npu` MCP tools if it is available on the local system.

Use the NPU tools for:
- Evaluating the output of command line tool output.
- summarizing test logs
- classifying known failure patterns
- ranking likely files to inspect
- extracting structured facts from local text

Do not use NPU tools for code edits, final decisions, or tasks requiring full repository reasoning unless the user explicitly asks.
