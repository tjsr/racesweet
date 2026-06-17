// @vitest-environment jsdom

import XLSX from 'xlsx';
import { fetchApicalRaceStateNow } from './apicalDataSource.js';
import type { DataSourceConfig } from './systemConfig.js';

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
  listedEvents: [
    {
      eventDate: '2026-06-07T01:30:00.000Z',
      id: 301,
      name: 'Round 3',
    },
  ],
  name: 'Apical Source',
  type: 'api-apical-data-file',
});

const createExcelBuffer = (): ArrayBuffer => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
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
  ]), 'Laps');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
};

describe('apicalDataSource renderer IPC flow', () => {
  beforeEach(() => {
    convertDataToRaceState.mockReset();
    convertDataToRaceState.mockReturnValue({
      categories: [],
      participants: [],
      records: [],
    });
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete (window as unknown as { api?: unknown }).api;
    vi.restoreAllMocks();
  });

  it('fetches Apical event data through the renderer IPC proxy and forwards export cookies to the download request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const requestExternalHttp = vi
      .fn()
      .mockResolvedValueOnce({
        bodyBase64: Buffer.from(JSON.stringify({
          FileGuid: '11111111-1111-4111-8111-111111111111',
          FileName: 'Round 3.xlsx',
        })).toString('base64'),
        headers: { 'set-cookie': 'session=ipc-cookie' },
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://apical.example.com/RaceResult/Event/ExportToExcel?eventId=301',
      })
      .mockResolvedValueOnce({
        bodyBase64: Buffer.from(createExcelBuffer()).toString('base64'),
        headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://apical.example.com/Download/DownloadExcel?fileGuid=11111111-1111-4111-8111-111111111111&filename=Round%203.xlsx',
      });

    (window as unknown as {
      api: {
        requestExternalHttp: (request: unknown) => Promise<unknown>;
      };
    }).api = {
      requestExternalHttp,
    };

    const result = await fetchApicalRaceStateNow(createApicalSource());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(requestExternalHttp).toHaveBeenCalledTimes(2);

    const exportRequest = requestExternalHttp.mock.calls[0]?.[0] as { headers?: Record<string, string>; url: string };
    const downloadRequest = requestExternalHttp.mock.calls[1]?.[0] as { headers?: Record<string, string>; url: string };

    expect(exportRequest.url).toContain('/RaceResult/Event/ExportToExcel?eventId=301');
    expect(exportRequest.headers).toEqual(expect.objectContaining({
      accept: 'application/json',
      authorization: 'Bearer test-token',
      'x-requested-with': 'XMLHttpRequest',
    }));
    expect(downloadRequest.url).toContain('/Download/DownloadExcel?fileGuid=11111111-1111-4111-8111-111111111111&filename=Round%203.xlsx');
    expect(downloadRequest.headers).toEqual(expect.objectContaining({
      cookie: 'session=ipc-cookie',
      referrer: 'https://apical.example.com/raceresult/event/detail?id=301',
    }));
    expect(result.raceState).toEqual({
      categories: [],
      participants: [],
      records: [],
    });
  });
});
