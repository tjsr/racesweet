import type { ServerResponse } from 'node:http';
import type { EventTimeRecord, TimeRecord } from '../../model/timerecord.js';

const HEARTBEAT_INTERVAL_MS: number = 15_000;
const MAXIMUM_TIMER_DELAY_MS: number = 2_147_483_647;

export type EventReplayCommand = 'pause' | 'reset' | 'resume' | 'set-speed' | 'start';
export type EventReplayMode = 'live' | 'replay';
export type EventReplayStatus = 'completed' | 'paused' | 'replaying';

export interface EventReplayRecord {
  eventId: string;
  record: TimeRecord;
  sessionId: string;
}

export interface EventReplaySelection {
  eventId: string;
  sessionId?: string;
}

export interface EventReplayState extends EventReplaySelection {
  emittedRecordCount: number;
  recordCount: number;
  speed: number;
  status: EventReplayStatus;
  streamId: string;
}

interface LiveSubscriber extends EventReplaySelection {
  dispose: () => void;
  response: ServerResponse;
}

interface ReplayStream extends EventReplayState {
  emittedRecords: EventReplayRecord[];
  records: EventReplayRecord[];
  subscriberDisposers: Map<ServerResponse, () => void>;
  subscribers: Set<ServerResponse>;
  timer?: NodeJS.Timeout;
}

const formatEvent = (type: string, payload: object): string => [
  `event: ${type}`,
  `data: ${JSON.stringify(payload)}`,
  '',
  '',
].join('\n');

const matchesSelection = (
  record: EventReplayRecord,
  selection: EventReplaySelection,
): boolean => record.eventId === selection.eventId &&
  (selection.sessionId === undefined || record.sessionId === selection.sessionId);

const recordSequence = (record: EventReplayRecord): number => {
  const sequence: number | undefined = (record.record as Partial<EventTimeRecord>).sequence;
  return sequence === undefined ? 0 : sequence;
};

const recordTimestamp = (record: EventReplayRecord): number => {
  const timestamp: number | undefined = record.record.time?.getTime();
  return timestamp === undefined || Number.isNaN(timestamp) ? 0 : timestamp;
};

const sortRecords = (
  records: EventReplayRecord[],
  selection: EventReplaySelection,
): EventReplayRecord[] => [...records]
  .filter((record: EventReplayRecord): boolean => matchesSelection(record, selection))
  .sort((left: EventReplayRecord, right: EventReplayRecord): number => {
    const timestampDifference: number = recordTimestamp(left) - recordTimestamp(right);
    return timestampDifference !== 0
      ? timestampDifference
      : recordSequence(left) - recordSequence(right);
  });

const replayState = (stream: ReplayStream): EventReplayState => ({
  emittedRecordCount: stream.emittedRecordCount,
  eventId: stream.eventId,
  recordCount: stream.recordCount,
  sessionId: stream.sessionId,
  speed: stream.speed,
  status: stream.status,
  streamId: stream.streamId,
});

export class EventReplayHub {
  private readonly liveSubscribers = new Set<LiveSubscriber>();
  private readonly replayStreams = new Map<string, ReplayStream>();

  public control = (
    streamId: string,
    command: EventReplayCommand,
    speed?: number,
  ): EventReplayState => {
    const stream: ReplayStream | undefined = this.replayStreams.get(streamId);
    if (!stream) {
      throw new Error(`Replay stream ${streamId} was not found.`);
    }
    if (command === 'pause') {
      if (stream.status === 'replaying') {
        this.clearTimer(stream);
        stream.status = 'paused';
      }
    } else if (command === 'resume') {
      if (stream.status === 'paused') {
        stream.status = 'replaying';
        this.scheduleNextRecord(stream);
      }
    } else if (command === 'set-speed') {
      if (speed === undefined || !Number.isFinite(speed) || speed < 0.01 || speed > 1_000) {
        throw new Error('Replay speed must be a number between 0.01 and 1000.');
      }
      stream.speed = speed;
      if (stream.status === 'replaying') {
        this.clearTimer(stream);
        this.scheduleNextRecord(stream);
      }
    } else if (command === 'reset' || command === 'start') {
      this.clearTimer(stream);
      stream.emittedRecordCount = 0;
      stream.emittedRecords = [];
      stream.status = 'replaying';
      this.broadcast(stream, 'replay-reset', replayState(stream));
      this.scheduleNextRecord(stream);
    }
    const state: EventReplayState = replayState(stream);
    this.broadcast(stream, 'replay-state', state);
    return state;
  };

  public publish = (record: EventReplayRecord): void => {
    this.liveSubscribers.forEach((subscriber: LiveSubscriber): void => {
      if (matchesSelection(record, subscriber)) {
        subscriber.response.write(formatEvent('race-record', record));
      }
    });
  };

  public subscribe = (
    response: ServerResponse,
    selection: EventReplaySelection,
    mode: EventReplayMode,
    speed: number,
    records: EventReplayRecord[],
    streamId: string,
  ): (() => void) => {
    response.writeHead(200, {
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'content-type': 'text/event-stream; charset=utf-8',
      'x-accel-buffering': 'no',
    });
    response.write('retry: 2000\n\n');

    if (mode === 'live') {
      return this.subscribeLive(response, selection, streamId);
    }

    const stream: ReplayStream = this.getOrCreateReplayStream(
      selection,
      speed,
      records,
      streamId,
    );
    stream.subscribers.add(response);
    response.write(formatEvent('replay-ready', {
      ...replayState(stream),
      mode,
    }));
    response.write(formatEvent('replay-snapshot', {
      records: stream.emittedRecords,
      state: replayState(stream),
    }));
    response.write(formatEvent('replay-state', replayState(stream)));
    const dispose: () => void = this.createSubscriberDisposer(response, stream);
    stream.subscriberDisposers.set(response, dispose);
    if (stream.status === 'completed') {
      response.write(formatEvent('replay-complete', replayState(stream)));
      dispose();
    }
    return dispose;
  };

