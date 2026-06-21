import { v1 as randomUUID, v5 as uuidv5 } from 'uuid';
import XLSX from 'xlsx';
import { createEventId } from '../model/ids.js';
import type { EventId } from '../model/raceevent.js';
import { APICAL_EXCEL_DOWNLOAD_ACCEPT_HEADER } from '../utils/apical/excelDownload.js';
import { ApicalDataException } from '../errors/apicalDataException.js';
import { ApicalSpreadsheetLapsRow, createApicalCatalogEventId, fetchApicalRaceStateNow, pullApicalRaceState } from './apicalDataSource.js';
import type { DataSourceConfig } from './systemConfig.js';
import { fetchApicalEvents } from '../controllers/apical/getResultListJson.js';

const convertDataToRaceState = vi.fn();
const APICAL_APP_TEST_EVENT_ID = 670;
const APICAL_EVENT_69_FILE_GUID = '1cf63381-1269-4257-b892-ef8b33424103';
const APICAL_EVENT_69_FILE_NAME = 'Results  GMBC Autumn No Frills Round 4 2026-6-12.xlsx';
const APICAL_TEST_TIMESTAMP = 1781309520833;
const TEST_FILE_GUID = '11111111-1111-4111-8111-111111111111';

const expectRequiredDownloadHeaders = (headers: Headers, baseUrl: string, eventId: number, cookie: string): void => {
  expect(cookie).not.toBeNull();
  expect(cookie.trim()).not.toBe('');
  const trimmedBaseUrl = baseUrl.replace(/\/$/, '');
  expect(headers.get('Accept')).toBe(APICAL_EXCEL_DOWNLOAD_ACCEPT_HEADER);
  expect(headers.get('Accept-Encoding')).toBe('gzip, deflate, br, zstd');
  expect(headers.get('Cache-Control')).toBe('max-age=0');
  expect(headers.get('Cookie')).toBe(cookie);
  expect(headers.get('Referrer')).toBe(`${trimmedBaseUrl}/raceresult/event/detail?id=${eventId}`);
  expect(headers.get('Sec-Fetch-Dest')).toBe('document');
  expect(headers.get('Sec-Fetch-Mode')).toBe('navigate');
  expect(headers.get('Sec-Fetch-Site')).toBe('none');
  expect(headers.get('Sec-Fetch-User')).toBe('?1');
  expect(headers.get('Upgrade-Insecure-Requests')).toBe('1');
};

vi.mock('../parsers/apical.js', () => ({
  convertDataToRaceState: (...args: unknown[]) => convertDataToRaceState(...args),
}));

