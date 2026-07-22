// @vitest-environment jsdom

import { ApicalDataException } from '../../errors/apicalDataException.ts';
import { APICAL_EXCEL_DOWNLOAD_ACCEPT_HEADER } from './excelDownload.ts';
import { generateOrGetCachedEventPath, getApicalEventExcelFilePath } from './excelGenerate.ts';
import { promises as fs } from 'fs';
import { readTempApicalExcelFile, retrieveExcelData } from './apicalEventSpreadsheet.ts';
import XLSX from 'xlsx';
import { generateExcelData } from '../../processing/apical/generateExcel.ts';

const APICAL_EVENT_ID = 69;
const APICAL_FILE_GUID = '1cf63381-1269-4257-b892-ef8b33424103';
const APICAL_FILE_NAME = 'Results  GMBC Autumn No Frills Round 4 2026-6-12.xlsx';
const APICAL_TIMESTAMP = 1781309520833;

const expectRequiredDownloadHeaders = (headers: Headers, cookie: string): void => {
  expect(headers.get('Accept')).toBe(APICAL_EXCEL_DOWNLOAD_ACCEPT_HEADER);
  expect(headers.get('Accept-Encoding')).toBe('gzip, deflate, br, zstd');
  expect(headers.get('Cache-Control')).toBe('max-age=0');
  expect(headers.get('Cookie')).toBe(cookie);
  expect(headers.get('Referrer')).toBe('https://apicalracetiming.com.au/raceresult/event/detail?id=69');
  expect(headers.get('Sec-Fetch-Dest')).toBe('document');
  expect(headers.get('Sec-Fetch-Mode')).toBe('navigate');
  expect(headers.get('Sec-Fetch-Site')).toBe('none');
  expect(headers.get('Sec-Fetch-User')).toBe('?1');
  expect(headers.get('Upgrade-Insecure-Requests')).toBe('1');
};

const createRows = () => [
  {
    CategoryName: 'A',
    CumulativeLapTimeSpan: '00:03:30.5000000',
    CumulativeSeconds: 210.5,
    EventDate: '2026-06-12',
    EventName: 'GMBC Autumn No Frills Round 4',
    FullName: 'Robert WOOD',
    LapNumber: 1,
    LapSeconds: 210.5,
    LapTimeSpan: '00:03:30.5000000',
    Position: 1,
    RaceNumber: 306,
    TeamNameDisplay: 'Robert WOOD',
    TimeOfDay: '10:00:00',
  },
];

const createExcelBuffer = (): ArrayBuffer => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(createRows()), 'Laps');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(createRows()), 'Sheet1');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
};

