# RaceSweet Agent instructions

## Typescript style

When writing Typescript, always prefer arrow functions over regular functions.  Always strongly type variables, never allow implicity 'any' types.

Imports should always be of ESModule format, and avoid require unless absolutely unavoidable.

Imports should be sorted alphabetically using our Prettier rules.

## Project structure

Place all files in the following locations:

- src: Shared utilities, constants, or helpers used by two or more other modules and not specific to any single layer. If a file is only used within one layer, place it in that layer's folder.  
- src\app: Code relating to the electron app including IPC definitions and security objects only used in app mode.
- src\controller: Code for updating application state and calling endpoints.
- src\state: State management stores.  
- src\views: All UI-related code.  
- src\views\[context]: Controls that appear within any given context.
- src\views\context: Top-level view context panes.
- src\model: Data model and object definition.

## Data mutation and persistence

Use the following table to determine how to persist changes. Each data type specifies the required service layer, whether an immutable ledger mutation is required, whether the state must be rebuilt from the ledger, and whether an upstream callback must fire:

| Data Type | Service Layer | Persist Immediately | Ledger Mutation | State Rebuild | Upstream Callback | Notes |
|-----------|---------------|-------------------|-----------------|----------------|-------------------|-------|
| Race admin (entrant/category properties) | `RaceAdminService` | Yes | No | No | No | Do not perform direct in-memory mutations from UI/controller; go through service layer. Reapply on load. |
| Event & session metadata | `EventCatalogService` | Yes | Yes (immutable) | Yes (rebuild active-event) | Yes (configured callback) | Append immutable ledger mutations, persist, rebuild state from ledger on load. |
| Event/category/session UI displays | `EventCatalogService` | Via parent operation | Derived | Derived | Derived | Use scoped selectors and read-only summaries; do not expose raw IDs as editable fields when app can provide dropdown/multi-select. |
| Entrant category assignment | `EventCatalogService` | Yes | Yes | Yes | Yes | Primary category in `categoryId`, mirror in `categoryIds` for single-category edits. Team membership via `teamEntrantId`. |
| System data source config | `SystemConfigService` | Yes | No | No | No | Includes source definitions, event assignments, per-session overrides; not transient UI-only state. |
| Session source assignment | `EventCatalogService` + source import | Yes | Yes | Yes (recalc crossings/results) | Yes | Supports default event-wide or per-session override. Push imported data into active race state. |
| Apical API event data | External API + `EventCatalogService` | Yes | Yes | Yes | Yes | Authenticate with configured headers, query event list, pull event data for configured IDs with timeout/poll. |
| Apical Excel import | File parser + `EventCatalogService` | Yes | Yes | Yes | Yes | Preserve Laps sheet `TimeOfDay` for crossing timestamps (combine with session/event date). Do not use `LapTimeSpan` or `CumulativeLapTimeSpan`. |
| Timezone for local times | `EventCatalogService` | Yes | Yes | Yes | Yes | Parse local times in event timezone. New events default to system timezone. Persist timezone in event catalog ledger. |
| Category metadata (rules) | `EventCatalogService` | Yes | Yes | Yes | Yes | Store structured rules (distance mode, team-size/age/gender constraints, per-session start assignments), not free-form state. |
| Category starts | `EventCatalogService` | Yes | Yes | Yes | Yes | Session-linked; may have multiple per-session assignments. |
| Entrant/category scaffolding | `EventCatalogService` | Yes | Yes | Yes | Yes | Derive from imported event data IDs (participant entrantId/categoryId), not synthetic broad assignment. Catalog mutations must support push-back via upstream callback. |
| Event scoped screens | `EventCatalogService` | See data type | See data type | See data type | See data type | Events, Entrants, Categories, Sessions must derive context from active event, not separate competing sources. Session editing is in Sessions page, not Events page right pane (summary only). |

**General principle**: All changes to event, category, session, entrant structure or race data must write through the appropriate service layer in the table above. Do not bypass ledger mutation, persistence, or configured callbacks for any data type.

## Tests

Unit tests should always be written for all code. Integration tests must invoke every public function or exported module at least once, either directly or as part of a higher-level flow, and are permitted to assert multiple conditions or flows within a single test.

Where possible, unit tests should mock out expensive operations.

When adding new user-facing features, update or add the relevant unit and integration tests in the same change. Tests must verify both the UI action and the service/persistence side effect, including any configured upstream/API callback when a feature writes event catalog data.

Feature work that creates or changes events, sessions, categories, entrants, data sources, or race data must update state only through the appropriate service layer. Do not add UI-only state changes that bypass ledger mutation, persistence, or the configured API/upstream callback.

A job is failed if any Vitest test fails. Existing test failures must be fixed before handoff, not treated as acceptable background noise unless there is a clearly documented external blocker. An external blocker is one where the root cause is a dependency, environment, or upstream service outside this repository, is documented in an issue or comment in the codebase, and cannot be resolved by changes within this repository. If uncertain, treat the failure as fixable and attempt to resolve it.

Agents must solve existing code failures so the project passes relevant Vitest tests, TypeScript checks, and lint checks before reporting completion. See Initial checks for the `npm i` policy to ensure dependencies are available before running tests or lint.

All Markdown files must pass the repository's Markdown lint checks. When adding or editing Markdown, run the relevant Markdown lint command before handoff and fix any reported issues. If the Markdown lint command is not available or cannot be run, document this as a known gap in the handoff notes. If lint errors cannot be resolved automatically, enumerate them explicitly in the handoff so the next agent or reviewer can address them.

## Ledger data format

Remember that all data and modifications should occur in a ledger format, where modifications are an action and all previous data is immutable.  State becomes modified by instructions in sequence over time, and once modified never changes.  If we change an entrants category or name for example, the original information will not change but we log a change in the event data to indicate that it has to be updated.  That update is then reflected in the model.

These changes are sent either by the server as an update to all clients, or stored in the event log when the data is persisted locally.  Every update event is sent to the controller, which will write that log entry to disk, and may also push that event to the server responsible for handling the event.
