import { ApicalDataException } from '../../errors/apicalDataException.js';
import { APICAL_EXCEL_DOWNLOAD_ACCEPT_HEADER } from './excelDownload.js';
import { generateExcelData, generateOrGetCachedEventPath, getApicalEventExcelFilePath } from './excelGenerate.js';
import { promises as fs } from 'fs';
import { readTempApicalExcelFile, retrieveExcelData } from './apicalEventSpreadsheet.js';
import XLSX from 'xlsx';

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

describe('apical Excel generation utilities', () => {
  afterEach(async () => {
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
    expect(String(fetchMock.mock.calls[0]?.[0] || '')).toBe('https://apicalracetiming.com.au/RaceResult/Event/ExportToExcel?eventId=69&_=1781309520833');
    expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest');
    expect(result.FileGuid).toBe(APICAL_FILE_GUID);
    expect(result.FileGuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(result.FileName).toBe(APICAL_FILE_NAME);
    expect(result.Cookie).toBe('session=abc123');
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
    expect(String(fetchMock.mock.calls[0]?.[0] || '')).toBe('https://apicalracetiming.com.au/Download/DownloadExcel?fileGuid=1cf63381-1269-4257-b892-ef8b33424103&filename=Results%20%20GMBC%20Autumn%20No%20Frills%20Round%204%202026-6-12.xlsx');
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
    expect(String(fetchMock.mock.calls[1]?.[0] || '')).toBe('https://apicalracetiming.com.au/Download/DownloadExcel?fileGuid=1cf63381-1269-4257-b892-ef8b33424103&filename=Results%20%20GMBC%20Autumn%20No%20Frills%20Round%204%202026-6-12.xlsx');
    const stats = await fs.stat(filePath);
    expect(stats.size).toBeGreaterThan(0);
  });
});
