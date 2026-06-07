import { fetchApicalEvents, pullApicalRaceState } from './apicalDataSource.js';
import { v1 as randomUUID, v5 as uuidv5 } from 'uuid';

import type { DataSourceConfig } from './systemConfig.js';
import type { EventId } from '../model/raceevent.js';

const convertDataToRaceState = vi.fn();

vi.mock('../parsers/apical.js', () => ({
  convertDataToRaceState: (...args: unknown[]) => convertDataToRaceState(...args),
}));

const createApicalSource = (): DataSourceConfig => ({
  apiConfig: {
    authHeaderName: 'Authorization',
    authHeaderValue: 'Bearer test-token',
    baseUrl: 'https://apical.example.com',
    companyId: 12,
    httpTimeoutSeconds: 5,
    live: false,
    pollIntervalSeconds: 30,
    selectedEventIds: [301],
  },
  enabled: true,
  id: 'source-apical',
  listedEvents: [],
  name: 'Apical Source',
  type: 'api-apical-data-file',
});

describe('apicalDataSource', () => {
  beforeEach(() => {
    convertDataToRaceState.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches public Apical event lists without a failing root authentication request', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify([
        {
          CompanyName: 'Acme Timing',
          EventDate: '2026-08-01',
          Id: 301,
          Name: 'Round 3',
        },
      ]), { status: 200 }));

    const source = createApicalSource();
    source.apiConfig!.authHeaderValue = '';

    const events = await fetchApicalEvents(source);

    expect(events).toEqual([
      {
        companyName: 'Acme Timing',
        eventDate: '2026-08-01',
        id: 301,
        name: 'Round 3',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0] || '')).toContain('/raceresult/event/getall');
  });

  it('warms an authenticated session using the Apical Excel export endpoint before fetching events', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        FileGuid: 'file-guid',
        FileName: 'Round 3.xlsx',
      }), {
        headers: {
          'set-cookie': 'session=abc123',
        },
        status: 200,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    await fetchApicalEvents(createApicalSource());

    const authCallOptions = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const authHeaders = authCallOptions.headers as Headers;
    const eventCallOptions = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const eventHeaders = eventCallOptions.headers as Headers;

    expect(String(fetchMock.mock.calls[0]?.[0] || '')).toContain('/RaceResult/Event/ExportToExcel?eventId=301');
    expect(authHeaders.get('Authorization')).toBe('Bearer test-token');
    expect(authHeaders.get('X-Requested-With')).toBe('XMLHttpRequest');
    expect(String(fetchMock.mock.calls[1]?.[0] || '')).toContain('/raceresult/event/getall');
    expect(eventHeaders.get('Authorization')).toBe('Bearer test-token');
    expect(eventHeaders.get('Cookie')).toBe('session=abc123');
  });

  it('throws clear error when Apical event list request fails', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('Apical says this session is not authenticated', { status: 401, statusText: 'Unauthorized' }));

    const source = createApicalSource();
    source.apiConfig!.authHeaderValue = '';

    await expect(fetchApicalEvents(source)).rejects.toThrow(
      /Apical event list request returned HTTP 401 Unauthorized\.[\s\S]*URL: https:\/\/apical\.example\.com\/raceresult\/event\/getall\?companyId=12&_=.+[\s\S]*HTTP status: 401 Unauthorized[\s\S]*Request headers:[\s\S]*accept: application\/json[\s\S]*Response body: Apical says this session is not authenticated/
    );
  });

  it('throws authentication error details with request URL and response body', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('Login token was rejected', { status: 403, statusText: 'Forbidden' }));

    await expect(fetchApicalEvents(createApicalSource())).rejects.toThrow(
      /Apical authentication request returned HTTP 403 Forbidden\.[\s\S]*URL: https:\/\/apical\.example\.com\/RaceResult\/Event\/ExportToExcel\?eventId=301&_=.+[\s\S]*HTTP status: 403 Forbidden[\s\S]*Request headers:[\s\S]*accept: application\/json[\s\S]*authorization: \[redacted, 17 chars\][\s\S]*x-requested-with: XMLHttpRequest[\s\S]*Response body: Login token was rejected/
    );
  });

  it('throws event list error details with forwarded session cookie header redacted', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        FileGuid: 'file-guid',
        FileName: 'Round 3.xlsx',
      }), {
        headers: {
          'set-cookie': 'session=abc123',
        },
        status: 200,
      }))
      .mockResolvedValueOnce(new Response('Session cookie was rejected', { status: 401, statusText: 'Unauthorized' }));

    await expect(fetchApicalEvents(createApicalSource())).rejects.toThrow(
      /Apical event list request returned HTTP 401 Unauthorized\.[\s\S]*Request headers:[\s\S]*authorization: \[redacted, 17 chars\][\s\S]*cookie: \[redacted, 14 chars\][\s\S]*Response body: Session cookie was rejected/
    );
  });

  it('throws clear error when pulling race state without a selected Apical event id', async () => {
    const source = createApicalSource();
    source.apiConfig!.apicalEventId = undefined;
    source.apiConfig!.selectedEventIds = [];

    await expect(pullApicalRaceState(source, 'event-1')).rejects.toThrow('No Apical event id is configured for this source.');
  });

  it('pulls public Apical event data without a failing root authentication request', async () => {
    convertDataToRaceState.mockReturnValue({});

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    const source = createApicalSource();
    source.apiConfig!.authHeaderValue = '';

    await pullApicalRaceState(source, 'event-2026-round-1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0] || '')).toContain('/raceresult/event/datafile?eventId=301');
  });

  it('warms an authenticated session before pulling selected Apical event data file', async () => {
    const converted = {
      categories: [{ id: uuidv5('cat-1', randomUUID()), name: 'Category 1' }],
      participants: [{ entrantId: uuidv5('ent-1', randomUUID()), id: uuidv5('p-1', randomUUID()) }],
      records: [{ crossingId: uuidv5('x-1', randomUUID()) }],
    };
    convertDataToRaceState.mockReturnValue(converted);

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        FileGuid: 'file-guid',
        FileName: 'Round 3.xlsx',
      }), {
        headers: {
          'set-cookie': 'session=xyz',
        },
        status: 200,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    const round1EventId: EventId = uuidv5('event-2026-round-1', uuidv5.URL);
    const result = await pullApicalRaceState(createApicalSource(), round1EventId);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0] || '')).toContain('/RaceResult/Event/ExportToExcel?eventId=301');
    expect(String(fetchMock.mock.calls[1]?.[0] || '')).toContain('/raceresult/event/datafile?eventId=301');
    expect(convertDataToRaceState).toHaveBeenCalledWith(round1EventId, expect.any(Date), [], 200000);
    expect(result).toBe(converted);
  });
});
