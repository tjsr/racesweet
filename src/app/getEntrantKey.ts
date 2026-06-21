import { ApicalSpreadsheetLapsRow } from './apicalDataSource.ts';

export const getEntrantKey = (row: ApicalSpreadsheetLapsRow): string => [
  row.CategoryName,
  row.TeamNameDisplay,
  row.FullName,
  row.RaceNumber,
].join('|');
