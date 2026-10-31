# Event replay mode

## Purpose and acceptance criteria

Deliver a complete, documented replay feature for active or completed event
sessions. Remote clients subscribe through Server-Sent Events (SSE), receive a
consistent snapshot and lifecycle messages, and authorized operators control a
named replay through HTTP commands.

Acceptance requires deterministic record order, recorded timing intervals
scaled by the selected speed, reconnection snapshots, explicit lifecycle/error
messages, position and timestamp seeking, and authorization that permits any
`race:write` user to control a known stream while `race:read` users may only
subscribe.

## Current state and preconditions

- `EventReplayHub`, replay endpoints, replay controls, Reports controls, and
  server tests already provide an SSE/HTTP foundation.
- Existing emitted event names and payloads are implementation details until
  this specification’s contract replaces them. Existing clients must be updated
  in the same change; no backwards-compatible protocol version is required.
- Replay data comes from Event Catalog session race-state records and must stay
  read-only.

## Resolved decisions and implementation questions

- **Transport:** retain SSE for subscription and HTTP for controls; do not use
  WebSockets.
- **Seeking:** accept either a deterministic record position or an ISO timestamp
  per command, but reject requests that supply both or neither.
- **Control authority:** any authenticated user with `race:write` may control a
  known stream; a `race:read` user may subscribe only.

## Requirements and design

The replay protocol contract below is the required public interface.

### Subscription

- `GET /api/v1/reports/replay` requires `race:read` and accepts `eventId`,
  optional `sessionId`, `mode` (`live` or `replay`), `speed`, and `streamId`.
- Return SSE with a `replay-connected` event first. It includes protocol version,
  stream ID, selection, mode, server timestamp, and current state.
- Then emit `replay-snapshot`, with the emitted records and full state, followed
  by `replay-state`. A late subscriber receives this same sequence before later
  updates. A completed stream then sends completion and closes cleanly.
- `race-update` carries one normalized replay record. Ordering is ascending
  record timestamp, then record sequence, then stable record ID.

### Lifecycle events

- `replay-state` carries stream ID, selected event/session, mode, status,
  speed, total record count, emitted count, and current replay position.
- `replay-seek` carries the new position, seek target, snapshot boundary, and
  resulting state. `replay-reset` carries position zero and resulting state.
- `replay-complete` carries final state. `replay-error` carries a stable code,
  safe message, and last valid state where available. SSE comments may continue
  to provide heartbeat traffic but are not protocol events.

### Control endpoint

- `POST /api/v1/reports/replay/control` requires `race:write`. It accepts a
  stream ID and one command: `start`, `pause`, `resume`, `reset`, `set-speed`,
  or `seek`.
- `set-speed` accepts finite values from 0.01 through 1000. `seek` accepts
  exactly one of zero-based `position` or ISO-8601 `timestamp`; timestamp seeks
  to the first sorted record at or after that instant. Reject missing, invalid,
  or ambiguous seek targets.
- Reset seeks to zero and starts replay. Start restarts a completed or paused
  stream from zero. Seeking preserves the paused/replaying state unless the
  request explicitly starts/resumes afterward.
- All authorized operators may issue controls for a known stream. The server
  validates stream selection, serializes changes, broadcasts corresponding
  lifecycle events, and returns the resulting state as JSON.

## Reports UI and behavior

- Retain SSE plus HTTP controls; do not replace this feature with WebSockets.
- Add Reports controls for event/session selection, live/replay mode, speed,
  start, pause, resume, reset, position seek, and timestamp seek. Position and
  timestamp inputs are mutually exclusive in a single request.
- Display connection, replay status, emitted/total count, control errors, and
  completion. Reconnect with the same stream ID after a connection failure and
  reconcile from the server snapshot rather than replaying cached client state.
- Live mode forwards only new matching accepted records and emits the same
  connection, snapshot, state, update, and error envelope structure.

## Failure handling

- Reject unknown event/session, invalid mode/speed/seek, unauthenticated access,
  unauthorized control, missing stream, and a stream ID reused for another
  selection.
- Clear timers and subscribers on server shutdown; never leave a timer running
  after completion. Clamp timer delays to the JavaScript maximum while retaining
  deterministic order.
- Treat malformed client event payloads and disconnects as local display errors;
  reconnect from a new authoritative snapshot.

## Test plan

- Unit-test ordering ties, speed scaling, start/pause/resume/reset, both seek
  types, bounds errors, live filtering, late subscriptions, completion, and
  cleanup.
- Contract-test every SSE event name and typed payload plus error responses.
- Server integration-test authentication, `race:read` subscriptions,
  `race:write` controls from more than one authorized user, invalid selection,
  reconnection, and stream-ID conflicts.
- UI integration-test controls, state rendering, seek validation, error display,
  and snapshot-driven reconnect reconciliation.

## Implementation checklist

- Introduce exported protocol payload types and update hub/server/OpenAPI docs.
- Implement seek state and update Reports subscriber/control UI.
- Update existing replay tests to assert the final protocol contract and run
  focused Vitest, TypeScript, and lint checks.
