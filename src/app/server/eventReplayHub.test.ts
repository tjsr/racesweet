import type { ServerResponse } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createEventId,
  createSessionId,
  createTimeRecordId,
  createTimeRecordSourceId,
} from "../../model/ids.js";
import type { EventTimeRecord } from "../../model/timerecord.js";
import { EventReplayHub, type EventReplayRecord } from "./eventReplayHub.js";

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
    expect(stream).toContain("event: race-update");
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
    const first: EventReplayRecord = createRecord(
      "2026-01-01T00:00:00.000Z",
      1,
    );
    const second: EventReplayRecord = createRecord(
      "2026-01-01T00:00:02.000Z",
      2,
    );
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
    expect(lateFixture.writes.join("")).toContain(
      `\"id\":\"${first.record.id}\"`,
    );
    expect(lateFixture.writes.join("")).toContain('"status":"paused"');

    await vi.advanceTimersByTimeAsync(10_000);
    expect(firstFixture.writes.join("")).not.toContain(
      `\"id\":\"${second.record.id}\"`,
    );

    const resumedState = hub.control(streamId, "resume");
    expect(resumedState.status).toBe("replaying");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(firstFixture.writes.join("")).toContain(
      `\"id\":\"${second.record.id}\"`,
    );
    expect(lateFixture.writes.join("")).toContain("event: replay-state");
  });

  it("publishes the versioned handshake, deterministic ties, seek boundaries and safe shutdown lifecycle", async (): Promise<void> => {
    vi.useFakeTimers();
    const hub: EventReplayHub = new EventReplayHub();
    const fixture: ReplayResponseFixture = createResponseFixture();
    const record: EventReplayRecord = createRecord(
      "2026-01-01T00:00:00.000Z",
      1,
    );
    const later: EventReplayRecord = createRecord(
      "2026-01-01T00:00:10.000Z",
      2,
    );
    const tie: EventReplayRecord = {
      ...record,
      record: { ...record.record, id: createTimeRecordId("a-tie") },
    };
    const records: EventReplayRecord[] = [later, tie, record];
    const selection = { eventId: record.eventId, sessionId: record.sessionId };
    hub.subscribe(
      fixture.response,
      selection,
      "replay",
      1,
      records,
      "contract",
    );
    expect(
      fixture.writes
        .filter((write: string): boolean => write.startsWith("event:"))
        .map((write: string): string => write.split("\n")[0]),
    ).toEqual([
      "event: replay-connected",
      "event: replay-snapshot",
      "event: replay-state",
    ]);
    expect(fixture.writes.join("")).toContain('"protocolVersion":1');
    hub.control("contract", "pause");
    const positionState = hub.control("contract", "seek", undefined, {
      position: 2,
    });
    expect(positionState).toMatchObject({
      emittedRecordCount: 2,
      position: 2,
      recordCount: 3,
      status: "paused",
    });
    expect(fixture.writes.at(-2)).toContain("event: replay-seek");
    expect(fixture.writes.at(-2)).toContain('"snapshotBoundary":2');
    const timestampState = hub.control("contract", "seek", undefined, {
      timestamp: "2026-01-01T00:00:05.000Z",
    });
    expect(timestampState.position).toBe(2);
    expect(() =>
      hub.control("contract", "seek", undefined, { position: 4 }),
    ).toThrow(/out of range/);
    expect(() =>
      hub.control("contract", "seek", undefined, {
        timestamp: "2026-01-01T00:00:00",
      }),
    ).toThrow(/offset/);
    const conflict: ReplayResponseFixture = createResponseFixture();
    expect(() =>
      hub.subscribe(
        conflict.response,
        selection,
        "live",
        1,
        records,
        "contract",
      ),
    ).toThrow(/different/);
    expect(conflict.writes).toHaveLength(0);
    hub.control("contract", "reset");
    await vi.advanceTimersByTimeAsync(1);
    const emittedIds: string[] = fixture.writes
      .filter((write: string): boolean =>
        write.startsWith("event: race-update"),
      )
      .map(
        (write: string): string =>
          (JSON.parse(write.split("\ndata: ")[1]) as { record: { id: string } })
            .record.id,
      );
    expect(emittedIds).toEqual(
      [record.record.id, tie.record.id].sort(
        (left: string, right: string): number => left.localeCompare(right),
      ),
    );
    hub.close();
    expect(fixture.writes.at(-1)).toContain("event: replay-error");
    expect(fixture.writes.at(-1)).toContain("server-shutdown");
    await vi.advanceTimersByTimeAsync(10000);
    expect(fixture.writes.join("")).not.toContain(`"id":"${later.record.id}"`);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retains elapsed interval on speed change and gives live reconnects an authoritative snapshot", async (): Promise<void> => {
    vi.useFakeTimers();
    const hub: EventReplayHub = new EventReplayHub();
    const fixture: ReplayResponseFixture = createResponseFixture();
    const first: EventReplayRecord = createRecord(
      "2026-01-01T00:00:00.000Z",
      1,
    );
    const second: EventReplayRecord = createRecord(
      "2026-01-01T00:00:10.000Z",
      2,
    );
    const selection = { eventId: first.eventId, sessionId: first.sessionId };
    hub.subscribe(
      fixture.response,
      selection,
      "replay",
      1,
      [first, second],
      "speed",
    );
    await vi.advanceTimersByTimeAsync(4000);
    hub.control("speed", "set-speed", 2);
    await vi.advanceTimersByTimeAsync(2999);
    expect(fixture.writes.join("")).not.toContain(`"id":"${second.record.id}"`);
    await vi.advanceTimersByTimeAsync(1);
    expect(fixture.writes.join("")).toContain(`"id":"${second.record.id}"`);
    const live: ReplayResponseFixture = createResponseFixture();
    hub.subscribe(
      live.response,
      selection,
      "live",
      1,
      [first],
      "live-snapshot",
    );
    expect(live.writes[2]).toContain(`"id":"${first.record.id}"`);
    hub.publish(first);
    hub.publish(second);
    expect(
      live.writes.filter((write: string): boolean =>
        write.startsWith("event: race-update"),
      ),
    ).toHaveLength(1);
    const reconnected: ReplayResponseFixture = createResponseFixture();
    hub.subscribe(
      reconnected.response,
      selection,
      "live",
      100,
      [first, second],
      "live-snapshot",
    );
    expect(reconnected.writes[2]).toContain('"position":2');
    expect(reconnected.writes[2]).toContain('"speed":1');
    hub.close();
  });
});
