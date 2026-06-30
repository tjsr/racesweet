import * as XLSX from 'xlsx';

import type { ApicalSpreadsheetLapsRow, ApicalSpreadsheetResultsRow } from '../app/apicalDataSource.js';

const createEvereadysLapRows = (): ApicalSpreadsheetLapsRow[] => {
  const raceNumbers = ['67', '62', '989'];
  return Array.from({ length: 14 }, (_, index) => {
    const raceNumber = raceNumbers[index % raceNumbers.length]!;
    const lapNumber = Math.floor(index / raceNumbers.length) + 1;
    const cumulativeSeconds = (index + 1) * 360;
    const hours = Math.floor(cumulativeSeconds / 3600);
    const minutes = Math.floor((cumulativeSeconds % 3600) / 60);
    const seconds = cumulativeSeconds % 60;
    const timeSpan = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.0000000`;

    return {
      CategoryName: 'EBIKE_TEAM',
      CumulativeLapTimeSpan: timeSpan,
      CumulativeSeconds: cumulativeSeconds.toString(),
      FullName: `Rider ${raceNumber}`,
      LapNumber: lapNumber,
      LapTimeSpan: '00:06:00.0000000',
      Position: 1,
      RaceNumber: raceNumber,
      TeamNameDisplay: 'The Evereadys',
      TimeOfDay: `10:${((index + 1) * 6).toString().padStart(2, '0')}:00.0000000`,
    };
  });
};

const createEvereadysResultsRows = (): ApicalSpreadsheetResultsRow[] => [
  {
    CategoryName: 'EBIKE_TEAM',
    NumberOfLaps: 14,
    Position: 1,
    RaceNumbers: '67, 62, 989',
    TeamNameDisplay: 'The Evereadys',
    TotalTimeSpan: '01:24:00.0000000',
  },
];

export const createApicalTeamNameDisplayWorkbookBuffer = (): ArrayBuffer => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(createEvereadysLapRows()), 'Laps');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(createEvereadysResultsRows()), 'Results');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
};