const createApicalSource = (baseHost: string): DataSourceConfig => ({
  apiConfig: {
    authHeaderName: 'Authorization',
    authHeaderValue: 'Bearer test-token',
    baseUrl: `https://${baseHost}`,
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

const createApicalEvent69Source = (baseHost: string): DataSourceConfig => {
  const source = createApicalSource(baseHost);
  return {
    ...source,
    apiConfig: {
      ...source.apiConfig!,
      authHeaderValue: '',
      baseUrl: `https://${baseHost}`,
      selectedEventIds: [APICAL_APP_TEST_EVENT_ID],
    },
  };
};

const createLapsRows = () => {
  const exampleRow: ApicalSpreadsheetLapsRow = {
    CategoryName: 'A',
    CumulativeLapTimeSpan: '00:01:30.2500000',
    FullName: 'Robert WOOD',
    LapNumber: 1,
    LapTimeSpan: '00:01:30.2500000',
    Position: 1,
    RaceNumber: 306,
    TeamNameDisplay: 'Robert WOOD',
  };

  const exampleRow2: ApicalSpreadsheetLapsRow =
  {
    ...exampleRow,
    CumulativeLapTimeSpan: '00:03:30.5000000',
    LapNumber: 2,
    LapTimeSpan: '00:02:00.2500000',
  };
  return [exampleRow, exampleRow2];
};

const createExcelBuffer = (sheetNames: string[] = ['Laps']): ArrayBuffer => {
  const workbook = XLSX.utils.book_new();
  sheetNames.forEach((sheetName) => {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(createLapsRows()), sheetName);
  });
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
};

const createExcelResponse = (): Response => new Response(createExcelBuffer(), { status: 200 });

const mockExcelFetch = (cookie: string = 'session=abc123'): ReturnType<typeof vi.spyOn> => vi
  .spyOn(globalThis, 'fetch')
  .mockResolvedValueOnce(new Response(JSON.stringify({
    FileGuid: TEST_FILE_GUID,
    FileName: 'Round 3.xlsx',
  }), {
    headers: { 'set-cookie': cookie },
    status: 200,
  }))
  .mockResolvedValueOnce(createExcelResponse());

const getFetchUrl = (fetchMock: ReturnType<typeof vi.spyOn>, callIndex: number): string => {
  return String(fetchMock.mock.calls[callIndex]?.[0] || '');
};

const getFetchHeaders = (fetchMock: ReturnType<typeof vi.spyOn>, callIndex: number): Headers => {
  return new Headers((fetchMock.mock.calls[callIndex]?.[1] as RequestInit).headers);
};

const expectConvertedLapsPayload = (eventId: EventId): void => {
  expect(convertDataToRaceState).toHaveBeenCalledWith(eventId, expect.any(Date), [
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
};

describe('apicalDataSource', () => {
  beforeEach(() => {
    convertDataToRaceState.mockReset();
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
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

    const requestHost = 'apical.example.com';
    const source = createApicalSource(requestHost);
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
        FileGuid: TEST_FILE_GUID,
        FileName: 'Round 3.xlsx',
      }), {
        headers: {
          'set-cookie': 'session=abc123',
        },
        status: 200,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    const requestHost = 'apical.example.com';
    await fetchApicalEvents(createApicalSource(requestHost));

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

    const requestHost = 'apical.example.com';
    const events = await fetchApicalEvents(createApicalSource(requestHost));

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
      .mockResolvedValueOnce(new Response('Apical says this session is not authenticated', {
        headers: {
          'content-type': 'text/plain',
          'x-apical-request-id': 'request-401',
        },
        status: 401,
        statusText: 'Unauthorized',
      }));

    const requestHost = 'apical.example.com';
    const source = createApicalSource(requestHost);
    source.apiConfig!.authHeaderValue = '';

    await expect(fetchApicalEvents(source)).rejects.toThrow(
      /Apical event list request returned HTTP 401 Unauthorized\.[\s\S]*URL: https:\/\/apical\.example\.com\/raceresult\/event\/getall\?companyId=12&_=.+[\s\S]*HTTP status: 401 Unauthorized[\s\S]*Request headers:[\s\S]*accept: application\/json[\s\S]*Response headers:[\s\S]*content-type: text\/plain[\s\S]*x-apical-request-id: request-401[\s\S]*Response body: Apical says this session is not authenticated/
    );
  });

  it('throws authentication error details with request URL and response body', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('Login token was rejected', { status: 403, statusText: 'Forbidden' }));

    const requestHost = 'apical.example.com';
    await expect(fetchApicalEvents(createApicalSource(requestHost))).rejects.toThrow(
      /Apical authentication request returned HTTP 403 Forbidden\.[\s\S]*URL: https:\/\/apical\.example\.com\/RaceResult\/Event\/ExportToExcel\?eventId=301&_=.+[\s\S]*HTTP status: 403 Forbidden[\s\S]*Request headers:[\s\S]*accept: application\/json[\s\S]*authorization: \[redacted, 17 chars; present\][\s\S]*x-requested-with: XMLHttpRequest[\s\S]*Response headers:[\s\S]*Response body: Login token was rejected/
    );
  });

  it('throws event list error details with forwarded session cookie header redacted', async () => {
    const debugMock = vi.mocked(console.debug);
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
      .mockResolvedValueOnce(new Response('Session cookie was rejected', {
        headers: {
          'set-cookie': 'session=expired',
        },
        status: 401,
        statusText: 'Unauthorized',
      }));

    const requestHost = 'apical.example.com';
    await expect(fetchApicalEvents(createApicalSource(requestHost))).rejects.toThrow(
      /Apical event list request returned HTTP 401 Unauthorized\.[\s\S]*Request headers:[\s\S]*authorization: \[redacted, 17 chars; present\][\s\S]*cookie: \[redacted, 14 chars; present\][\s\S]*Response headers:[\s\S]*Response body: Session cookie was rejected/
    );
    const debugOutput = debugMock.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(debugOutput).toContain('set-cookie: session=abc123');
    expect(debugOutput).toContain('cookie: session=abc123');
    expect(debugOutput).toContain('set-cookie: session=expired');
  });

  it('throws network failure details with request options, timeout, redacted headers, and original cause', async () => {
    const cause = Object.assign(new Error('DNS lookup failed'), { code: 'ENOTFOUND' });
    const fetchError = new TypeError('Failed to fetch', { cause });
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(fetchError);

    const requestHost = 'apical.example.com';
    const source = createApicalSource(requestHost);
    source.apiConfig!.httpTimeoutSeconds = 7;

    await expect(fetchApicalEvents(source)).rejects.toThrow(
      /Apical authentication request failed/
    );
  });

  it('throws clear error when pulling race state without a selected Apical event id', async () => {
    const requestHost = 'apical.example.com';
    const source = createApicalSource(requestHost);
    source.apiConfig!.apicalEventId = undefined;
    source.apiConfig!.selectedEventIds = [];

    await expect(pullApicalRaceState(source, 'event-1')).rejects.toThrow('No Apical event id is configured for this source.');
  });

  it('exports configured Apical app event 69 using the selected Apical event id', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1781309520833));
    convertDataToRaceState.mockReturnValue({
      categories: [],
      participants: [],
      records: [],
    });

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        FileGuid: APICAL_EVENT_69_FILE_GUID,
        FileName: APICAL_EVENT_69_FILE_NAME,
      }), {
        headers: {
          'set-cookie': 'session=event69',
        },
        status: 200,
      }))
      .mockResolvedValueOnce(new Response(createExcelBuffer(['Laps', 'Sheet1']), { status: 200 }));

    const source = createApicalEvent69Source('apicalracetiming.com.au');
    const result = await fetchApicalRaceStateNow(source);

    const timestamp = 1781309520833;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getFetchUrl(fetchMock, 0)).toBe(`https://apicalracetiming.com.au/RaceResult/Event/ExportToExcel?eventId=${APICAL_APP_TEST_EVENT_ID}&_=${timestamp}`);
    expect(result.apicalEventId).toBe(APICAL_APP_TEST_EVENT_ID);
  });

  it('downloads event 69 Excel using the returned GUID file and session cookie', async () => {
    convertDataToRaceState.mockReturnValue({});

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        FileGuid: APICAL_EVENT_69_FILE_GUID,
        FileName: APICAL_EVENT_69_FILE_NAME,
      }), {
        headers: {
          'set-cookie': 'session=event69',
        },
        status: 200,
      }))
      .mockResolvedValueOnce(new Response(createExcelBuffer(), { status: 200 }));

    await fetchApicalRaceStateNow(createApicalEvent69Source('apicalracetiming.com.au'));

    expect(APICAL_EVENT_69_FILE_GUID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(getFetchUrl(fetchMock, 1)).toBe('https://apicalracetiming.com.au/Download/DownloadExcel?fileGuid=1cf63381-1269-4257-b892-ef8b33424103&filename=Results%20%20GMBC%20Autumn%20No%20Frills%20Round%204%202026-6-12.xlsx');
    expectRequiredDownloadHeaders(getFetchHeaders(fetchMock, 1), 'https://apicalracetiming.com.au', APICAL_APP_TEST_EVENT_ID, 'session=event69');
  });

  it('parses a valid two-sheet Apical workbook before converting event 69 race state', async () => {
    convertDataToRaceState.mockReturnValue({
      categories: [],
      participants: [],
      records: [],
    });

    vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        FileGuid: APICAL_EVENT_69_FILE_GUID,
        FileName: APICAL_EVENT_69_FILE_NAME,
      }), {
        headers: {
          'set-cookie': 'session=event69',
        },
        status: 200,
      }))
      .mockResolvedValueOnce(new Response(createExcelBuffer(['Laps', 'Sheet1']), { status: 200 }));

    const eventDataSource: DataSourceConfig = createApicalEvent69Source('apicalracetiming.com.au');
    const result = await fetchApicalRaceStateNow(eventDataSource);

    expectConvertedLapsPayload(createApicalCatalogEventId(APICAL_APP_TEST_EVENT_ID));
    expect(result.raceState).toEqual({
      categories: [],
      participants: [],
      records: [],
    });
  });

  it('rejects Apical Excel export responses that do not return a GUID file id', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        FileGuid: 'not-a-guid',
        FileName: APICAL_EVENT_69_FILE_NAME,
      }), { status: 200 }));

    const promise = pullApicalRaceState(createApicalEvent69Source('apicalracetiming.com.au'), createEventId());
    await expect(promise).rejects.toThrow(ApicalDataException);
    await expect(promise).rejects.toThrow(/Apical Excel export response payload was invalid/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws an Apical data exception when the Excel download response is empty', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        FileGuid: APICAL_EVENT_69_FILE_GUID,
        FileName: APICAL_EVENT_69_FILE_NAME,
      }), {
        headers: {
          'set-cookie': 'session=event69',
        },
        status: 200,
      }))
      .mockResolvedValueOnce(new Response(new ArrayBuffer(0), {
        headers: {
          'content-length': '0',
          'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'x-apical-request-id': 'download-empty',
        },
        status: 200,
        statusText: 'OK',
      }));

    const promise = pullApicalRaceState(createApicalEvent69Source('apicalracetiming.com.au'), createEventId());
    await expect(promise).rejects.toThrow(ApicalDataException);
    await expect(promise).rejects.toThrow(/Apical Excel file downloaded from url https:\/\/apicalracetiming\.com\.au\/Download\/DownloadExcel\?fileGuid=1cf63381-1269-4257-b892-ef8b33424103&filename=Results%20%20GMBC%20Autumn%20No%20Frills%20Round%204%202026-6-12\.xlsx was empty[\s\S]*Response status: 200 OK[\s\S]*Response headers:[\s\S]*content-length: 0[\s\S]*content-type: application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet[\s\S]*x-apical-request-id: download-empty/);
  });

  it('pulls public Apical event data through the Excel export and download endpoints', async () => {
    convertDataToRaceState.mockReturnValue({});

    const fetchMock = mockExcelFetch();

    const requestHost = 'apical.example.com';
    const source = createApicalSource(requestHost);
    source.apiConfig!.authHeaderValue = '';

    await pullApicalRaceState(source, createEventId());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0] || '')).toContain('/RaceResult/Event/ExportToExcel?eventId=301');
    expect(String(fetchMock.mock.calls[1]?.[0] || '')).toContain('/Download/DownloadExcel?fileGuid=11111111-1111-4111-8111-111111111111&filename=Round%203.xlsx');
    expectRequiredDownloadHeaders(new Headers((fetchMock.mock.calls[1]?.[1] as RequestInit).headers), 'https://apical.example.com', 301, 'session=abc123');
    expect(String(fetchMock.mock.calls[0]?.[0] || '')).not.toContain('/raceresult/event/datafile');
    expect(String(fetchMock.mock.calls[1]?.[0] || '')).not.toContain('/raceresult/event/datafile');
  });

  it('exports selected Apical event Excel data with configured authentication', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(APICAL_TEST_TIMESTAMP));
    const converted = {
      categories: [{ id: uuidv5('cat-1', randomUUID()), name: 'Category 1' }],
      participants: [{ entrantId: uuidv5('ent-1', randomUUID()), id: uuidv5('p-1', randomUUID()) }],
      records: [{ crossingId: uuidv5('x-1', randomUUID()) }],
    };
    convertDataToRaceState.mockReturnValue(converted);

    const fetchMock = mockExcelFetch('session=xyz');

    const round1EventId: EventId = createEventId();
    const requestHost = 'apical.example.com';
    const result = await pullApicalRaceState(createApicalSource(requestHost), round1EventId);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getFetchUrl(fetchMock, 0)).toBe(`https://${requestHost}/RaceResult/Event/ExportToExcel?eventId=301&_=${APICAL_TEST_TIMESTAMP}`);
    const exportHeaders = getFetchHeaders(fetchMock, 0);
    expect(exportHeaders.get('Authorization')).toBe('Bearer test-token');
    expect(exportHeaders.get('X-Requested-With')).toBe('XMLHttpRequest');
    expect(result).toBe(converted);
  });

  it('downloads selected Apical event Excel data with the authenticated session cookie', async () => {
    convertDataToRaceState.mockReturnValue({});

    const fetchMock = mockExcelFetch('session=xyz');
    const requestHost = 'apical.example.com';

    await pullApicalRaceState(createApicalSource(requestHost), createEventId());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getFetchUrl(fetchMock, 1)).toContain('https://' + requestHost + '/Download/DownloadExcel?fileGuid=11111111-1111-4111-8111-111111111111&filename=Round%203.xlsx');
    expectRequiredDownloadHeaders(getFetchHeaders(fetchMock, 1), 'https://' + requestHost, 301, 'session=xyz');
  });

  it('converts selected Apical event Excel rows into race state', async () => {
    const converted = {
      categories: [{ id: uuidv5('cat-1', randomUUID()), name: 'Category 1' }],
      participants: [{ entrantId: uuidv5('ent-1', randomUUID()), id: uuidv5('p-1', randomUUID()) }],
      records: [{ crossingId: uuidv5('x-1', randomUUID()) }],
    };
    convertDataToRaceState.mockReturnValue(converted);
    mockExcelFetch();

    const round1EventId: EventId = createEventId();
    const requestHost = 'apical.example.com';
    const result = await pullApicalRaceState(createApicalSource(requestHost), round1EventId);

    expectConvertedLapsPayload(round1EventId);
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

    const requestHost = 'apical.example.com';
    const source = createApicalSource(requestHost);
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
