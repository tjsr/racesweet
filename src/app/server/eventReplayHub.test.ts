import type { ServerResponse } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEventId,
  createSessionId,
  createTimeRecordId,
  createTimeRecordSourceId,
} from "../../model/ids.js";
import type { EventTimeRecord } from "../../model/timerecord.js";
import { type EventReplayRecord, EventReplayHub } from "./eventReplayHub.js";

interface ReplayResponseFixture {
  response: ServerResponse;
  writes: string[];
}

const createResponseFixture = (): ReplayResponseFixture => {
  const writes: string[] = [];
  const responseFixture: {
    destroyed: boolean;
    end: () => ServerResponse;
    writableEnded: boolean;
    write: (chunk: string) => boolean;
    writeHead: (
      statusCode: number,
      headers: Record<string, string>,
    ) => ServerResponse;
  } = {
    destroyed: false,
    end: (): ServerResponse => {
      responseFixture.writableEnded = true;
      return responseFixture as ServerResponse;
    },
    writableEnded: false,
    write: (chunk: string): boolean => {
      writes.push(chunk);
      return true;
    },
    writeHead: (): ServerResponse => responseFixture as ServerResponse,
  };
  return { response: responseFixture as ServerResponse, writes };
};

const createRecord = (time: string, sequence: number): EventReplayRecord => {
  const record: EventTimeRecord = {
    id: createTimeRecordId(`record-${sequence}`),
    recordType: 16,
    sequence,
    source: createTimeRecordSourceId("replay-test"),
    time: new Date(time),
  };
  return {
    eventId: createEventId("replay-event"),
    record,
    sessionId: createSessionId("replay-session"),
  };
};

describe("EventReplayHub", () => {
  afterEach((): void => {
    vi.useRealTimers();
  });

  it("streams recorded race records in timestamp order at the requested relative speed", async () => {
    vi.useFakeTimers();
    const hub: EventReplayHub = new EventReplayHub();
    const fixture: ReplayResponseFixture = createResponseFixture();
    const first: EventReplayRecord = createRecord(
      "2026-01-01T00:00:00.000Z",
      2,
    );
    const second: EventReplayRecord = createRecord(
      "2026-01-01T00:00:02.000Z",
      1,
    );

    hub.subscribe(
      fixture.response,
      { eventId: first.eventId, sessionId: first.sessionId },
      "replay",
      2,
      [second, first],
      "replay-speed-test",
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.writes.join("")).toContain(`\"id\":\"${first.record.id}\"`);
    expect(fixture.writes.join("")).not.toContain(
      `\"id\":\"${second.record.id}\"`,
    );

    await vi.advanceTimersByTimeAsync(999);
    expect(fixture.writes.join("")).not.toContain(
      `\"id\":\"${second.record.id}\"`,
    );

    await vi.advanceTimersByTimeAsync(1);
    expect(fixture.writes.join("")).toContain(`\"id\":\"${second.record.id}\"`);
    expect(fixture.writes.join("")).toContain("event: replay-complete");
    expect(fixture.response.writableEnded).toBe(true);
  });

  it("forwards only matching newly accepted records to live subscribers", () => {
    const hub: EventReplayHub = new EventReplayHub();
    const fixture: ReplayResponseFixture = createResponseFixture();
    const matchingRecord: EventReplayRecord = createRecord(
      "2026-01-01T00:00:00.000Z",
      1,
    );
    const otherRecord: EventReplayRecord = {
      ...createRecord("2026-01-01T00:00:01.000Z", 2),
      sessionId: createSessionId("another-session"),
    };

    hub.subscribe(
      fixture.response,
      { eventId: matchingRecord.eventId, sessionId: matchingRecord.sessionId },
      "live",
      1,
      [],
      "live-test",
    );
    hub.publish(otherRecord);
    hub.publish(matchingRecord);

    const stream: string = fixture.writes.join("");
    expect(stream).not.toContain(`\"id\":\"${otherRecord.record.id}\"`);
    expect(stream).toContain(`\"id\":\"${matchingRecord.record.id}\"`);
    expect(stream).toContain("event: race-record");
  });

  it("cancels scheduled replay work when the server closes", async () => {
    vi.useFakeTimers();
    const hub: EventReplayHub = new EventReplayHub();
    const fixture: ReplayResponseFixture = createResponseFixture();
    const first: EventReplayRecord = createRecord(
      "2026-01-01T00:00:00.000Z",
      1,
    );
    const second: EventReplayRecord = createRecord(
      "2026-01-01T00:01:00.000Z",
      2,
    );

    hub.subscribe(
      fixture.response,
      { eventId: first.eventId, sessionId: first.sessionId },
      "replay",
      1,
      [first, second],
      "shutdown-test",
    );
    hub.close();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(fixture.writes.join("")).not.toContain(
      `\"id\":\"${second.record.id}\"`,
    );
    expect(fixture.response.writableEnded).toBe(true);
  });

  it("sends a late subscriber a replay snapshot and honours pause and resume controls", async () => {
    vi.useFakeTimers();
    const hub: EventReplayHub = new EventReplayHub();
    const firstFixture: ReplayResponseFixture = createResponseFixture();
    const lateFixture: ReplayResponseFixture = createResponseFixture();
    const first: EventReplayRecord = createRecord("2026-01-01T00:00:00.000Z", 1);
    const second: EventReplayRecord = createRecord("2026-01-01T00:00:02.000Z", 2);
    const streamId: string = "controlled-replay";

    hub.subscribe(
      firstFixture.response,
      { eventId: first.eventId, sessionId: first.sessionId },
      "replay",
      1,
      [first, second],
      streamId,
    );
    await vi.advanceTimersByTimeAsync(0);
    const pausedState = hub.control(streamId, "pause");
    expect(pausedState.status).toBe("paused");

    hub.subscribe(
      lateFixture.response,
      { eventId: first.eventId, sessionId: first.sessionId },
      "replay",
      1,
      [first, second],
      streamId,
    );
    expect(lateFixture.writes.join("")).toContain("event: replay-snapshot");
    expect(lateFixture.writes.join("")).toContain(`\"id\":\"${first.record.id}\"`);
    expect(lateFixture.writes.join("")).toContain("\"status\":\"paused\"");

    await vi.advanceTimersByTimeAsync(10_000);
    expect(firstFixture.writes.join("")).not.toContain(`\"id\":\"${second.record.id}\"`);

    const resumedState = hub.control(streamId, "resume");
    expect(resumedState.status).toBe("replaying");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(firstFixture.writes.join("")).toContain(`\"id\":\"${second.record.id}\"`);
    expect(lateFixture.writes.join("")).toContain("event: replay-state");
  });
});
