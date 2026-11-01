# Event replay protocol, seeking, and subscriber experience

**Status:** Planned. This completes the replay feature on top of the
implemented SSE and control foundation in
[03-event-replay-mode.md](03-event-replay-mode.md).

## Purpose and acceptance criteria

Turn the existing replay transport into a stable, typed protocol that remote
clients and the Reports UI can consume. Add deterministic position and
timestamp seeking, an authoritative reconnect snapshot, complete lifecycle
and error reporting, and controls usable by any authorized operator.

Acceptance requires the event order and payloads below, both seek modes,
record ordering ties resolved by ID, connection and completion state in the UI,
safe failure behavior, and unit, contract, server, and UI tests. A read-only
subscriber must not gain replay control or mutate race data.

## Preconditions and dependencies

- Spec 03 provides `EventReplayHub`, authenticated SSE and HTTP routes,
  record sourcing from Event Catalog race state, live forwarding, basic
  controls, and a Reports control panel.
- Existing stream names (`replay-ready` and `race-record`) and payloads are
  private foundation details. Replace them in the same change as the hub,
  server, Reports subscriber, tests, and OpenAPI documentation. No protocol
  compatibility layer is required.
- Replay reads selected event/session records; it does not append catalog
  mutations. Server authorization already defines `race:read` and
  `race:write`.

## Resolved decisions and implementation questions

- **Transport:** keep SSE for subscription and HTTP for commands. Do not use
  WebSockets.
- **Stream identity:** a stream ID is bound to event, optional session, and
  mode. Reusing it with another binding is a conflict. Reconnection with the
  same binding returns the server's current state; a supplied speed does not
  silently change an existing stream.
- **Position:** `position` is the zero-based index of the next record to emit.
  Valid positions are 0 through `recordCount`, inclusive. The final position
  represents the end of the stream.
- **Timestamp:** a seek timestamp is an ISO-8601 instant with an explicit
  offset or `Z`. It selects the first sorted record at or after that instant;
  a timestamp after the final record selects `recordCount`.
- **Control authority:** any authenticated `race:write` user may control a
  known stream. A `race:read` user may subscribe but cannot control it.
- **Live snapshot:** a new live subscriber receives the current accepted
  records for its bound event/session as a snapshot. Later matching accepted
  records arrive only as updates. A reconnect replaces local display state
  from this authoritative snapshot.
- **Command order:** serialize controls for each stream so a seek cannot race
  a scheduled record or another writer's control command.

## Requirements and specifications

### Shared protocol model

- Export typed payloads from a shared model module used by hub, server,
  Reports client, and tests. Include a protocol version and a discriminated
  event-name union. Do not expose raw exceptions or internal catalog objects.
- Normalize each record to a stable ID, event ID, session ID, ISO timestamp,
  sequence, record type, and the accepted display fields needed by clients.
  Sort ascending by timestamp, then sequence, then stable record ID.
- `ReplayState` includes stream ID, selection, mode, status, speed, total
  record count, emitted count, next position, and server timestamp. The
  position and counts must agree after every control and emitted update.

### Subscription and event order

- `GET /api/v1/reports/replay` requires `race:read` and accepts `eventId`,
  optional `sessionId`, `mode` (`live` or `replay`), `speed`, and `streamId`.
  Validate query parameters and binding before sending SSE headers.
- Send `replay-connected` first with protocol version, stream ID, selection,
  mode, server timestamp, and current state. Then send `replay-snapshot`
  containing the authoritative visible records and full state, followed by
  `replay-state`. A late or reconnecting subscriber receives this same order
  before any subsequent update.
- Emit one `race-update` per newly emitted normalized record. Replay timing
  follows the sorted recorded intervals divided by current speed. Live mode
  forwards only newly accepted matching records after its snapshot.
- `replay-seek` carries the requested target, new position, snapshot boundary,
  and resulting state. `replay-reset` carries position zero and resulting
  state. `replay-complete` carries final state and closes the subscription.
- `replay-error` carries a stable code, safe message, and last valid state
  when available. SSE heartbeat comments are allowed but are not protocol
  events.

### HTTP controls and seeking

- `POST /api/v1/reports/replay/control` requires `race:write` and accepts a
  known stream ID with one of `start`, `pause`, `resume`, `reset`, `set-speed`,
  or `seek`. Return the resulting typed state as JSON.
