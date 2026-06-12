import { createApicalCatalogEventId, fetchApicalEvents, fetchApicalRaceStateNow, pullApicalRaceState } from './apicalDataSource.js';
import { v1 as randomUUID, v5 as uuidv5 } from 'uuid';

import type { DataSourceConfig } from './systemConfig.js';
import type { EventId } from '../model/raceevent.js';
import { createEventId } from '../model/ids.js';
import XLSX from 'xlsx';

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

const createExcelResponse = (): Response => {
  const worksheet = XLSX.utils.json_to_sheet([
    {
      CategoryName: 'A',
      CumulativeLapTimeSpan: '00:01:30.2500000',
      FullName: 'Robert WOOD',
      LapNumber: 1,
      LapTimeSpan: '00:01:30.2500000',
      Position: 1,
      RaceNumber: 306,
      TeamNameDisplay: 'Robert WOOD',
    },
    {
      CategoryName: 'A',
      CumulativeLapTimeSpan: '00:03:30.5000000',
      FullName: 'Robert WOOD',
      LapNumber: 2,
      LapTimeSpan: '00:02:00.2500000',
      Position: 1,
      RaceNumber: 306,
      TeamNameDisplay: 'Robert WOOD',
    },
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Laps');
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;

  return new Response(buffer, { status: 200 });
};

const mockExcelFetch = (cookie?: string): ReturnType<typeof vi.spyOn> => vi
  .spyOn(globalThis, 'fetch')
  .mockResolvedValueOnce(new Response(JSON.stringify({
    FileGuid: 'file-guid',
    FileName: 'Round 3.xlsx',
  }), {
    headers: cookie ? { 'set-cookie': cookie } : undefined,
    status: 200,
  }))
  .mockResolvedValueOnce(createExcelResponse());

describe('apicalDataSource', () => {
  beforeEach(() => {
    convertDataToRaceState.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    if (typeof globalThis.window !== 'undefined') {
      delete (globalThis.window as unknown as { api?: unknown }).api;
    }
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

  it('uses the external HTTP IPC proxy when available in renderer context', async () => {
    if (typeof globalThis.window === 'undefined') {
      return;
    }

    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const requestExternalHttp = vi
      .fn()
      .mockResolvedValueOnce({
        bodyBase64: Buffer.from(JSON.stringify({ FileGuid: 'file-guid', FileName: 'Round 3.xlsx' })).toString('base64'),
        headers: { 'set-cookie': 'session=proxy-cookie' },
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://apical.example.com/RaceResult/Event/ExportToExcel?eventId=301',
      })
      .mockResolvedValueOnce({
        bodyBase64: Buffer.from(JSON.stringify([
          {
            CompanyName: 'Acme Timing',
            EventDate: '2026-08-01',
            Id: 301,
            Name: 'Round 3',
          },
        ])).toString('base64'),
        headers: { 'content-type': 'application/json' },
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://apical.example.com/raceresult/event/getall?companyId=12',
      });

    (globalThis.window as unknown as {
      api?: {
        requestExternalHttp: (request: unknown) => Promise<unknown>;
      };
    }).api = {
      requestExternalHttp,
    };

    const events = await fetchApicalEvents(createApicalSource());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(requestExternalHttp).toHaveBeenCalledTimes(2);
    expect(String(requestExternalHttp.mock.calls[0]?.[0]?.url || '')).toContain('/RaceResult/Event/ExportToExcel?eventId=301');
    expect(String(requestExternalHttp.mock.calls[1]?.[0]?.url || '')).toContain('/raceresult/event/getall?companyId=12');
    expect(events).toEqual([
      {
        companyName: 'Acme Timing',
        eventDate: '2026-08-01',
        id: 301,
        name: 'Round 3',
      },
    ]);

    delete (globalThis.window as unknown as { api?: unknown }).api;
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

  it('throws network failure details with request options, timeout, redacted headers, and original cause', async () => {
    const cause = Object.assign(new Error('DNS lookup failed'), { code: 'ENOTFOUND' });
    const fetchError = new TypeError('Failed to fetch', { cause });
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(fetchError);

    const source = createApicalSource();
    source.apiConfig!.httpTimeoutSeconds = 7;

    await expect(fetchApicalEvents(source)).rejects.toThrow(
      /Apical authentication request failed\.[\s\S]*URL: https:\/\/apical\.example\.com\/RaceResult\/Event\/ExportToExcel\?eventId=301&_=.+[\s\S]*Request options:[\s\S]*method: GET[\s\S]*mode: \(default\)[\s\S]*timeoutMs: 7000[\s\S]*Request headers:[\s\S]*authorization: \[redacted, 17 chars\][\s\S]*x-requested-with: XMLHttpRequest[\s\S]*Error name: TypeError[\s\S]*Error message: Failed to fetch[\s\S]*Error cause:[\s\S]*Error name: Error[\s\S]*Error message: DNS lookup failed[\s\S]*Error code: ENOTFOUND[\s\S]*Stack:/
    );
  });

  it('throws clear error when pulling race state without a selected Apical event id', async () => {
    const source = createApicalSource();
    source.apiConfig!.apicalEventId = undefined;
    source.apiConfig!.selectedEventIds = [];

    await expect(pullApicalRaceState(source, 'event-1')).rejects.toThrow('No Apical event id is configured for this source.');
  });

  it('pulls public Apical event data through the Excel export and download endpoints', async () => {
    convertDataToRaceState.mockReturnValue({});

    const fetchMock = mockExcelFetch();

    const source = createApicalSource();
    source.apiConfig!.authHeaderValue = '';

    await pullApicalRaceState(source, createEventId());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0] || '')).toContain('/RaceResult/Event/ExportToExcel?eventId=301');
    expect(String(fetchMock.mock.calls[1]?.[0] || '')).toContain('/Download/DownloadExcel?fileGuid=file-guid&filename=Round%203.xlsx');
    expect(String(fetchMock.mock.calls[0]?.[0] || '')).not.toContain('/raceresult/event/datafile');
    expect(String(fetchMock.mock.calls[1]?.[0] || '')).not.toContain('/raceresult/event/datafile');
  });

  it('exports and downloads selected Apical event Excel data with configured authentication', async () => {
    const converted = {
      categories: [{ id: uuidv5('cat-1', randomUUID()), name: 'Category 1' }],
      participants: [{ entrantId: uuidv5('ent-1', randomUUID()), id: uuidv5('p-1', randomUUID()) }],
      records: [{ crossingId: uuidv5('x-1', randomUUID()) }],
    };
    convertDataToRaceState.mockReturnValue(converted);

    const fetchMock = mockExcelFetch('session=xyz');

    const round1EventId: EventId = createEventId();
    const result = await pullApicalRaceState(createApicalSource(), round1EventId);

    const exportCallOptions = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const exportHeaders = exportCallOptions.headers as Headers;
    const downloadCallOptions = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const downloadHeaders = downloadCallOptions.headers as Headers;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0] || '')).toContain('/RaceResult/Event/ExportToExcel?eventId=301');
    expect(String(fetchMock.mock.calls[1]?.[0] || '')).toContain('/Download/DownloadExcel?fileGuid=file-guid&filename=Round%203.xlsx');
    expect(exportHeaders.get('Authorization')).toBe('Bearer test-token');
    expect(exportHeaders.get('X-Requested-With')).toBe('XMLHttpRequest');
    expect(downloadHeaders.get('Cookie')).toBe('session=xyz');
    expect(convertDataToRaceState).toHaveBeenCalledWith(round1EventId, expect.any(Date), [
      {
        CategoryName: 'A',
        ParticipantViewModels: [
          expect.objectContaining({
            LapByCategoryViewModels: [
              expect.objectContaining({
                CumulativeLapTimeSpan: '00:01:30.2500000',
                LapNumber: 1,
                LapTimeSpan: '00:01:30.2500000',
                RaceNumber: '306',
              }),
              expect.objectContaining({
                CumulativeLapTimeSpan: '00:03:30.5000000',
                LapNumber: 2,
                LapTimeSpan: '00:02:00.2500000',
                RaceNumber: '306',
              }),
            ],
            NumberOfLaps: 2,
            RaceNumbers: '306',
            TeamNameDisplay: 'Robert WOOD',
          }),
        ],
      },
    ], 200000);
    expect(result).toBe(converted);
  });

  it('fetches Apical event data now with stable catalog ids and ISO retrieval time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-08T09:10:11.123Z'));
    convertDataToRaceState.mockReturnValue({
      categories: [],
      participants: [],
      records: [],
    });

    const source = createApicalSource();
    source.apiConfig!.authHeaderValue = '';
    source.listedEvents = [
      {
        eventDate: '2026-06-07T01:30:00.000Z',
        id: 301,
        name: 'Round 3',
      },
    ];
    mockExcelFetch();

    const result = await fetchApicalRaceStateNow(source);

    expect(result).toEqual({
      apicalEventId: 301,
      eventDate: '2026-06-07T01:30:00.000Z',
      eventId: createApicalCatalogEventId(301),
      eventName: 'Round 3',
      raceState: {
        categories: [],
        participants: [],
        records: [],
      },
      retrievedAt: '2026-06-08T09:10:11.123Z',
      sessionId: 'session-apical-301',
    });
    expect(convertDataToRaceState).toHaveBeenCalledWith(createApicalCatalogEventId(301), new Date('2026-06-07T01:30:00.000Z'), [
      expect.objectContaining({
        CategoryName: 'A',
        ParticipantViewModels: [
          expect.objectContaining({
            NumberOfLaps: 2,
            RaceNumbers: '306',
            TeamNameDisplay: 'Robert WOOD',
          }),
        ],
      }),
    ], 200000);
    vi.useRealTimers();
  });
});
