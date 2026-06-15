import { fetchExternalHttpProxy, toExternalHttpHeaderRecord } from './externalHttpProxy.js';

describe('external HTTP proxy', () => {
  afterEach(() => {
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
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      arrayBuffer: async () => Buffer.from('{"ok":true}'),
      headers: responseHeaders,
      ok: true,
      status: 200,
      statusText: 'OK',
      url: 'https://apicalracetiming.com.au/RaceResult/Event/ExportToExcel?eventId=67',
    } as unknown as Response);

    const response = await fetchExternalHttpProxy({
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
      },
      method: 'GET',
      url: 'https://apicalracetiming.com.au/RaceResult/Event/ExportToExcel?eventId=67',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://apicalracetiming.com.au/RaceResult/Event/ExportToExcel?eventId=67',
      expect.objectContaining({
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
        },
        method: 'GET',
      })
    );
    expect(response.headers['set-cookie']).toBe('ASP.NET_SessionId=abc123; path=/; HttpOnly');
    expect(Buffer.from(response.bodyBase64, 'base64').toString('utf8')).toBe('{"ok":true}');
  });
});
