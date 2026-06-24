import { ApicalSpreadsheetLapsRow, apicalSafeNumber, loadXlsx } from "../../app/apicalDataSource.ts";
import { getEntrantKey } from "../../app/getEntrantKey.ts";
import { ApicalDataException } from "../../errors/apicalDataException.ts";
import type { ApicalLapByCategory } from "../../model/apical.ts";


export const convertApicalSpreadsheetRowsToApicalData = (rows: ApicalSpreadsheetLapsRow[]): ApicalLapByCategory => {
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
        LapByCategoryViewModels: sortedRows.map((row) => ({
          CumulativeLapTimeSpan: row.CumulativeLapTimeSpan,
          CumulativeSeconds: row.CumulativeSeconds,
          FullName: row.FullName,
          Id: Number(`${apicalSafeNumber(row.RaceNumber)}${String(row.LapNumber).padStart(3, '0')}`),
          LapNumber: Number(row.LapNumber),
          LapTimeSpan: row.LapTimeSpan,
          RaceNumber: row.RaceNumber.toString(),
          TimeOfDay: row.TimeOfDay,
        })),
        NumberOfLaps: sortedRows.length,
        Position: Number(firstRow.Position) || 0,
        RaceNumbers: firstRow.RaceNumber.toString(),
        TeamNameDisplay: firstRow.TeamNameDisplay || firstRow.FullName,
        TotalTimeSpan: lastRow.CumulativeLapTimeSpan || firstRow.TotalTimeSpan || null,
      };
    }),
  }));
};export const readApicalExcelBuffer = async (buffer: ArrayBuffer): Promise<ApicalLapByCategory> => {
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

  return convertApicalSpreadsheetRowsToApicalData(rows);
};