  public close = (): void => {
    this.liveSubscribers.forEach((subscriber: LiveSubscriber): void => {
      subscriber.dispose();
    });
    this.liveSubscribers.clear();
    this.replayStreams.forEach((stream: ReplayStream): void => {
      this.clearTimer(stream);
      [...stream.subscriberDisposers.values()].forEach((dispose: () => void): void => {
        dispose();
      });
      stream.subscriberDisposers.clear();
      stream.subscribers.clear();
    });
    this.replayStreams.clear();
  };

  private broadcast = (
    stream: ReplayStream,
    type: string,
    payload: object,
  ): void => {
    const serialized: string = formatEvent(type, payload);
    stream.subscribers.forEach((response: ServerResponse): void => {
      if (!response.destroyed && !response.writableEnded) {
        response.write(serialized);
      }
    });
  };

  private clearTimer = (stream: ReplayStream): void => {
    if (stream.timer) {
      clearTimeout(stream.timer);
      stream.timer = undefined;
    }
  };

  private createSubscriberDisposer = (
    response: ServerResponse,
    stream: ReplayStream,
  ): (() => void) => {
    let disposed: boolean = false;
    const heartbeat: NodeJS.Timeout = setInterval((): void => {
      if (!response.destroyed && !response.writableEnded) {
        response.write(': heartbeat\n\n');
      }
    }, HEARTBEAT_INTERVAL_MS);
    return (): void => {
      if (disposed) {
        return;
      }
      disposed = true;
      clearInterval(heartbeat);
      stream.subscribers.delete(response);
      stream.subscriberDisposers.delete(response);
      if (!response.destroyed && !response.writableEnded) {
        response.end();
      }
    };
  };

  private getOrCreateReplayStream = (
    selection: EventReplaySelection,
    speed: number,
    records: EventReplayRecord[],
    streamId: string,
  ): ReplayStream => {
    const existing: ReplayStream | undefined = this.replayStreams.get(streamId);
    if (existing) {
      if (existing.eventId !== selection.eventId || existing.sessionId !== selection.sessionId) {
        throw new Error(`Replay stream ${streamId} targets a different event or session.`);
      }
      return existing;
    }
    const orderedRecords: EventReplayRecord[] = sortRecords(records, selection);
    const stream: ReplayStream = {
      emittedRecordCount: 0,
      emittedRecords: [],
      eventId: selection.eventId,
      recordCount: orderedRecords.length,
      records: orderedRecords,
      sessionId: selection.sessionId,
      speed,
      status: 'replaying',
      streamId,
      subscriberDisposers: new Map<ServerResponse, () => void>(),
      subscribers: new Set<ServerResponse>(),
    };
    this.replayStreams.set(streamId, stream);
    this.scheduleNextRecord(stream);
    return stream;
  };

  private scheduleNextRecord = (stream: ReplayStream): void => {
    if (stream.status !== 'replaying') {
      return;
    }
    const record: EventReplayRecord | undefined = stream.records[stream.emittedRecordCount];
    if (!record) {
      stream.status = 'completed';
      this.broadcast(stream, 'replay-complete', replayState(stream));
      this.broadcast(stream, 'replay-state', replayState(stream));
      [...stream.subscriberDisposers.values()].forEach((dispose: () => void): void => {
        dispose();
      });
      return;
    }
    const previousRecord: EventReplayRecord | undefined = stream.records[stream.emittedRecordCount - 1];
    const delay: number = previousRecord
      ? Math.max(0, (recordTimestamp(record) - recordTimestamp(previousRecord)) / stream.speed)
      : 0;
    stream.timer = setTimeout((): void => {
      stream.timer = undefined;
      if (stream.status !== 'replaying') {
        return;
      }
      stream.emittedRecords.push(record);
      stream.emittedRecordCount += 1;
      this.broadcast(stream, 'race-record', record);
      this.scheduleNextRecord(stream);
    }, Math.min(delay, MAXIMUM_TIMER_DELAY_MS));
  };

  private subscribeLive = (
    response: ServerResponse,
    selection: EventReplaySelection,
    streamId: string,
  ): (() => void) => {
    let disposed: boolean = false;
    const heartbeat: NodeJS.Timeout = setInterval((): void => {
      if (!response.destroyed && !response.writableEnded) {
        response.write(': heartbeat\n\n');
      }
    }, HEARTBEAT_INTERVAL_MS);
    let subscriber: LiveSubscriber;
    const dispose = (): void => {
      if (disposed) {
        return;
      }
      disposed = true;
      clearInterval(heartbeat);
      this.liveSubscribers.delete(subscriber);
      if (!response.destroyed && !response.writableEnded) {
        response.end();
      }
    };
    subscriber = { ...selection, dispose, response };
    this.liveSubscribers.add(subscriber);
    response.write(formatEvent('replay-ready', {
      eventId: selection.eventId,
      mode: 'live',
      recordCount: 0,
      sessionId: selection.sessionId || null,
      speed: 1,
      streamId,
    }));
    response.write(formatEvent('replay-snapshot', {
      records: [],
      state: {
        emittedRecordCount: 0,
        eventId: selection.eventId,
        recordCount: 0,
        sessionId: selection.sessionId,
        speed: 1,
        status: 'replaying',
        streamId,
      } satisfies EventReplayState,
    }));
    return dispose;
  };
}
