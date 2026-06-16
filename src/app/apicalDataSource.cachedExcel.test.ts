import XLSX from 'xlsx';
import { createApicalCatalogEventId, fetchApicalRaceStateNow, pullApicalRaceState } from './apicalDataSource.js';
import type { DataSourceConfig } from './systemConfig.js';

const convertDataToRaceState = vi.fn();

vi.mock('../parsers/apical.js', () => ({
  convertDataToRaceState: (...args: unknown[]) => convertDataToRaceState(...args),
}));

const createLapsRows = () => [
  {
    CategoryName: 'A',
    CumulativeLapTimeSpan: '00:03:30.5000000',
    FullName: 'Robert WOOD',
    LapNumber: 1,
    LapTimeSpan: '00:03:30.5000000',
    Position: 1,
    RaceNumber: 306,
    TeamNameDisplay: 'Robert WOOD',
  },
];

const createExcelResponse = (): Response => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(createLapsRows()), 'Laps');
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Response(buffer, { status: 200 });
};

const mockExcelFetch = (): ReturnType<typeof vi.spyOn> => vi
  .spyOn(globalThis, 'fetch')
  .mockResolvedValueOnce(new Response(JSON.stringify({
    FileGuid: '11111111-1111-4111-8111-111111111111',
    FileName: 'Round 3.xlsx',
  }), { status: 200 }))
  .mockResolvedValueOnce(createExcelResponse());

const createApicalSource = (): DataSourceConfig => ({
  apiConfig: {
    authHeaderName: '',
    authHeaderValue: '',
    baseUrl: 'https://apical.example.com',
    companyId: 2,
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

describe('apicalDataSource cached Excel flow', () => {
  beforeEach(() => {
    convertDataToRaceState.mockReset();
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches Apical race state now through Excel export and download responses', async () => {
    const convertedRaceState = { categories: [], participants: [], records: [] };
    convertDataToRaceState.mockReturnValue(convertedRaceState);
    const fetchMock = mockExcelFetch();

    const result = await fetchApicalRaceStateNow(createApicalSource());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0] || '')).toContain('/RaceResult/Event/ExportToExcel?eventId=301');
    expect(String(fetchMock.mock.calls[1]?.[0] || '')).toContain('/Download/DownloadExcel?fileGuid=11111111-1111-4111-8111-111111111111&filename=Round%203.xlsx');
    expect(convertDataToRaceState).toHaveBeenCalledWith(
      createApicalCatalogEventId(301),
      new Date('2026-06-07T01:30:00.000Z'),
      [
        expect.objectContaining({
          CategoryName: 'A',
          ParticipantViewModels: [
            expect.objectContaining({
              NumberOfLaps: 1,
              RaceNumbers: '306',
              TeamNameDisplay: 'Robert WOOD',
            }),
          ],
        }),
      ],
      200000
    );
    expect(result.raceState).toBe(convertedRaceState);
  });

  it('pulls live Apical race state through the direct Excel export and download flow', async () => {
    convertDataToRaceState.mockReturnValue({});
    const fetchMock = mockExcelFetch();

    await pullApicalRaceState(createApicalSource(), 'event-1');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0] || '')).toContain('/RaceResult/Event/ExportToExcel?eventId=301');
  });
});
