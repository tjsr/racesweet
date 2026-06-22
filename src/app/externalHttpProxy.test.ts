const electronMocks = vi.hoisted(() => ({
  cookiesGet: vi.fn(),
  sessionFetch: vi.fn(),
}));

vi.mock('electron', () => ({
  session: {
    defaultSession: {
      cookies: {
        get: electronMocks.cookiesGet,
      },
      fetch: electronMocks.sessionFetch,
    },
  },
}));

import { fetchExternalHttpProxy, toExternalHttpHeaderRecord } from './externalHttpProxy.js';

describe('external HTTP proxy', () => {
  afterEach(() => {
    electronMocks.cookiesGet.mockReset();
    electronMocks.sessionFetch.mockReset();
    vi.restoreAllMocks();
  });

  it('preserves set-cookie headers that are exposed through getSetCookie', () => {
    const headers = new Headers({
      'content-type': 'application/json',
    }) as Headers & { getSetCookie: () => string[] };
    headers.getSetCookie = () => ['ASP.NET_SessionId=abc123; path=/; HttpOnly'];

    const result = toExternalHttpHeaderRecord(headers);

    expect(result['content-type']).toBe('application/json');
    expect(result['set-cookie']).toBe('ASP.NET_SessionId=abc123; path=/; HttpOnly');
  });

  it('returns proxied response headers with set-cookie intact for renderer callers', async () => {
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
      url: 'https://apicalracetiming.com.au/RaceResult/Event/ExportToExcel?eventId=67',
    } as unknown as Response);

    const response = await fetchExternalHttpProxy({
      credentials: 'include',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
      },
      method: 'GET',
      url: 'https://apicalracetiming.com.au/RaceResult/Event/ExportToExcel?eventId=67',
    });

    expect(electronMocks.sessionFetch).toHaveBeenCalledWith(
      'https://apicalracetiming.com.au/RaceResult/Event/ExportToExcel?eventId=67',
      expect.objectContaining({
        credentials: 'include',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
        },
        method: 'GET',
      })
    );
    expect(response.headers['set-cookie']).toBe('ASP.NET_SessionId=abc123; path=/; HttpOnly');
    expect(Buffer.from(response.bodyBase64, 'base64').toString('utf8')).toBe('{"ok":true}');
  });

  it('reads Electron session cookies when set-cookie is hidden from response headers', async () => {
    electronMocks.sessionFetch.mockResolvedValueOnce({
      arrayBuffer: async () => Buffer.from('{"ok":true}'),
      headers: new Headers({
        'content-type': 'application/json',
      }),
      ok: true,
      status: 200,
      statusText: 'OK',
      url: 'https://apicalracetiming.com.au/RaceResult/Event/ExportToExcel?eventId=67',
    } as unknown as Response);
    electronMocks.cookiesGet.mockResolvedValueOnce([
      { name: 'ASP.NET_SessionId', value: 'abc123' },
      { name: 'RaceSweetAuth', value: 'def456' },
    ]);

    const response = await fetchExternalHttpProxy({
      credentials: 'include',
      method: 'GET',
      url: 'https://apicalracetiming.com.au/RaceResult/Event/ExportToExcel?eventId=67',
    });

    expect(electronMocks.sessionFetch).toHaveBeenCalledWith(
      'https://apicalracetiming.com.au/RaceResult/Event/ExportToExcel?eventId=67',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      })
    );
    expect(electronMocks.cookiesGet).toHaveBeenCalledWith({
      url: 'https://apicalracetiming.com.au/RaceResult/Event/ExportToExcel?eventId=67',
    });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.headers.cookie).toBe('ASP.NET_SessionId=abc123; RaceSweetAuth=def456');
  });

  it('fails when Electron session cookies cannot be read after set-cookie is hidden', async () => {
    electronMocks.sessionFetch.mockResolvedValueOnce({
      arrayBuffer: async () => Buffer.from('{"ok":true}'),
      headers: new Headers({
        'content-type': 'application/json',
      }),
      ok: true,
      status: 200,
      statusText: 'OK',
      url: 'https://apicalracetiming.com.au/RaceResult/Event/ExportToExcel?eventId=67',
    } as unknown as Response);
    electronMocks.cookiesGet.mockRejectedValueOnce(new Error('cookie permission denied'));

    await expect(fetchExternalHttpProxy({
      method: 'GET',
      url: 'https://apicalracetiming.com.au/RaceResult/Event/ExportToExcel?eventId=67',
    })).rejects.toThrow('Failed to read Electron session cookies for external HTTP response: cookie permission denied');
  });
});