const clearDocumentCookies = (): void => {
  document.cookie.split(';').forEach((cookie) => {
    const cookieName = cookie.split('=')[0]?.trim();
    if (cookieName) {
      document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  });
};

describe('apical Excel generation utilities', () => {
  afterEach(async () => {
    clearDocumentCookies();
    vi.restoreAllMocks();
    await fs.unlink(getApicalEventExcelFilePath(APICAL_EVENT_ID)).catch(() => undefined);
  });

  it('requests an Apical Excel export for event 69 and validates the returned GUID and filename', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        FileGuid: APICAL_FILE_GUID,
        FileName: APICAL_FILE_NAME,
      }), {
        headers: {
          'set-cookie': 'session=abc123',
        },
        status: 200,
      }));

    const result = await generateExcelData(APICAL_EVENT_ID, APICAL_TIMESTAMP);

    const callOptions = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(callOptions.headers);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0] || '')).toBe('https://apicalracetiming.com.au/RaceResult/Event/ExportToExcel?eventId=69&_=' + APICAL_TIMESTAMP);
    expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest');
    expect(result.FileGuid).toBe(APICAL_FILE_GUID);
    expect(result.FileGuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(result.FileName).toBe(APICAL_FILE_NAME);
    expect(result.Cookie).toBe('session=abc123');
  });

  it('uses document cookies when the Excel export response does not expose Set-Cookie', async () => {
    document.cookie = 'ASP.NET_SessionId=document-session';
    document.cookie = 'ApicalAuth=document-auth';
    vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        FileGuid: APICAL_FILE_GUID,
        FileName: APICAL_FILE_NAME,
      }), { status: 200 }));

    const result = await generateExcelData(APICAL_EVENT_ID, APICAL_TIMESTAMP);

    expect(result.FileGuid).toBe(APICAL_FILE_GUID);
    expect(result.FileName).toBe(APICAL_FILE_NAME);
    expect(result.Cookie).toContain('ASP.NET_SessionId=document-session');
    expect(result.Cookie).toContain('ApicalAuth=document-auth');
  });

  it('uses a cookie header synthesized by the Electron external HTTP proxy', async () => {
    vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        FileGuid: APICAL_FILE_GUID,
        FileName: APICAL_FILE_NAME,
      }), {
        headers: {
          cookie: 'ASP.NET_SessionId=electron-session',
        },
        status: 200,
      }));

    const result = await generateExcelData(APICAL_EVENT_ID, APICAL_TIMESTAMP);

    expect(result.Cookie).toBe('ASP.NET_SessionId=electron-session');
  });

  it('logs a warning and continues when the Excel export response has no readable cookie data', async () => {
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        FileGuid: APICAL_FILE_GUID,
        FileName: APICAL_FILE_NAME,
      }), { status: 200 }));

    const result = await generateExcelData(APICAL_EVENT_ID, APICAL_TIMESTAMP);

    expect(result).toEqual({
      FileGuid: APICAL_FILE_GUID,
      FileName: APICAL_FILE_NAME,
    });
    expect(warnMock).toHaveBeenCalledWith(expect.stringContaining('did not include readable cookie data'));
  });

  it('rejects export responses that do not include a GUID file id', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        FileGuid: 'not-a-guid',
        FileName: APICAL_FILE_NAME,
      }), { status: 200 }));

    await expect(generateExcelData(APICAL_EVENT_ID, APICAL_TIMESTAMP))
      .rejects.toThrow(ApicalDataException);
  });

  it('includes a reproducible curl command when the Excel export request fails', async () => {
    document.cookie = 'ASP.NET_SessionId=document-session';
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('network blocked'));

    await expect(generateExcelData(APICAL_EVENT_ID, {
      headers: {
        Authorization: 'Bearer abc123',
        'X-Apical-Company': 'GMBC',
      },
      timestamp: APICAL_TIMESTAMP,
    })).rejects.toThrow(new RegExp([
      'Failed to generate Apical Excel export data\\.',
      'Cause: network blocked',
      'Replicate request with: curl --include --location --request GET',
      "--header 'access-control-allow-credentials: true'",
      "--header 'authorization: Bearer abc123'",
      "--header 'cookie: ASP\\.NET_SessionId=document-session'",
      "--header 'x-apical-company: GMBC'",
      "--header 'x-requested-with: XMLHttpRequest'",
      `'https://apicalracetiming\\.com\\.au/RaceResult/Event/ExportToExcel\\?eventId=69&_=1781309520833'`,
    ].join('.*'), 's'));
  });

  it('includes a reproducible curl command when the Excel export response is invalid', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        FileGuid: 'not-a-guid',
        FileName: APICAL_FILE_NAME,
      }), { status: 200 }));

    await expect(generateExcelData(APICAL_EVENT_ID, APICAL_TIMESTAMP))
      .rejects.toThrow(/Replicate request with: curl --include --location --request GET.*RaceResult\/Event\/ExportToExcel/s);
  });

  it('downloads the returned Apical Excel file and verifies sheets and data rows', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(createExcelBuffer(), { status: 200 }));

    const filePath = await retrieveExcelData(APICAL_FILE_GUID, APICAL_FILE_NAME, APICAL_EVENT_ID, 'session=abc123');
    const fileData = await fs.readFile(filePath);
    const workbook = XLSX.read(fileData, { type: 'buffer' });
    const lapsRows = XLSX.utils.sheet_to_json(workbook.Sheets.Laps!);
    const sheet1Rows = XLSX.utils.sheet_to_json(workbook.Sheets.Sheet1!);
    const parsedRows = await readTempApicalExcelFile(filePath);

    const callOptions = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(callOptions.headers);
    expect(String(fetchMock.mock.calls[0]?.[0] || '')).toBe('https://apicalracetiming.com.au/Download/DownloadExcel?fileGuid=' + APICAL_FILE_GUID + '&filename=' + encodeURIComponent(APICAL_FILE_NAME));
    expectRequiredDownloadHeaders(headers, 'session=abc123');
    expect(Object.keys(workbook.Sheets).sort()).toEqual(['Laps', 'Sheet1']);
    expect(lapsRows).toHaveLength(1);
    expect(sheet1Rows).toHaveLength(1);
    expect(parsedRows).toEqual([
      expect.objectContaining({
        CategoryName: 'A',
        FullName: 'Robert WOOD',
        LapNumber: 1,
        RaceNumber: 306,
      }),
    ]);
  });

  it('throws an Apical data exception when the downloaded Excel response is empty', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(new ArrayBuffer(0), { status: 200 }));

    await expect(retrieveExcelData(APICAL_FILE_GUID, APICAL_FILE_NAME, APICAL_EVENT_ID, 'session=abc123'))
      .rejects.toThrow(ApicalDataException);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['whitespace', '   '],
    ['line-break', 'session=abc123\r\nx=1'],
    ['missing value separator', 'session'],
  ])('rejects a %s cookie before requesting the Apical Excel file', async (_label, cookie) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(retrieveExcelData(APICAL_FILE_GUID, APICAL_FILE_NAME, APICAL_EVENT_ID, cookie as string))
      .rejects.toThrow(ApicalDataException);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['whitespace', '   '],
    ['url encoded', 'Results%20GMBC.xlsx'],
    ['path separator', 'Results/GMBC.xlsx'],
    ['line-break', 'Results\r\nGMBC.xlsx'],
  ])('rejects a %s file name before requesting the Apical Excel file', async (_label, fileName) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(retrieveExcelData(APICAL_FILE_GUID, fileName as string, APICAL_EVENT_ID, 'session=abc123'))
      .rejects.toThrow(ApicalDataException);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('includes request and response details when the Apical Excel download fails', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('Forbidden', {
        headers: {
          'content-type': 'text/plain',
        },
        status: 403,
        statusText: 'Forbidden',
      }));

    await expect(retrieveExcelData(APICAL_FILE_GUID, APICAL_FILE_NAME, APICAL_EVENT_ID, 'session=abc123'))
      .rejects.toThrow(new RegExp(`url=https://apicalracetiming\\.com\\.au/Download/DownloadExcel\\?fileGuid=${APICAL_FILE_GUID}&filename=${encodeURIComponent(APICAL_FILE_NAME)}.*"cookie":"session=abc123".*responseStatus=403.*"content-type":"text/plain"`, 's'));
  });

  it('includes request and response details when the Apical Excel download returns an empty blob', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(new ArrayBuffer(0), {
        headers: {
          'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        status: 200,
      }));

    await expect(retrieveExcelData(APICAL_FILE_GUID, APICAL_FILE_NAME, APICAL_EVENT_ID, 'session=abc123'))
      .rejects.toThrow(new RegExp(`response blob was empty.*"cookie":"session=abc123".*responseStatus=200`, 's'));
  });

  it('refreshes uncached Apical event Excel data through export and download touch-points', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        FileGuid: APICAL_FILE_GUID,
        FileName: APICAL_FILE_NAME,
      }), {
        headers: {
          'set-cookie': 'session=abc123',
        },
        status: 200,
      }))
      .mockResolvedValueOnce(new Response(createExcelBuffer(), { status: 200 }));

    const filePath = await generateOrGetCachedEventPath(APICAL_EVENT_ID, true);

    expect(filePath).toBe(getApicalEventExcelFilePath(APICAL_EVENT_ID));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0] || '')).toContain('/RaceResult/Event/ExportToExcel?eventId=69');
    expect(String(fetchMock.mock.calls[1]?.[0] || '')).toBe('https://apicalracetiming.com.au/Download/DownloadExcel?fileGuid=' + APICAL_FILE_GUID + '&filename=' + encodeURIComponent(APICAL_FILE_NAME));
    const stats = await fs.stat(filePath);
    expect(stats.size).toBeGreaterThan(0);
  });
});
