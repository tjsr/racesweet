/** Public, versioned SSE protocol. Records omit source files and raw input. */
export const REPLAY_PROTOCOL_VERSION: number = 1;
export type ReplayMode = "live" | "replay";
export type ReplayStatus = "completed" | "paused" | "replaying";
export type ReplayCommand =
  "pause" | "reset" | "resume" | "seek" | "set-speed" | "start";
export interface ReplaySelection {
  eventId: string;
  sessionId?: string;
}
export interface ReplayState extends ReplaySelection {
  emittedRecordCount: number;
  mode: ReplayMode;
  position: number;
  recordCount: number;
  serverTimestamp: string;
  speed: number;
  status: ReplayStatus;
  streamId: string;
}
export interface ReplayRecord extends ReplaySelection {
  entrantId?: string;
  entryId?: string;
  id: string;
  lineNumber?: number;
  loopNumber?: number;
  participantId?: string;
  recordType: number;
  sequence: number;
  sessionId: string;
  timestamp: string;
}
export type ReplaySeekTarget =
  | { position: number; timestamp?: never }
  | { position?: never; timestamp: string };
export interface ReplayControlRequest {
  command: ReplayCommand;
  position?: number;
  speed?: number;
  streamId: string;
  timestamp?: string;
}
export interface ReplayEventPayloads {
  "race-update": { record: ReplayRecord; state: ReplayState };
  "replay-complete": { state: ReplayState };
  "replay-connected": {
    mode: ReplayMode;
    protocolVersion: number;
    selection: ReplaySelection;
    serverTimestamp: string;
    state: ReplayState;
    streamId: string;
  };
  "replay-error": { code: string; message: string; state?: ReplayState };
  "replay-reset": { position: 0; state: ReplayState };
  "replay-seek": {
    position: number;
    records: ReplayRecord[];
    snapshotBoundary: number;
    state: ReplayState;
    target: ReplaySeekTarget;
  };
  "replay-snapshot": { records: ReplayRecord[]; state: ReplayState };
  "replay-state": ReplayState;
}
export type ReplayEventName = keyof ReplayEventPayloads;
export type ReplayEvent = {
  [TName in ReplayEventName]: {
    event: TName;
    payload: ReplayEventPayloads[TName];
  };
}[ReplayEventName];
export const isReplayTimestamp = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(
    value,
  ) && Number.isFinite(Date.parse(value));
// SSE data is untrusted JSON; unknown is required at this validation boundary.
export const isReplayState = (value: unknown): value is ReplayState => {
  if (!value || typeof value !== "object") return false;
  const state: Partial<ReplayState> = value;
  return (
    typeof state.streamId === "string" &&
    typeof state.eventId === "string" &&
    (state.sessionId === undefined || typeof state.sessionId === "string") &&
    (state.mode === "live" || state.mode === "replay") &&
    ["completed", "paused", "replaying"].includes(state.status || "") &&
    Number.isInteger(state.position) &&
    Number.isInteger(state.recordCount) &&
    state.position! >= 0 &&
    state.position! <= state.recordCount! &&
    state.emittedRecordCount === state.position &&
    typeof state.speed === "number" &&
    state.speed >= 0.01 &&
    state.speed <= 1000 &&
    typeof state.serverTimestamp === "string" &&
    isReplayTimestamp(state.serverTimestamp)
  );
};
export const isReplayRecord = (value: unknown): value is ReplayRecord => {
  if (!value || typeof value !== "object") return false;
  const record: Partial<ReplayRecord> = value;
  return (
    typeof record.id === "string" &&
    typeof record.eventId === "string" &&
    typeof record.sessionId === "string" &&
    typeof record.timestamp === "string" &&
    isReplayTimestamp(record.timestamp) &&
    typeof record.recordType === "number" &&
    Number.isFinite(record.recordType) &&
    typeof record.sequence === "number" &&
    Number.isFinite(record.sequence)
  );
};
