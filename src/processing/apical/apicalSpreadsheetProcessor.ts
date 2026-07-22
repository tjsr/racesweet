import { ApicalSpreadsheetLapsRow, ApicalSpreadsheetResultsRow, apicalSafeNumber, loadXlsx } from "../../app/apicalDataSource.ts";
import { getEntrantKey } from "../../app/getEntrantKey.ts";
import { ApicalDataException } from "../../errors/apicalDataException.ts";
import type { ApicalLapByCategory, ApicalLapByCategoryViewModel, ApicalParticipantViewModel } from "../../model/apical.ts";

const APICAL_TEAM_DISPLAY_NAME_COLUMNS = ['TeamDisplayName', 'TeamNameDisplay'] as const;

const toTrimmedString = (value: number | string | null | undefined): string => {
  return value == null ? '' : value.toString().trim();
};

const toNumberOrZero = (value: number | string | null | undefined): number => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const splitRaceNumbers = (raceNumbers: number | string | null | undefined): string[] => {
  return toTrimmedString(raceNumbers)
    .split(/[,;]+/)
    .map((raceNumber) => raceNumber.trim())
    .filter((raceNumber) => raceNumber.length > 0);
};

const getResultRowTeamName = (row: ApicalSpreadsheetResultsRow): string =>
  toTrimmedString(row.TeamDisplayName) || toTrimmedString(row.TeamNameDisplay);

const isTeamResultsRow = (row: ApicalSpreadsheetResultsRow): boolean =>
  getResultRowTeamName(row).length > 0 && splitRaceNumbers(row.RaceNumbers).length > 1;

const getLapSortValue = (row: ApicalSpreadsheetLapsRow): number => {
  if (row.CumulativeSeconds !== undefined && row.CumulativeSeconds !== '') {
    const cumulativeSeconds = Number(row.CumulativeSeconds);
    if (Number.isFinite(cumulativeSeconds)) {
      return cumulativeSeconds;
    }
  }

  return Number(row.LapNumber) || Number.MAX_SAFE_INTEGER;
};

const sortLapRows = (rows: ApicalSpreadsheetLapsRow[]): ApicalSpreadsheetLapsRow[] => {
  return [...rows].sort((left, right) => {
    const leftSort = getLapSortValue(left);
    const rightSort = getLapSortValue(right);
    if (leftSort !== rightSort) {
      return leftSort - rightSort;
    }

    return toTrimmedString(left.RaceNumber).localeCompare(toTrimmedString(right.RaceNumber));
  });
};

const toLapViewModel = (row: ApicalSpreadsheetLapsRow): ApicalLapByCategoryViewModel => ({
  CumulativeLapTimeSpan: row.CumulativeLapTimeSpan,
  CumulativeSeconds: row.CumulativeSeconds,
  FullName: row.FullName,
  Id: Number(`${apicalSafeNumber(row.RaceNumber)}${String(row.LapNumber).padStart(3, '0')}`),
  LapNumber: Number(row.LapNumber),
  LapTimeSpan: row.LapTimeSpan,
  RaceNumber: row.RaceNumber.toString(),
  TimeOfDay: row.TimeOfDay,
});

const groupRowsByRaceNumber = (rows: ApicalSpreadsheetLapsRow[]): Map<string, ApicalSpreadsheetLapsRow[]> => {
  const rowsByRaceNumber = new Map<string, ApicalSpreadsheetLapsRow[]>();
  rows.forEach((row) => {
    const raceNumber = toTrimmedString(row.RaceNumber);
    const currentRows = rowsByRaceNumber.get(raceNumber) || [];
    currentRows.push(row);
    rowsByRaceNumber.set(raceNumber, currentRows);
  });
  return rowsByRaceNumber;
};

const convertTeamResultsRowsToApicalData = (
  rows: ApicalSpreadsheetLapsRow[],
  resultsRows: ApicalSpreadsheetResultsRow[]
): ApicalLapByCategory => {
  const rowsByRaceNumber = groupRowsByRaceNumber(rows);
  const categories = new Map<string, ApicalParticipantViewModel[]>();

  resultsRows.forEach((resultRow) => {
    const categoryName = toTrimmedString(resultRow.CategoryName) || 'Uncategorised';
    const raceNumbers = splitRaceNumbers(resultRow.RaceNumbers);
    const entrantRows = sortLapRows(raceNumbers.flatMap((raceNumber) => rowsByRaceNumber.get(raceNumber) || []));
    const firstRow = entrantRows[0];
    const lastRow = entrantRows[entrantRows.length - 1];
    const teamDisplayName = getResultRowTeamName(resultRow) ||
      toTrimmedString(firstRow?.TeamNameDisplay) ||
      toTrimmedString(firstRow?.FullName) ||
      'Unnamed Team';
    const participants = categories.get(categoryName) || [];

    participants.push({
      CategoryName: categoryName,
      IsTeamEntrant: true,
      LapByCategoryViewModels: entrantRows.map(toLapViewModel),
      NumberOfLaps: toNumberOrZero(resultRow.NumberOfLaps) || entrantRows.length,
      Position: toNumberOrZero(resultRow.Position) || toNumberOrZero(firstRow?.Position),
      RaceNumbers: raceNumbers.join(', '),
      TeamDisplayName: teamDisplayName,
      TeamNameDisplay: teamDisplayName,
      TotalTimeSpan: resultRow.TotalTimeSpan || lastRow?.CumulativeLapTimeSpan || firstRow?.TotalTimeSpan || null,
    });
    categories.set(categoryName, participants);
  });

  return Array.from(categories.entries()).map(([CategoryName, ParticipantViewModels]) => ({
    CategoryName,
    ParticipantViewModels,
  }));
};

