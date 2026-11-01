# Manual crossing catalog and ingestion foundation

**Status:** Implemented. This specification describes the delivered backend
foundation. The operator-facing and offline delivery work is tracked in
[07-manual-timing-operator-workflow.md](07-manual-timing-operator-workflow.md).

## Purpose and acceptance criteria

Store manually recorded crossings as auditable Event Catalog facts and accept
idempotent recording requests through an authenticated timing endpoint. A
correction or reversal appends a mutation; it does not overwrite the original.
Rebuilding the catalog produces one effective crossing per crossing ID, and
scored crossings appear in the session race state while unresolved or reversed
crossings remain excluded from calculations.

Acceptance for this foundation requires persistence and reload, immutable
record/correct/reverse mutations, service validation, a safe reconciliation
method, race-state integration, an authenticated idempotent recording endpoint,
and focused service and server tests. It does not imply an operator UI or
offline-safe client delivery.

## Preconditions and integration points

- `EventCatalogService` writes through the immutable Event Catalog ledger,
  persists it, rebuilds catalog state, and invokes its configured callback.
- Event, session, entrant, and participant relationships already exist in the
  catalog. Imported session race state is the base for effective manual records.
- The application server already enforces `race:write`, serializes commands,
  and publishes accepted catalog mutations to connected clients.

## Delivered requirements and specifications

### Catalog model and ledger

- `ManualCrossing` stores a stable crossing ID, event and session IDs,
  checkpoint line and optional loop, identifier kind and value, optional
  entrant and participant IDs, ISO instant, event-local date and time,
  timezone, and `scored` or `needs-attention` status.
- `manual-crossing-recorded`, `manual-crossing-corrected`, and
  `manual-crossing-reversed` are immutable Event Catalog mutations. A
  correction carries a complete replacement crossing with the same crossing
  ID. A reversal carries the ID and optional reason.
- Catalog replay derives the latest effective crossing, preserving the mutation
  history for audit. A reversal marks the effective crossing as reversed.

### Service and race-state behavior

- `recordManualCrossing`, `correctManualCrossing`,
  `reverseManualCrossing`, and `reconcileManualCrossing` write through
  `EventCatalogService` and the normal persistence/callback path.
- Validation checks event/session ownership, positive line and loop numbers,
  identifier and timestamp presence, consistency between the submitted ISO
  instant and event-local time, scored-record identity, entrant/participant
  membership, and duplicate effective crossings.
- Reconciliation appends a correction that associates a `needs-attention`
  crossing with an eligible entrant or participant and marks it scored.
- The session race-state overlay replaces any imported record with the same
  crossing ID. Reversed and `needs-attention` records remain visible as
  manually excluded records; scored records participate in normal calculations.

### Ingestion API

- `POST /api/v1/timing/manual-crossings` requires `race:write` and accepts one
  crossing with client crossing ID and mutation ID. IDs are UUIDs and are
  reused for idempotent retries.
- The server serializes the write, returns `accepted` or `already-accepted`
  for an identical ID/payload retry, and returns a conflict for an ID reused
  with different data. Accepted mutations are published to catalog clients;
  scored records also enter the existing live replay stream.
- The endpoint covers recording. Correction, reversal, and reconciliation are
  service methods; operator-facing API/client flows belong to spec 07.

## Resolved questions and scope boundary

- The catalog ledger is the durable source of crossing history.
- A `needs-attention` crossing is retained and unscored until reconciliation.
- The ingestion endpoint and catalog mutation use the same stable IDs to avoid
  a duplicate fact when a client retries.
- This foundation accepts an already resolved crossing payload. Identifier
  lookup, local-time ambiguity handling, and the operator's delivery state are
  part of spec 07.

## Failure handling

- Reject invalid event/session relationships, mismatched local timestamps,
  invalid membership, duplicate effective crossings, and conflicting IDs.
- A failed persistence write leaves the in-memory catalog unchanged.
- Keep unresolved and reversed source facts in the ledger for audit; exclude
  them from scoring.

## Verification and regression tests

- Service tests cover record/correct/reverse/reconcile, duplicate rejection,
  unknown-transmitter exclusion, persistence rollback, callback invocation,
  reload, and preservation across imported-state refresh.
- Server tests cover authorization, malformed requests, accepted recording,
  idempotent retry, and ID conflict. Request-parser and race-state overlay
  tests cover their exported behavior.
- Future changes to these contracts must retain the service, ledger, reload,
  and server regression coverage.

## Implementation checklist

- [x] Add crossing model and immutable ledger mutations.
- [x] Add Event Catalog service methods and effective-state replay.
- [x] Overlay effective records into session race state.
- [x] Add authenticated idempotent recording endpoint.
- [x] Add focused service, parser, projection, and server tests.
