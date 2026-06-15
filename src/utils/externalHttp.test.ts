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

import { fetchExternalHttp } from './externalHttp.js';

describe('fetchExternalHttp', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    electronMocks.sessionFetch.mockReset();
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
