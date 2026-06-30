import * as XLSX from 'xlsx';

import { readApicalExcelBuffer } from './apicalSpreadsheetProcessor.js';

import type { ApicalSpreadsheetLapsRow, ApicalSpreadsheetResultsRow } from '../../app/apicalDataSource.js';
import { createApicalTeamNameDisplayWorkbookBuffer } from '../../testing/apicalTeamWorkbook.js';

const createTeamLapsRows = (): ApicalSpreadsheetLapsRow[] => [
  {
    CategoryName: 'Teams A',
    CumulativeLapTimeSpan: '00:06:00.0000000',
    CumulativeSeconds: 360,
    FullName: 'Alice RIDER',
    LapNumber: 1,
    LapTimeSpan: '00:06:00.0000000',
    Position: 1,
    RaceNumber: 101,
    TeamNameDisplay: 'Fast Friends',
    TimeOfDay: '10:06:00.0000000',
  },
  {
    CategoryName: 'Teams A',
    CumulativeLapTimeSpan: '00:12:00.0000000',
    CumulativeSeconds: 720,
    FullName: 'Bob RIDER',
    LapNumber: 1,
    LapTimeSpan: '00:06:00.0000000',
    Position: 1,
    RaceNumber: 102,
    TeamNameDisplay: 'Fast Friends',
    TimeOfDay: '10:12:00.0000000',
  },
  {
    CategoryName: 'Teams A',
    CumulativeLapTimeSpan: '00:18:00.0000000',
    CumulativeSeconds: 1080,
    FullName: 'Alice RIDER',
    LapNumber: 2,
    LapTimeSpan: '00:06:00.0000000',
    Position: 1,
    RaceNumber: 101,
    TeamNameDisplay: 'Fast Friends',
    TimeOfDay: '10:18:00.0000000',
  },
];

const createTeamResultsRows = (): ApicalSpreadsheetResultsRow[] => [
  {
    CategoryName: 'Teams A',
    NumberOfLaps: 3,
    Position: 1,
    RaceNumbers: '101, 102',
    TeamDisplayName: 'Fast Friends',
    TotalTimeSpan: '00:18:00.0000000',
  },
];

const createWorkbookBuffer = (resultsRows: ApicalSpreadsheetResultsRow[]): ArrayBuffer => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(createTeamLapsRows()), 'Laps');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(resultsRows), 'Results');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
};

describe('apical spreadsheet processor', () => {
  it('uses Results TeamDisplayName rows to create team entrants with all listed race numbers', async () => {
    const data = await readApicalExcelBuffer(createWorkbookBuffer(createTeamResultsRows()));

    expect(data).toEqual([
      {
        CategoryName: 'Teams A',
        ParticipantViewModels: [
          expect.objectContaining({
            CategoryName: 'Teams A',
            IsTeamEntrant: true,
            NumberOfLaps: 3,
            RaceNumbers: '101, 102',
            TeamDisplayName: 'Fast Friends',
            TeamNameDisplay: 'Fast Friends',
          }),
        ],
      },
    ]);
    expect(data[0]!.ParticipantViewModels[0]!.LapByCategoryViewModels.map((lap) => lap.RaceNumber)).toEqual([
      '101',
      '102',
      '101',
    ]);
  });

  it('uses real Results TeamNameDisplay rows to create team entrants with listed race numbers', async () => {
    const data = await readApicalExcelBuffer(createApicalTeamNameDisplayWorkbookBuffer());
    const eBikeTeamCategory = data.find((category) => category.CategoryName === 'EBIKE_TEAM');
    const evereadys = eBikeTeamCategory?.ParticipantViewModels.find((entrant) => entrant.TeamNameDisplay === 'The Evereadys');

    expect(evereadys).toEqual(expect.objectContaining({
      IsTeamEntrant: true,
      NumberOfLaps: 14,
      RaceNumbers: '67, 62, 989',
      TeamDisplayName: 'The Evereadys',
      TeamNameDisplay: 'The Evereadys',
    }));
    expect(evereadys?.LapByCategoryViewModels.map((lap) => lap.RaceNumber)).toEqual(expect.arrayContaining(['67', '62', '989']));
  });
});
