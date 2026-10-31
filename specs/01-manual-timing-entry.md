# Manual timing entry

## Purpose and acceptance criteria

Provide an operator-facing manual timing workflow in the Timing context. It
must record a crossing safely when disconnected, use the event timezone for
all entered local timestamps, reach the RaceSweet timing API without duplicate
delivery, and remain auditable after a correction or reversal.

The feature is accepted when an operator can select an event, session,
checkpoint, and entrant or transmitter; submit from desktop or mobile; see its
delivery state; and later correct or reverse the entry without changing the
original timing fact. Valid scored records must trigger the normal crossing and
result recalculation path. Unknown transmitters must remain visible but must
not affect calculated results until they are reconciled.

## Current state and preconditions

- `TimingContext` and `RecentRecords` already select event/session and add or
  edit timing records. `buildManualPassingRecord` supplies a useful starting
  record builder but is not a complete durable workflow.
- `EventCatalogService`, `EventCatalogLedger`, the local catalog persistence,
  and `CatalogReplicaOutbox` already provide immutable catalog replication.
- The application server already authenticates timing writes and serves the
  replica mutation endpoint. The new timing ingestion endpoint must use the
  same authorization and command serialization boundaries.
- Event timezone is held by `EventCatalogEvent.timeZone`; sessions and timing
  lines must exist before an entry may be scored.

## Resolved decisions and implementation questions

- **Delivery:** use both the durable catalog replica path and a dedicated
  idempotent timing-ingestion API, sharing crossing and mutation IDs.
- **Unknown transmitters:** retain them as unscored `needs-attention` records
  for later reconciliation rather than blocking or guessing a match.
- **Timestamp entry:** show editable event-local date/time fields on initial
  entry as well as during correction.

## Requirements and design

### Ledger and service contract

- Add three Event Catalog mutation variants: `manual-crossing-recorded`,
  `manual-crossing-corrected`, and `manual-crossing-reversed`.
- A recorded mutation contains a client-generated crossing ID, its source
  mutation ID, event/session/line/loop IDs or numbers, entered timestamp,
  resolved participant/entrant IDs when known, transmitter/plate input,
  scoring status, and operator-visible source metadata.
- A correction contains the original crossing ID and a complete replacement
  payload. A reversal contains the original crossing ID and an optional reason.
  Neither mutation changes or deletes a prior mutation.
- Add explicit service methods to create, correct, reverse, and reconcile a
  manual crossing. They append ledger mutations, persist first, rebuild the
  affected active event/session state, and run the configured upstream callback.
  UI components must call only these service methods.
- Reducer/replay rules derive one effective record per crossing ID: the latest
  correction replaces the effective values; a reversal makes it excluded. The
  history remains available for audit display.

### Entry and validation

- Add a MUI Manual Time Entry view under Timing. Its required context fields
  are event, session, checkpoint/line, and one identifier (entrant, transmitter,
  plate, or chip). Event and session use existing scoped selectors.
- Provide editable local date and time fields on every entry. Parse them in the
  selected event timezone, reject impossible DST-local times, and show an
  explicit ambiguity choice for repeated DST times. Persist an ISO instant plus
  the submitted local-zone context.
- Match identifiers only within the selected event and allowed session
  assignment. Reject missing context, malformed timestamp, invalid line/loop,
  duplicate effective crossing, and entrant/session mismatch.
- A transmitter with no eligible match is accepted as `needs-attention` and
  `unscored`; it is not rejected, matched heuristically, or included in result
  calculations. Reconciliation chooses an eligible entrant/transmitter and
  appends a correction.
- Detect duplicates by event, session, checkpoint, effective timestamp, and
  normalized identifier. Show the existing record and require a correction or
  reversal path rather than creating a second scored crossing.

### Mobile quick entry and voice

- Quick Entry is a full-screen responsive Timing mode with one focused MUI text
  field, large MUI numeric keypad buttons, an alphabetic toggle, context
  summary, timestamp fields, and Submit/Next. All controls have touch targets
  suitable for one-handed use.
- The next entry preserves event, session, checkpoint, and input mode while
  clearing the submitted identifier. It captures the current event-zone time
  as the initial value but keeps the timestamp editable.
- Use browser speech recognition only behind an adapter. Convert supported
  spoken digits and common corrections into the same Quick Entry field; require
  operator confirmation before submit. Missing permission, unsupported APIs,
  and recognition failure leave keypad/text entry usable and show a nonblocking
  explanation.

### Durable delivery and status

- Persist a `ManualCrossingOutboxItem` before any network attempt. It contains
  the stable client crossing ID, originating mutation ID, serialized submission,
  retry metadata, last error, and one of `draft`, `queued`, `sending`,
  `accepted`, `rejected`, or `needs-attention`.
- Use a dedicated authenticated, idempotent timing-ingestion endpoint. The
  request includes the client crossing ID and originating mutation ID as the
  idempotency key. The server accepts the mutation once, applies it through the
  catalog service, and returns per-item accepted/rejected status with a reason.
- Also enqueue the ledger mutation through the existing catalog replica outbox.
  Both paths use the same IDs so a direct API acknowledgement and a later
  replica push cannot create two records.
- Retry queued and transiently failed items on startup, renderer reload,
  reconnect, and explicit retry. Retain rejected items and their reasons until
  the operator corrects, reverses, or resubmits them. Do not remove an item
  until explicit server acknowledgement.

## Failure handling

- Network failure leaves the local persisted mutation and outbox item intact;
  it changes only delivery state.
- A server validation rejection must not discard the source record. Display the
  response, preserve audit history, and offer correction/reversal.
- State replay errors, malformed stored outbox data, and unavailable microphone
  access must be isolated to the affected entry and reported without blocking
  other Timing operations.

## Test plan

- Unit-test mutation reduction, correction/reversal history, duplicate rules,
  timezone/DST parsing, unknown-transmitter scoring exclusion, identifier
  normalization, and speech-number parsing.
- Test the outbox persistence and recovery sequence: persist-before-send,
  retry after failure, reload/restart recovery, idempotency, rejection
  retention, acknowledgement removal, and both direct and replica delivery.
- Add service tests proving each operation persists, rebuilds state, recalculates
  results, and invokes the configured upstream callback.
- Add server tests for endpoint authorization, malformed requests, duplicate
  idempotency keys, accepted items, and rejected items.
- Add UI integrations for desktop validation, mobile keypad/alphabetic mode,
  editable timestamps, Quick Entry next-entry behavior, correction/reversal,
  unknown-transmitter review, microphone denial, and service side effects.

## Implementation checklist

- Extend ledger schemas, state replay, Event Catalog service, and API models.
- Implement durable outbox persistence and its lifecycle wiring in the app.
- Implement the ingestion route and idempotency store using catalog mutation IDs.
- Build MUI desktop and mobile views, then add speech adapter support.
- Run focused Vitest suites, `npm run lint`, and the relevant TypeScript checks.
