# Manual timing operator workflow and durable delivery

**Status:** Planned. This completes the user-facing feature built on the
implemented catalog and ingestion foundation in
[01-manual-timing-entry.md](01-manual-timing-entry.md).

## Purpose and acceptance criteria

Let an operator record, review, correct, reverse, and reconcile crossings from
Timing on desktop or mobile. Entries must survive disconnection and application
restart, reach the timing API without duplicate facts, and remain auditable in
the Event Catalog ledger.

Acceptance requires one shared MUI entry workflow across viewport sizes,
editable event-local timestamps with daylight-saving choices, exact identifier
resolution, a durable crossing outbox, explicit delivery states, correction and
reversal actions, unknown-transmitter review, and voice input with confirmation
and a nonblocking fallback. A scored accepted crossing must update the normal
crossing and result calculations.

## Preconditions and dependencies

- Spec 01 supplies the crossing model, immutable record/correct/reverse
  mutations, Event Catalog service methods, race-state overlay, and authenticated
  idempotent recording endpoint.
- Timing already owns event/session selection and recent-record presentation.
  The operator UI must reuse that context rather than create competing active
  event/session state.
- The catalog replica outbox synchronizes immutable mutations. The crossing
  delivery outbox specified here is a separate client record of timing API
  acknowledgements; both paths must use the same crossing and mutation IDs.
- The selected event timezone and configured session checkpoints must be
  available before a crossing can be scored.

## Resolved decisions and implementation questions

- **One UI:** desktop entry and full-screen Quick Entry use the same React
  fields, validation, submission handler, and status model. Responsive layout
  changes placement and control size, not behavior or persistence.
- **Storage:** use a typed outbox persistence interface backed by IndexedDB in
  web clients and an atomic JSON file beside the existing replica outbox in
  Electron. Recover and validate stored items on startup.
- **Timestamp:** enumerate instants matching the event-local date and time.
  Reject nonexistent daylight-saving times; require the operator to choose the
  earlier or later instant when two match. Pass the chosen ISO instant and local
  context to the existing service validator.
- **Identifier resolution:** perform exact normalized lookup within the chosen
  event and session. Never guess among multiple eligible matches. An unmatched
  transmitter becomes an unscored `needs-attention` crossing. Ambiguous matches
  require operator selection before scoring.
- **API contract:** retain the single-crossing ingestion endpoint. Extend its
  validation response with a stable `rejected` code and operator-safe reason;
  keep `accepted`, `already-accepted`, and conflict semantics. Correction,
  reversal, and reconciliation use authenticated `race:write` commands that
  append the existing ledger mutations through `EventCatalogService`.
- **Voice:** speech recognition only proposes text in the shared identifier
  field. The operator confirms the parsed value before the normal Submit action.

## Requirements and specifications

### Entry and review UI

- Add a Manual Time Entry area within Timing. Show event, session, configured
  checkpoint/line and loop, entrant or identifier, event-local date and time,
  resolved identity, and current delivery status.
- Use catalog-backed MUI selectors for event, session, checkpoint, and eligible
  entrant. Display names and numbers, not editable raw IDs. Filter each choice
  by the selected parent context.
- Entered identifiers support entrant number, transmitter, plate, and chip.
  Normalize surrounding whitespace and case for matching while retaining the
  operator's original input in the crossing. A scored record requires exactly
  one eligible catalog identity.
- Extend the immutable crossing payload with operator-visible source metadata:
  entry method (`keyboard`, `keypad`, or `voice`), capture instant, and optional
  operator/device label. Corrections retain the original mutation and its
  metadata for audit.
- Validate missing context, malformed or ambiguous local time, invalid
  checkpoint, duplicate effective crossing, and session membership before
  submission. Show the existing crossing when a duplicate is found and offer
  correction or reversal, never a second scored crossing.
- Provide a review list for `needs-attention`, rejected, queued, and accepted
  manual records. Correction edits a complete replacement payload; reversal
  asks for an optional reason; reconciliation selects an eligible identity.
  Every action appends a mutation through the service and preserves history.

### Quick Entry and speech

- Quick Entry is a full-screen responsive Timing mode with one prominent MUI
  identifier field, large numeric keypad, alphabetic toggle, context summary,
  editable timestamp fields, and Submit/Next. Touch targets are at least 48px.
- Submit/Next keeps the event, session, checkpoint, and input mode, clears the
  identifier, and initializes the next editable timestamp to the current event
  time. It never silently reuses the previous captured instant.
