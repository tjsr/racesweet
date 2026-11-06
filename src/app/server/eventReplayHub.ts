import type { ServerResponse } from "node:http";

import {
  REPLAY_PROTOCOL_VERSION,
  type ReplayCommand,
  type ReplayEventName,
  type ReplayEventPayloads,
  type ReplayMode,
  type ReplayRecord,
  type ReplaySeekTarget,
  type ReplaySelection,
  type ReplayState,
  isReplayTimestamp,
} from "../../model/eventReplay.js";
import type {
  EventTimeRecord,
  ParticipantPassingRecord,
  TimeRecord,
} from "../../model/timerecord.js";

export type EventReplayCommand = ReplayCommand;
export type EventReplayMode = ReplayMode;
export type EventReplayState = ReplayState;
export interface EventReplayRecord {
  eventId: string;
  record: TimeRecord;
  sessionId: string;
}
export type EventReplaySelection = ReplaySelection;

interface ReplayStream extends ReplayState {
  intervalRemaining: number;
  intervalStarted: number;
  records: ReplayRecord[];
  subscriberDisposers: Map<ServerResponse, () => void>;
  timer?: NodeJS.Timeout;
  timerGeneration: number;
}
const MAXIMUM_TIMER_DELAY_MS: number = 2_147_483_647;
const formatEvent = <TName extends ReplayEventName>(
  name: TName,
  payload: ReplayEventPayloads[TName],
): string => `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
const normalizeRecord = (
  input: EventReplayRecord,
): ReplayRecord | undefined => {
  const record: Partial<ParticipantPassingRecord> = input.record;
  const time: Date | undefined = input.record.time;
  if (!time || !Number.isFinite(time.getTime())) return undefined;
  return {
    entrantId: record.entrantId || undefined,
    entryId: record.entryId || undefined,
    eventId: input.eventId,
    id: input.record.id.toString(),
    lineNumber: record.lineNumber,
    loopNumber: record.loopNumber,
    participantId: record.participantId || undefined,
    recordType: input.record.recordType,
    sequence: (input.record as Partial<EventTimeRecord>).sequence || 0,
    sessionId: input.sessionId,
    timestamp: time.toISOString(),
  };
};
const matchesSelection = (
  record: ReplaySelection,
  selection: ReplaySelection,
): boolean =>
  record.eventId === selection.eventId &&
  (!selection.sessionId || record.sessionId === selection.sessionId);
const compareRecords = (left: ReplayRecord, right: ReplayRecord): number =>
  Date.parse(left.timestamp) - Date.parse(right.timestamp) ||
  left.sequence - right.sequence ||
  left.id.localeCompare(right.id);
const replayState = (stream: ReplayStream): ReplayState => ({
  emittedRecordCount: stream.position,
  eventId: stream.eventId,
  mode: stream.mode,
  position: stream.position,
  recordCount: stream.records.length,
  serverTimestamp: new Date().toISOString(),
  sessionId: stream.sessionId,
  speed: stream.speed,
  status: stream.status,
  streamId: stream.streamId,
});

/** Controls and timer callbacks are synchronous atomic turns on the server event loop. */
export class EventReplayHub {
  private readonly streams: Map<string, ReplayStream> = new Map();

  public control = (
    streamId: string,
    command: ReplayCommand,
    speed?: number,
    target?: ReplaySeekTarget,
  ): ReplayState => {
    const stream: ReplayStream | undefined = this.streams.get(streamId);
    if (!stream) throw new Error("Replay stream was not found.");
    if (stream.mode !== "replay")
      throw new Error("Live streams cannot be controlled.");
    if (
      !["start", "pause", "resume", "reset", "set-speed", "seek"].includes(
        command,
      )
    )
      throw new Error("Invalid replay command.");
    if (command !== "seek" && target)
      throw new Error("Seek targets are only valid for seek commands.");
    let position: number | undefined;
    if (command === "seek") {
      if (
        !target ||
        (target.position === undefined) === (target.timestamp === undefined)
      )
        throw new Error("Seek requires exactly one target.");
      if (target.position !== undefined) {
        if (
          !Number.isInteger(target.position) ||
          target.position < 0 ||
          target.position > stream.records.length
        )
          throw new Error("Seek position is out of range.");
        position = target.position;
      } else {
        if (!isReplayTimestamp(target.timestamp))
          throw new Error(
            "Seek timestamp must be an ISO instant with an offset.",
          );
        const found: number = stream.records.findIndex(
          (record: ReplayRecord): boolean =>
            Date.parse(record.timestamp) >= Date.parse(target.timestamp),
        );
        position = found < 0 ? stream.records.length : found;
      }
    }
    if (
      command === "set-speed" &&
      (speed === undefined ||
        !Number.isFinite(speed) ||
        speed < 0.01 ||
        speed > 1000)
    ) {
      throw new Error("Replay speed must be a number between 0.01 and 1000.");
    }
    this.clearTimer(stream, true);
    if (command === "pause" && stream.status === "replaying")
      stream.status = "paused";
    if (command === "resume" && stream.status === "paused")
      stream.status = "replaying";
    if (command === "set-speed") stream.speed = speed!;
    if (command === "seek") {
      stream.position = position!;
      stream.intervalRemaining = this.recordInterval(stream);
      this.broadcast(stream, "replay-seek", {
        position: stream.position,
        records: stream.records.slice(0, stream.position),
        snapshotBoundary: stream.position,
        state: replayState(stream),
        target: target!,
      });
    }
    if (command === "reset" || command === "start") {
      stream.position = 0;
      stream.intervalRemaining = 0;
      stream.status = "replaying";
      this.broadcast(stream, "replay-reset", {
        position: 0,
        state: replayState(stream),
      });
    }
    this.broadcast(stream, "replay-state", replayState(stream));
    if (stream.status === "replaying") this.scheduleNextRecord(stream);
    return replayState(stream);
  };

  public publish = (input: EventReplayRecord): void => {
    const record: ReplayRecord | undefined = normalizeRecord(input);
    if (!record) return;
    this.streams.forEach((stream: ReplayStream): void => {
      if (
        stream.mode !== "live" ||
        !matchesSelection(record, stream) ||
        stream.records.some(
          (existing: ReplayRecord): boolean => existing.id === record.id,
        )
      )
        return;
      stream.records.push(record);
      stream.records.sort(compareRecords);
      stream.position = stream.records.length;
      this.broadcast(stream, "race-update", {
        record,
        state: replayState(stream),
      });
    });
  };

  public subscribe = (
    response: ServerResponse,
    selection: ReplaySelection,
    mode: ReplayMode,
    speed: number,
    inputs: EventReplayRecord[],
    streamId: string,
  ): (() => void) => {
    if (!streamId.trim() || streamId.length > 200)
      throw new Error("Invalid replay stream ID.");
    if (
      !["live", "replay"].includes(mode) ||
      !Number.isFinite(speed) ||
      speed < 0.01 ||
      speed > 1000
    )
      throw new Error("Invalid replay mode or speed.");
    let stream: ReplayStream | undefined = this.streams.get(streamId);
    if (
      stream &&
      (stream.eventId !== selection.eventId ||
        stream.sessionId !== selection.sessionId ||
        stream.mode !== mode)
    ) {
      throw new Error(
        "Replay stream targets a different event, session, or mode.",
      );
    }
    if (stream?.mode === "live") {
      stream.records = inputs
        .flatMap((input: EventReplayRecord): ReplayRecord[] => {
          const record: ReplayRecord | undefined = normalizeRecord(input);
          return record && matchesSelection(record, selection) ? [record] : [];
        })
        .sort(compareRecords);
      stream.position = stream.records.length;
    }
    if (!stream) {
      const records: ReplayRecord[] = inputs
        .flatMap((input: EventReplayRecord): ReplayRecord[] => {
          const record: ReplayRecord | undefined = normalizeRecord(input);
          return record && matchesSelection(record, selection) ? [record] : [];
        })
        .sort(compareRecords);
      stream = {
        ...selection,
        emittedRecordCount: 0,
        intervalRemaining: 0,
        intervalStarted: 0,
        mode,
        position: mode === "live" ? records.length : 0,
        recordCount: records.length,
        records,
        serverTimestamp: new Date().toISOString(),
        speed,
        status: "replaying",
        streamId,
        subscriberDisposers: new Map(),
        timerGeneration: 0,
      };
      this.streams.set(streamId, stream);
    }
    response.writeHead(200, {
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no",
    });
    response.write("retry: 2000\n\n");
    const state: ReplayState = replayState(stream);
    response.write(
      formatEvent("replay-connected", {
        mode,
        protocolVersion: REPLAY_PROTOCOL_VERSION,
        selection,
        serverTimestamp: state.serverTimestamp,
        state,
        streamId,
      }),
    );
    response.write(
      formatEvent("replay-snapshot", {
        records: stream.records.slice(0, stream.position),
        state,
      }),
    );
    response.write(formatEvent("replay-state", state));
    const dispose: () => void = this.createDisposer(response, stream);
    stream.subscriberDisposers.set(response, dispose);
    if (stream.status === "completed") {
      response.write(formatEvent("replay-complete", { state }));
      dispose();
    } else if (!stream.timer && stream.mode === "replay")
      this.scheduleNextRecord(stream);
    return dispose;
  };

  public close = (): void => {
    this.streams.forEach((stream: ReplayStream): void => {
      this.clearTimer(stream, false);
      this.broadcast(stream, "replay-error", {
        code: "server-shutdown",
        message: "Replay server is shutting down.",
        state: replayState(stream),
      });
      [...stream.subscriberDisposers.values()].forEach(
        (dispose: () => void): void => dispose(),
      );
    });
    this.streams.clear();
  };

  private broadcast = <TName extends ReplayEventName>(
    stream: ReplayStream,
    name: TName,
    payload: ReplayEventPayloads[TName],
  ): void => {
    const data: string = formatEvent(name, payload);
    stream.subscriberDisposers.forEach(
      (_dispose: () => void, response: ServerResponse): void => {
        if (!response.destroyed && !response.writableEnded)
          response.write(data);
      },
    );
  };
  private clearTimer = (
    stream: ReplayStream,
    retainInterval: boolean,
  ): void => {
    if (stream.timer) {
      clearTimeout(stream.timer);
      stream.timer = undefined;
      if (retainInterval)
        stream.intervalRemaining = Math.max(
          0,
          stream.intervalRemaining -
            (Date.now() - stream.intervalStarted) * stream.speed,
        );
    }
    stream.timerGeneration += 1;
  };
  private createDisposer = (
    response: ServerResponse,
    stream: ReplayStream,
  ): (() => void) => {
    let disposed: boolean = false;
    const heartbeat: NodeJS.Timeout = setInterval((): void => {
      if (!response.destroyed && !response.writableEnded)
        response.write(": heartbeat\n\n");
    }, 15000);
    return (): void => {
      if (disposed) return;
      disposed = true;
      clearInterval(heartbeat);
      stream.subscriberDisposers.delete(response);
      if (!response.destroyed && !response.writableEnded) response.end();
    };
  };
  private recordInterval = (stream: ReplayStream): number => {
    const next: ReplayRecord | undefined = stream.records[stream.position];
    const previous: ReplayRecord | undefined =
      stream.records[stream.position - 1];
    return next && previous
      ? Math.max(0, Date.parse(next.timestamp) - Date.parse(previous.timestamp))
      : 0;
  };
  private scheduleNextRecord = (stream: ReplayStream): void => {
    if (stream.status !== "replaying" || stream.mode !== "replay") return;
    const record: ReplayRecord | undefined = stream.records[stream.position];
    if (!record) {
      stream.status = "completed";
      this.broadcast(stream, "replay-state", replayState(stream));
      this.broadcast(stream, "replay-complete", { state: replayState(stream) });
      [...stream.subscriberDisposers.values()].forEach(
        (dispose: () => void): void => dispose(),
      );
      return;
    }
    const delay: number = Math.min(
      stream.intervalRemaining / stream.speed,
      MAXIMUM_TIMER_DELAY_MS,
    );
    const generation: number = stream.timerGeneration;
    stream.intervalStarted = Date.now();
    stream.timer = setTimeout((): void => {
      stream.timer = undefined;
      if (
        generation !== stream.timerGeneration ||
        stream.status !== "replaying"
      )
        return;
      stream.intervalRemaining = Math.max(
        0,
        stream.intervalRemaining -
          (Date.now() - stream.intervalStarted) * stream.speed,
      );
      if (stream.intervalRemaining > 0) {
        this.scheduleNextRecord(stream);
        return;
      }
      stream.position += 1;
      this.broadcast(stream, "race-update", {
        record,
        state: replayState(stream),
      });
      stream.intervalRemaining = this.recordInterval(stream);
      this.scheduleNextRecord(stream);
    }, delay);
  };
}