- `set-speed` requires a finite number from 0.01 through 1000. A speed change
  while replaying reschedules the remaining interval from the current clock
  position without duplicating or skipping a record.
- `seek` requires exactly one target: a zero-based integer `position` or an
  ISO-8601 `timestamp`. Reject both, neither, negative or out-of-range
  positions, malformed timestamps, and extra seek fields on other commands.
- A seek cancels the pending timer, moves the next position, rebuilds the
  emitted-record snapshot through that boundary, broadcasts `replay-seek`
  then `replay-state`, and resumes scheduling only if the stream was already
  replaying. It preserves paused state otherwise.
- Reset moves to zero and starts replay. Start restarts a paused or completed
  stream from zero. Pause/resume and completion keep their current meanings.
  Do not let a stale timer emit a record after seek, reset, pause, or shutdown.
- Reject a missing stream or a stream ID bound to another selection. Validate
  all operators by permission, not by stream creator. Serialize changes and
  broadcast the same resulting state to every subscriber.

### Reports subscriber and controls

- Keep the current event/session, live/replay, speed, start, pause, resume,
  reset, and new-stream controls. Add MUI position and timestamp seek fields
  and a Seek action that sends exactly one target per request.
- Subscribe to the selected SSE stream in Reports. Display connection state,
  replay status, emitted/total count, current position, completion, and safe
  control or stream errors. The generated URL may remain available for remote
  clients but is not a substitute for the in-app subscriber view.
- Reconnect with the same stream ID after a transport failure. On every
  `replay-snapshot`, replace locally displayed records and state rather than
  replaying a stale client buffer. Ignore malformed payloads safely and show
  a local error until an authoritative snapshot is received.
- When the event/session or mode changes, dispose the old subscription and
  create a new stream ID. A speed selection for an existing stream uses the
  control endpoint rather than changing only the subscription URL.

## Failure handling

- Before SSE headers, return an HTTP problem for invalid selection, mode,
  speed, authentication, or stream-ID conflict. After headers, use
  `replay-error` with a stable safe code and close or recover the stream as
  appropriate.
- A malformed client event does not alter catalog state or crash Reports.
  Reconnect and reconcile from a fresh server snapshot.
- Completion and shutdown clear timers and subscribers. Clamp timer delays to
  the JavaScript maximum while retaining deterministic record order. A
  disconnected subscriber releases its heartbeat and response resources.
- Seek and control failures leave the last valid stream state intact and
  return an actionable error without emitting a misleading lifecycle event.

## Extra tests

- Unit-test timestamp, sequence, and ID ordering ties; speed scaling and
  speed changes; start/pause/resume/reset; seek by position and timestamp;
  beginning/end bounds; timer cancellation; live filtering; late subscribers;
  completion; and shutdown cleanup.
- Contract-test the exact order and typed payload of `replay-connected`,
  `replay-snapshot`, `replay-state`, `race-update`, `replay-seek`,
  `replay-reset`, `replay-complete`, and `replay-error`.
- Server tests cover missing/invalid query values, event/session ownership,
  `race:read` subscription, read-only control denial, controls from two
  separate `race:write` users, unknown stream, binding conflict, both seek
  targets, ambiguous seek requests, and reconnection snapshots.
- UI integration tests cover event/session and mode changes, subscription
  disposal, state/count rendering, seek validation, completion, control
  errors, malformed payloads, and snapshot-driven reconnect reconciliation.
- Preserve the spec 03 foundation tests and add a regression proving replay
  never changes Event Catalog ledger or race calculations. Update OpenAPI
  examples and response schemas to the final protocol.

## Implementation checklist

- [ ] Add shared typed protocol payloads and normalized record ordering.
- [ ] Update hub event sequence, snapshots, lifecycle events, errors, and
      timer/command serialization.
- [ ] Add position and timestamp seeking to the control API.
- [ ] Add the Reports SSE subscriber, status display, and seek controls.
- [ ] Update OpenAPI and replace foundation event-name assumptions in tests.
- [ ] Add contract, service, server, and UI regressions; run Vitest,
      TypeScript, lint, and build checks.
- [ ] Update the restart-required version gate because server protocol code
      requires a full application-process restart.
