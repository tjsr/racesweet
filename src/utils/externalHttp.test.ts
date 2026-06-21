// @vitest-environment jsdom

const electronMocks = vi.hoisted(() => ({
  sessionFetch: vi.fn(),
}));

vi.mock('electron', () => ({
  session: {
    defaultSession: {
      fetch: electronMocks.sessionFetch,
    },
  },
}));

import { fetchExternalHttp, isSensitiveHeader } from './externalHttp.js';

describe('fetchExternalHttp', () => {
  afterEach(() => {
    delete (globalThis.window as unknown as { api?: unknown }).api;
    vi.restoreAllMocks();
    electronMocks.sessionFetch.mockReset();
  });

  it('prefers the renderer IPC external HTTP proxy when window.api is available', async () => {
    const requestExternalHttp = vi.fn(async () => ({
      bodyBase64: Buffer.from('{"via":"ipc"}').toString('base64'),
      headers: { 'content-type': 'application/json' },
      ok: true,
      status: 200,
      statusText: 'OK',
      url: 'https://apicalracetiming.com.au/RaceResult/Event/ExportToExcel?eventId=69',
    }));

    (globalThis.window as unknown as {
      api?: {
        requestExternalHttp: typeof requestExternalHttp;
      };
    }).api = {
      requestExternalHttp,
    };

    const response = await fetchExternalHttp(
      'https://apicalracetiming.com.au/RaceResult/Event/ExportToExcel?eventId=69',
      {
        headers: {
          Cookie: 'session=renderer-cookie',
          'X-Requested-With': 'XMLHttpRequest',
        },
        method: 'GET',
        timeoutMs: 5000,
      }
    );

    expect(electronMocks.sessionFetch).not.toHaveBeenCalled();
    expect(requestExternalHttp).toHaveBeenCalledWith({
      headers: {
        cookie: 'session=renderer-cookie',
        'x-requested-with': 'XMLHttpRequest',
      },
      method: 'GET',
      timeoutMs: 5000,
      url: 'https://apicalracetiming.com.au/RaceResult/Event/ExportToExcel?eventId=69',
    });
    expect(await response.json()).toEqual({ via: 'ipc' });
  });

  it('uses Electron session fetch as the external HTTP proxy when available', async () => {
    const responseHeaders = new Headers({
      'content-type': 'application/json',
    }) as Headers & { getSetCookie: () => string[] };
    responseHeaders.getSetCookie = () => ['ASP.NET_SessionId=abc123; path=/; HttpOnly'];
    electronMocks.sessionFetch.mockResolvedValueOnce({
      arrayBuffer: async () => Buffer.from('{"ok":true}'),
      headers: responseHeaders,
      ok: true,
      status: 200,
      statusText: 'OK',
      url: 'https://apicalracetiming.com.au/RaceResult/Event/ExportToExcel?eventId=69',
    } as unknown as Response);

    const response = await fetchExternalHttp(
      'https://apicalracetiming.com.au/RaceResult/Event/ExportToExcel?eventId=69',
      {
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
        },
        method: 'GET',
        timeoutMs: 5000,
      }
    );

    expect(electronMocks.sessionFetch).toHaveBeenCalledWith(
      'https://apicalracetiming.com.au/RaceResult/Event/ExportToExcel?eventId=69',
      expect.objectContaining({
        headers: {
          'x-requested-with': 'XMLHttpRequest',
        },
        method: 'GET',
      })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toBe('ASP.NET_SessionId=abc123; path=/; HttpOnly');
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe('isSensitiveHeader', () => {
  it.each([
    'authorization',
    'cookie',
    'set-cookie',
    'x-api-token',
    'x-client-secret',
    'api-key',
  ])('identifies %s as sensitive', (headerName) => {
    expect(isSensitiveHeader(headerName)).toBe(true);
  });

  it.each([
    ['Authorization', 'authorization'],
    ['COOKIE', 'cookie'],
    ['Set-Cookie', 'set-cookie'],
    ['X-Api-Token', 'x-api-token'],
    ['X-Client-Secret', 'x-client-secret'],
    ['Api-Key', 'api-key'],
  ])('treats %s the same as %s', (headerName, normalizedHeaderName) => {
    expect(isSensitiveHeader(headerName)).toBe(isSensitiveHeader(normalizedHeaderName));
  });

  it.each([
    'accept',
    'content-type',
    'user-agent',
    'x-requested-with',
    'cache-control',
  ])('does not identify %s as sensitive', (headerName) => {
    expect(isSensitiveHeader(headerName)).toBe(false);
  });
});
