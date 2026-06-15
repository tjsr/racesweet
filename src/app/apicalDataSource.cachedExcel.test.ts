import type { DataSourceConfig } from './systemConfig.js';
import { createApicalCatalogEventId, fetchApicalRaceStateNow, pullApicalRaceState } from './apicalDataSource.js';

const convertDataToRaceState = vi.fn();
const generateOrGetCachedEventPath = vi.fn();
const readTempApicalExcelFile = vi.fn();

vi.mock('../parsers/apical.js', () => ({
  convertDataToRaceState: (...args: unknown[]) => convertDataToRaceState(...args),
}));

vi.mock('../utils/apical/excelGenerate.js', () => ({
  generateOrGetCachedEventPath: (...args: unknown[]) => generateOrGetCachedEventPath(...args),
}));

vi.mock('../utils/apical/apicalEventSpreadsheet.js', () => ({
  readTempApicalExcelFile: (...args: unknown[]) => readTempApicalExcelFile(...args),
}));

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
    generateOrGetCachedEventPath.mockReset();
    readTempApicalExcelFile.mockReset();
  });

  it('fetches Apical race state now through generateOrGetCachedEventPath with force refresh', async () => {
    const convertedRaceState = { categories: [], participants: [], records: [] };
    const rows = [
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
    generateOrGetCachedEventPath.mockResolvedValue('C:\\temp\\apical_event_301.xlsx');
    readTempApicalExcelFile.mockResolvedValue(rows);
    convertDataToRaceState.mockReturnValue(convertedRaceState);

    const result = await fetchApicalRaceStateNow(createApicalSource());

    expect(generateOrGetCachedEventPath).toHaveBeenCalledWith(301, true);
    expect(readTempApicalExcelFile).toHaveBeenCalledWith('C:\\temp\\apical_event_301.xlsx');
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

  it('pulls live Apical race state through the same cached Excel helper', async () => {
    generateOrGetCachedEventPath.mockResolvedValue('C:\\temp\\apical_event_301.xlsx');
    readTempApicalExcelFile.mockResolvedValue([
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
    ]);
    convertDataToRaceState.mockReturnValue({});

    await pullApicalRaceState(createApicalSource(), 'event-1');

    expect(generateOrGetCachedEventPath).toHaveBeenCalledWith(301, true);
  });
});
