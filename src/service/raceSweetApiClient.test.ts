import type { DomainEventEnvelope } from '../model/serverApi.js';
import { HttpRaceSweetApiClient } from './raceSweetApiClient.js';

class TestEventSource {
  public static latest: TestEventSource | undefined;
  private readonly listeners = new Map<string, EventListener>();
  public readonly url: string;
  public readonly withCredentials: boolean;

  public constructor(url: string | URL, options?: EventSourceInit) {
    this.url = url.toString();
    this.withCredentials = options?.withCredentials === true;
    TestEventSource.latest = this;
  }

  public addEventListener = (name: string, listener: EventListener): void => {
    this.listeners.set(name, listener);
  };

  public close = vi.fn();

  public emit = (name: string, data: string = ''): void => {
    this.listeners.get(name)?.({ data } as MessageEvent<string>);
  };
}

describe.each(['electron', 'web'] as const)('HttpRaceSweetApiClient in %s mode', (runtime) => {
  it('invokes the default browser fetch directly from the global object', async () => {
    const fetchImplementation = vi.fn(function (
      this: typeof globalThis,
    ): Promise<Response> {
      if (this !== globalThis) {
        throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
      }
      return Promise.resolve(new Response(JSON.stringify({
        setupRequired: true,
      }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }));
    });
    vi.stubGlobal('fetch', fetchImplementation);
    vi.stubGlobal('EventSource', TestEventSource);
    const client: HttpRaceSweetApiClient = new HttpRaceSweetApiClient(
      'http://localhost:4567',
    );

    await expect(client.status()).resolves.toEqual({ setupRequired: true });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it('calls fetch with the browser global as its receiver', async () => {
    const fetchImplementation = vi.fn(function (
      this: typeof globalThis,
    ): Promise<Response> {
      if (this !== globalThis) {
        throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
      }
      return Promise.resolve(new Response(JSON.stringify({
        setupRequired: true,
      }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }));
    });
    const client: HttpRaceSweetApiClient = new HttpRaceSweetApiClient(
      'http://localhost:4567',
      fetchImplementation as typeof fetch,
      TestEventSource as never,
    );

    await expect(client.status()).resolves.toEqual({ setupRequired: true });
  });

  it('adds request context when fetch fails before receiving a response', async () => {
    const fetchImplementation = vi.fn((): Promise<Response> =>
      Promise.reject(new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation")));
    const client: HttpRaceSweetApiClient = new HttpRaceSweetApiClient(
      'http://localhost:4567',
      fetchImplementation as typeof fetch,
      TestEventSource as never,
    );

    await expect(client.status()).rejects.toThrow(
      "RaceSweet API request GET http://localhost:4567/api/v1/auth/status failed before receiving a response: Failed to execute 'fetch' on 'Window': Illegal invocation",
    );
  });

  it('uses the same authenticated bootstrap and live-event contracts', async () => {
    const fetchImplementation = vi.fn(async (): Promise<Response> => new Response(JSON.stringify({
      catalog: {},
      permissions: [],
      revision: 0,
      runtimeCapabilities: { runtime },
      systemConfiguration: {},
      timing: { records: [] },
      user: { id: 'user-1', role: 'operator', username: 'operator' },
    }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    }));
    const client: HttpRaceSweetApiClient = new HttpRaceSweetApiClient(
      'http://localhost:4567',
      fetchImplementation as typeof fetch,
      TestEventSource as never,
    );

    const bootstrap = await client.bootstrap(runtime);
    expect(bootstrap.runtimeCapabilities.runtime).toBe(runtime);
    expect(fetchImplementation).toHaveBeenCalledWith(
      `http://localhost:4567/api/v1/bootstrap?runtime=${runtime}`,
      expect.objectContaining({ credentials: 'include' }),
    );

    const received: DomainEventEnvelope[] = [];
    const resync = vi.fn();
    const dispose: () => void = client.subscribe(
      (event: DomainEventEnvelope): void => {
        received.push(event);
      },
      resync,
    );
    const event: DomainEventEnvelope = {
      aggregate: 'catalog',
      id: 'event-1',
      occurredAt: '2026-07-28T00:00:00.000Z',
      payload: {},
      revision: 1,
      type: 'catalog.mutations-applied',
    };
    const decoderDataEvent: DomainEventEnvelope = {
      aggregate: 'source',
      id: 'event-2',
      occurredAt: '2026-07-28T00:00:01.000Z',
      payload: { data: '1,123,7B,"09:00:01.250"\n', sourceId: 'rfid-decoder' },
      revision: 2,
      type: 'source.rfid-decoder-data',
    };
    TestEventSource.latest!.emit('catalog.mutations-applied', JSON.stringify(event));
    TestEventSource.latest!.emit('source.rfid-decoder-data', JSON.stringify(decoderDataEvent));
    TestEventSource.latest!.emit('open');
    TestEventSource.latest!.emit('resync-required');

    expect(TestEventSource.latest?.url).toBe('http://localhost:4567/api/v1/events');
    expect(TestEventSource.latest?.withCredentials).toBe(true);
    expect(received).toEqual([event, decoderDataEvent]);
    expect(resync).toHaveBeenCalledTimes(2);
    dispose();
    expect(TestEventSource.latest?.close).toHaveBeenCalledOnce();
  });
});
