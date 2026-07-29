import type {
  ApplicationBootstrap,
  AuthenticatedUser,
  AuthenticationStatus,
  DomainEventEnvelope,
  LoginRequest,
  RaceSweetApiClient,
  RuntimeCapabilities,
  SetupRequest,
} from '../model/serverApi.js';

type FetchImplementation = typeof fetch;
type EventSourceConstructor = new (url: string | URL, eventSourceInitDict?: EventSourceInit) => EventSource;

const invokeBrowserFetch: FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => globalThis.fetch(input, init);

const readApiResponse = async <TValue>(response: Response): Promise<TValue> => {
  if (!response.ok) {
    const body: { error?: string } = await response.json().catch((): { error?: string } => ({}));
    throw new Error(body.error || `RaceSweet API returned HTTP ${response.status}.`);
  }
  return response.json() as Promise<TValue>;
};

export class HttpRaceSweetApiClient implements RaceSweetApiClient {
  private readonly eventSourceConstructor: EventSourceConstructor;
  private readonly fetchImplementation: FetchImplementation;
  private readonly origin: string;

  public constructor(
    origin: string = globalThis.location?.origin || '',
    fetchImplementation?: FetchImplementation,
    eventSourceConstructor: EventSourceConstructor = EventSource,
  ) {
    this.origin = origin.replace(/\/$/u, '');
    // Do not capture and detach the browser-native Window.fetch method. Electron
    // can reject even a subsequently bound cross-context function. The default
    // wrapper resolves and invokes globalThis.fetch as a method at request time.
    this.fetchImplementation = fetchImplementation
      ? fetchImplementation.bind(globalThis)
      : invokeBrowserFetch;
    this.eventSourceConstructor = eventSourceConstructor;
  }

  public bootstrap = (runtime: RuntimeCapabilities['runtime']): Promise<ApplicationBootstrap> =>
    this.request<ApplicationBootstrap>(`/api/v1/bootstrap?runtime=${runtime}`, {
      method: 'GET',
    });

  public login = (request: LoginRequest): Promise<AuthenticatedUser> =>
    this.request<AuthenticatedUser>('/api/v1/auth/login', {
      body: JSON.stringify(request),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

  public logout = (): Promise<void> =>
    this.request<Record<string, never>>('/api/v1/auth/logout', {
      method: 'POST',
    }).then((): void => undefined);

  public setup = (request: SetupRequest): Promise<AuthenticatedUser> =>
    this.request<AuthenticatedUser>('/api/v1/auth/setup', {
      body: JSON.stringify(request),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

  public status = (): Promise<AuthenticationStatus> =>
    this.request<AuthenticationStatus>('/api/v1/auth/status', {
      method: 'GET',
    });

  public subscribe = (
    onEvent: (event: DomainEventEnvelope) => void,
    onResyncRequired: () => void,
  ): (() => void) => {
    const source: EventSource = new this.eventSourceConstructor(
      `${this.origin}/api/v1/events`,
      { withCredentials: true },
    );
    const handleDomainEvent = (message: MessageEvent<string>): void => {
      onEvent(JSON.parse(message.data) as DomainEventEnvelope);
    };
    [
      'catalog.mutations-applied',
      'race-admin.changed',
      'server.listener-updated',
      'source.file-uploaded',
      'system-config.changed',
      'timing.records-received',
    ].forEach((eventName: string): void => {
      source.addEventListener(eventName, handleDomainEvent as EventListener);
    });
    source.addEventListener('open', onResyncRequired);
    source.addEventListener('resync-required', onResyncRequired);
    return (): void => source.close();
  };

  private request = async <TValue>(requestPath: string, init: RequestInit): Promise<TValue> => {
    const requestUrl: string = `${this.origin}${requestPath}`;
    let response: Response;
    try {
      response = await this.fetchImplementation(requestUrl, {
        ...init,
        credentials: 'include',
      });
    } catch (error: unknown) {
      const method: string = init.method || 'GET';
      const message: string = error instanceof Error ? error.message : String(error);
      throw new Error(
        `RaceSweet API request ${method} ${requestUrl} failed before receiving a response: ${message}`,
        { cause: error },
      );
    }
    return readApiResponse<TValue>(response);
  };
}