export const convertApicalSpreadsheetRowsToApicalData = (
  rows: ApicalSpreadsheetLapsRow[],
  resultsRows?: ApicalSpreadsheetResultsRow[]
): ApicalLapByCategory => {
  if (resultsRows && resultsRows.length > 0) {
    return convertTeamResultsRowsToApicalData(rows, resultsRows);
  }

  const categories = new Map<string, Map<string, ApicalSpreadsheetLapsRow[]>>();

  rows.forEach((row) => {
    const categoryName = row.CategoryName?.toString() || 'Uncategorised';
    const entrantKey = getEntrantKey(row);
    const entrants = categories.get(categoryName) || new Map<string, ApicalSpreadsheetLapsRow[]>();
    const entrantRows = entrants.get(entrantKey) || [];
    entrantRows.push(row);
    entrants.set(entrantKey, entrantRows);
    categories.set(categoryName, entrants);
  });

  return Array.from(categories.entries()).map(([CategoryName, entrants]) => ({
    CategoryName,
    ParticipantViewModels: Array.from(entrants.values()).map((entrantRows) => {
      const sortedRows = [...entrantRows].sort((a, b) => Number(a.LapNumber) - Number(b.LapNumber));
      const firstRow = sortedRows[0]!;
      const lastRow = sortedRows[sortedRows.length - 1]!;

      return {
        CategoryName,
        LapByCategoryViewModels: sortedRows.map(toLapViewModel),
        NumberOfLaps: sortedRows.length,
        Position: Number(firstRow.Position) || 0,
        RaceNumbers: firstRow.RaceNumber.toString(),
        TeamNameDisplay: firstRow.TeamNameDisplay || firstRow.FullName,
        TotalTimeSpan: lastRow.CumulativeLapTimeSpan || firstRow.TotalTimeSpan || null,
      };
    }),
  }));
};

export const readApicalExcelBuffer = async (buffer: ArrayBuffer): Promise<ApicalLapByCategory> => {
  const XLSX = await loadXlsx();
  const workbook = XLSX.read(buffer, { type: 'array' });
  if (!workbook) {
    throw new ApicalDataException('Failed to parse Apical Excel workbook, no data returned');
  }
  if (!workbook.Sheets || Object.keys(workbook.Sheets).length === 0) {
    throw new ApicalDataException('Apical Excel workbook did not contain any sheets');
  }
  const worksheet = workbook.Sheets.Laps || workbook.Sheets.Sheet1;
  if (!worksheet) {
    const sheetList = Object.keys(workbook.Sheets).join(', ');
    throw new ApicalDataException(`Apical Excel workbook did not contain a Laps or Sheet1 worksheet, but contained sheets ${sheetList}`);
  }
  const sheetList = Object.keys(workbook.Sheets).join(', ');
  console.debug(`Apical Excel workbook contains sheets: ${sheetList}, using ${worksheet === workbook.Sheets.Laps ? 'Laps' : 'Sheet1'}`);

  const rows = XLSX.utils.sheet_to_json<ApicalSpreadsheetLapsRow>(worksheet);
  if (rows.length === 0) {
    throw new ApicalDataException(`Apical Excel workbook did not contain lap rows, but contained sheets ${sheetList}`);
  }

  const resultsWorksheet = workbook.Sheets.Results;
  const resultsRows = resultsWorksheet
    ? XLSX.utils.sheet_to_json<ApicalSpreadsheetResultsRow>(resultsWorksheet, { defval: '' })
    : [];
  const hasTeamDisplayNameColumn = resultsRows.some((row) => {
    return APICAL_TEAM_DISPLAY_NAME_COLUMNS.some((column) => Object.prototype.hasOwnProperty.call(row, column));
  });
  const teamResultsRows = hasTeamDisplayNameColumn ? resultsRows.filter((row) => isTeamResultsRow(row)) : [];

  return convertApicalSpreadsheetRowsToApicalData(rows, teamResultsRows.length > 0 ? teamResultsRows : undefined);
};
