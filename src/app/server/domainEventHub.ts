import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import type {
  DomainEventEnvelope,
  JsonValue,
  ServerRevision,
} from '../../model/serverApi.js';

const DEFAULT_EVENT_RETENTION: number = 1_000;
const HEARTBEAT_INTERVAL_MS: number = 15_000;

interface EventSubscriber {
  heartbeat: NodeJS.Timeout;
  response: ServerResponse;
}

const formatEvent = (event: DomainEventEnvelope): string => [
  `id: ${event.revision}`,
  `event: ${event.type}`,
  `data: ${JSON.stringify(event)}`,
  '',
  '',
].join('\n');

export class DomainEventHub {
  private readonly events: DomainEventEnvelope[] = [];
  private readonly retention: number;
  private revision: ServerRevision = 0;
  private readonly subscribers = new Set<EventSubscriber>();

  public constructor(retention: number = DEFAULT_EVENT_RETENTION) {
    this.retention = Math.max(1, retention);
  }

  public get currentRevision(): ServerRevision {
    return this.revision;
  }

  public publish = <TPayload extends JsonValue>(
    aggregate: DomainEventEnvelope['aggregate'],
    type: string,
    payload: TPayload,
    commandId?: string,
  ): DomainEventEnvelope<TPayload> => {
    this.revision += 1;
    const event: DomainEventEnvelope<TPayload> = {
      aggregate,
      commandId,
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      payload,
      revision: this.revision,
      type,
    };
    this.events.push(event);
    while (this.events.length > this.retention) {
      this.events.shift();
    }
    const serialized: string = formatEvent(event);
    this.subscribers.forEach((subscriber: EventSubscriber): void => {
      subscriber.response.write(serialized);
    });
    return event;
  };

  public subscribe = (
    response: ServerResponse,
    lastEventId: string | undefined,
  ): (() => void) => {
    response.writeHead(200, {
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'content-type': 'text/event-stream; charset=utf-8',
      'x-accel-buffering': 'no',
    });
    response.write('retry: 2000\n\n');

    const requestedRevision: number | undefined = lastEventId
      ? Number.parseInt(lastEventId, 10)
      : undefined;
    const oldestRevision: number | undefined = this.events[0]?.revision;
    if (
      requestedRevision !== undefined &&
      Number.isSafeInteger(requestedRevision) &&
      oldestRevision !== undefined &&
      requestedRevision < oldestRevision - 1
    ) {
      response.write([
        `id: ${this.revision}`,
        'event: resync-required',
        `data: ${JSON.stringify({ revision: this.revision })}`,
        '',
        '',
      ].join('\n'));
    } else if (requestedRevision !== undefined && Number.isSafeInteger(requestedRevision)) {
      this.events
        .filter((event: DomainEventEnvelope): boolean => event.revision > requestedRevision)
        .forEach((event: DomainEventEnvelope): void => {
          response.write(formatEvent(event));
        });
    }

    const subscriber: EventSubscriber = {
      heartbeat: setInterval((): void => {
        response.write(': heartbeat\n\n');
      }, HEARTBEAT_INTERVAL_MS),
      response,
    };
    this.subscribers.add(subscriber);

    let disposed: boolean = false;
    return (): void => {
      if (disposed) {
        return;
      }
      disposed = true;
      clearInterval(subscriber.heartbeat);
      this.subscribers.delete(subscriber);
      if (!response.destroyed && !response.writableEnded) {
        response.end();
      }
    };
  };

  public close = (): void => {
    this.subscribers.forEach((subscriber: EventSubscriber): void => {
      clearInterval(subscriber.heartbeat);
      subscriber.response.end();
    });
    this.subscribers.clear();
  };
}
