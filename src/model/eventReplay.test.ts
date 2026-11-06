import { describe, expect, it } from "vitest";

import {
  type ReplayState,
  isReplayRecord,
  isReplayState,
  isReplayTimestamp,
} from "./eventReplay.js";

describe("public replay protocol validation", (): void => {
  it("requires explicit ISO instants and consistent bounded state/counts", (): void => {
    expect(isReplayTimestamp("2026-01-01T12:00:00+11:00")).toBe(true);
    expect(isReplayTimestamp("2026-01-01T12:00:00")).toBe(false);
    expect(isReplayTimestamp("invalid")).toBe(false);
    const state: ReplayState = {
      emittedRecordCount: 1,
      eventId: "event",
      mode: "replay",
      position: 1,
      recordCount: 2,
      serverTimestamp: "2026-01-01T00:00:00Z",
      speed: 1,
      status: "paused",
      streamId: "stream",
    };
    expect(isReplayState(state)).toBe(true);
    expect(isReplayState({ ...state, emittedRecordCount: 0 })).toBe(false);
    expect(isReplayState({ ...state, position: 3 })).toBe(false);
    expect(isReplayState({ ...state, speed: Infinity })).toBe(false);
    expect(isReplayState(null)).toBe(false);
    const record = {
      eventId: "event",
      id: "record",
      recordType: 16,
      sequence: 1,
      sessionId: "session",
      timestamp: "2026-01-01T00:00:00Z",
    };
    expect(isReplayRecord(record)).toBe(true);
    expect(isReplayRecord({ ...record, sequence: "1" })).toBe(false);
    expect(isReplayRecord(null)).toBe(false);
  });
});
