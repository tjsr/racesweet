import { createIracingAgentApi } from './iracingAgentApiClient.js';

describe('createIracingAgentApi', () => {
  afterEach((): void => {
    vi.unstubAllGlobals();
  });

  it('identifies an unreachable RaceSweet server when login cannot connect', async () => {
    const fetchImplementation: typeof fetch = (): Promise<Response> =>
      Promise.reject(new TypeError('connect ECONNREFUSED 127.0.0.1:3001'));
    vi.stubGlobal('fetch', fetchImplementation);
    const api = createIracingAgentApi('http://127.0.0.1:3001');

    await expect(api.login({ password: 'password', username: 'agent' })).rejects.toThrow(
      'RaceSweet request POST http://127.0.0.1:3001/api/v1/auth/login could not reach the server: '
      + 'connect ECONNREFUSED 127.0.0.1:3001. Confirm RACESWEET_URL points to a running RaceSweet server.',
    );
  });

  it('identifies the configured endpoint when the reachable server rejects login', async () => {
    let requestedMethod: string | undefined;
    let requestedUrl: string | undefined;
    const fetchImplementation: typeof fetch = (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      requestedMethod = init?.method;
      requestedUrl = input.toString();
      return Promise.resolve(new Response('', {
        status: 405,
        statusText: 'Method Not Allowed',
      }));
    };
    vi.stubGlobal('fetch', fetchImplementation);
    const api = createIracingAgentApi('https://racesweet.example.com');

    await expect(api.login({ password: 'password', username: 'agent' })).rejects.toThrow(
      'RaceSweet request POST https://racesweet.example.com/api/v1/auth/login returned HTTP 405 Method Not Allowed. '
      + 'The server is reachable, but this RaceSweet endpoint was not found or does not accept this request. '
      + 'Confirm RACESWEET_URL points to the RaceSweet application root and that any reverse proxy forwards this endpoint.',
    );
    expect(requestedMethod).toBe('POST');
    expect(requestedUrl).toBe('https://racesweet.example.com/api/v1/auth/login');
  });

  it('posts standard crossing records to the shared timing endpoint and logs the payload', async () => {
    let requestBody: string | undefined;
    let requestedUrl: string | undefined;
    const fetchImplementation: typeof fetch = (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      requestBody = init?.body?.toString();
      requestedUrl = input.toString();
      return Promise.resolve(new Response('', { status: 200 }));
    };
    const consoleLog = vi.spyOn(console, 'log').mockImplementation((): void => undefined);
    vi.stubGlobal('fetch', fetchImplementation);
    const api = createIracingAgentApi('http://127.0.0.1:3001');

    await api.sendRecords('iracing-agent', 'active', [{
      customerId: 42,
      id: 'session-1:42:finish:3',
      kind: 'finish',
      lapNumber: 3,
      lineId: 'finish',
      occurredAt: '2026-08-17T05:00:00.000Z',
      sessionId: 'session-1',
      sessionTimeSeconds: 120,
    }]);

    expect(requestedUrl).toBe('http://127.0.0.1:3001/api/v1/timing/crossing');
    expect(JSON.parse(requestBody || '{}')).toEqual({
      crossings: [{
        chipCode: 42,
        dataLine: JSON.stringify({
          customerId: 42,
          id: 'session-1:42:finish:3',
          kind: 'finish',
          lapNumber: 3,
          lineId: 'finish',
          occurredAt: '2026-08-17T05:00:00.000Z',
          sessionId: 'session-1',
          sessionTimeSeconds: 120,
        }),
        id: 'session-1:42:finish:3',
        recordType: 16,
        source: 'iracing-agent',
        time: '2026-08-17T05:00:00.000Z',
      }],
      sessionId: 'active',
      sourceId: 'iracing-agent',
    });
    expect(consoleLog).toHaveBeenCalledWith(
      'Sending RaceSweet crossing records:',
      requestBody,
    );
  });
});