- Put browser speech recognition behind a typed adapter. Parse spoken digits,
  common number forms, and corrections into the same input value used by text
  and keypad entry. Display the proposed value and require explicit confirmation
  before submission.
- Unsupported speech APIs, denied microphone permission, and recognition errors
  leave keypad and keyboard entry fully usable and show a local explanation.
  No partial transcript enters the ledger or outbox.

### Durable local outbox and delivery

- A `ManualCrossingOutboxItem` holds the stable crossing and mutation IDs,
  serialized submission, action kind, status (`draft`, `queued`, `sending`,
  `accepted`, `rejected`, or `needs-attention`), attempt count, next retry time,
  last error, and server acknowledgement when present.
- Persist a `draft` outbox item before any network call. Append the local
  mutation through `EventCatalogService`, then persist `queued` status before
  sending. Startup recovery compares a draft item with the ledger by mutation
  ID and safely completes or reports an interrupted local write.
- The configured catalog replica callback continues to enqueue the same
  mutation. Direct timing delivery and replica synchronization must use the
  identical IDs so either arrival order produces one effective crossing.
- Retry queued and transiently failed items after restart, renderer reload,
  reconnect, and explicit Retry. Serialize attempts per item, use bounded
  backoff, and treat `already-accepted` as an acknowledgement.
- Retain the item and its reason after server rejection or conflict. A
  correction, reversal, or reconciliation appends a new immutable action and
  updates the review state without deleting the rejected source fact.
- Show draft, queued, sending, accepted, rejected, and needs-attention states
  in the UI. Only an explicit server acknowledgement marks direct timing
  delivery accepted; local persistence alone must not be shown as acceptance.

### API and synchronization refinement

- Add authenticated `race:write` correction, reversal, and reconciliation
  commands, or extend the existing mutation command endpoint with typed manual
  action payloads. Each command must call the corresponding catalog service
  method and publish the resulting mutation through the configured callback.
  Extend those service methods to accept caller-supplied mutation IDs for
  idempotent retries, as recording already does.
- Return stable per-action acceptance or rejection information, including a
  safe reason for validation failure. Keep request IDs and mutation IDs stable
  across retries; reject an ID reused with a different payload.
- When a direct API acknowledgement arrives before the replica callback, and
  when the replica arrives first, rebuilding the catalog must still yield one
  effective crossing and one audit mutation per action ID.

## Failure handling

- A network failure preserves the local mutation and outbox item and moves the
  item back to queued with an error and retry time.
- A server rejection preserves the source and allows correction, reversal, or
  retry after the operator resolves the stated cause.
- Corrupt stored outbox items are quarantined and reported individually without
  preventing other Timing operations or valid queued items from loading.
- A failed local ledger write never sends the entry. A failed outbox write
  blocks delivery and shows an actionable persistence error.
- The UI never scores unknown, ambiguous, reversed, or rejected crossings by
  inference. Speech errors and permission failures never block manual entry.

## Extra tests

- Unit-test identifier normalization and event/session scoping, duplicate
  presentation, timezone parsing across daylight-saving gaps and repeated
  times, keypad and alphabetic input, spoken-number parsing, and confirmation.
- Test the outbox interface and both storage adapters for persist-before-send,
  interrupted draft recovery, restart/reload recovery, retry backoff,
  acknowledgement, rejection retention, and corrupt-item isolation.
- Service and API tests must cover correction/reversal/reconciliation commands,
  configured upstream callbacks, idempotent retries, same-ID conflicts, and
  direct-versus-replica arrival in both orders.
- UI integrations must submit a crossing from desktop and 360px Quick Entry,
  verify its service/ledger and API effects, edit the timestamp, switch input
  mode, use Submit/Next, review an unknown transmitter, correct/reverse a
  record, and recover after disconnect and restart.
- Test microphone denial and unsupported speech recognition with a working
  keypad/text fallback. Include a two-event fixture proving identifier lookup
  and review actions never leak an entrant from another event.

## Implementation checklist

- [ ] Build shared Timing entry and review components with responsive Quick
      Entry presentation.
- [ ] Add exact scoped identifier resolution and event-local timestamp chooser.
- [ ] Add durable web and Electron outbox adapters and recovery orchestration.
- [ ] Wire direct timing delivery to catalog replica synchronization using the
      same stable IDs.
- [ ] Add authenticated correction, reversal, and reconciliation commands and
      structured rejection responses.
- [ ] Add speech adapter, explicit confirmation, and manual fallback.
- [ ] Add unit, UI, service, persistence, API, and restart regressions; run
      Vitest, TypeScript, lint, and build checks.
