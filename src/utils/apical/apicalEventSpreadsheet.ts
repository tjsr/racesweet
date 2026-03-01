import XLSX from 'xlsx';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

const tempDir = tmpdir();

export interface ApicalSpreadsheetLapsRow {
  EventName: string;
  EventDate: string;
  CategoryName: string;
  Position: number;
  TeamNameDisplay: string;
  FullName: string;
  LapNumber: number;
  TimeOfDay: string;
  LapTimeSpan: string;
  CumulativeLapTimeSpan: string;
  LapSeconds: number;
  CumulativeSeconds: number;
  RaceNumber: number;
}


export const retrieveExcelData = async (fileGuid: string, fileName: string): Promise<string> => {
  const url = `https://apicalracetiming.com.au/RaceResult/Event/DownloadExcel?fileGuid=${fileGuid}&filename=${encodeURIComponent(fileName)}`;
  
  return fetch(url)
    .then(async (response: Response) => {
      if (!response.ok) {
        throw new Error(`Failed to retrieve Excel data: ${response.statusText}`);
      }
      const blob = await response.blob();
      const buffer = await blob.arrayBuffer();

      const tempFilePath = path.join(tempDir, fileName);
      await fs.writeFile(tempFilePath, Buffer.from(buffer));
      console.log(`Excel data saved to temporary file: ${tempFilePath}`);
      return tempFilePath;
    });
};

export const readTempApicalExcelFile = async (fileName: string): Promise<ApicalSpreadsheetLapsRow[]> => {
  const tempFilePath = path.join(tempDir, fileName);
  try {
    const fileData = await fs.readFile(tempFilePath);
    const workbook = XLSX.read(fileData, { type: 'buffer' });
    const worksheet = workbook.Sheets['Laps'];
    const lapsData = XLSX.utils.sheet_to_json(worksheet) as ApicalSpreadsheetLapsRow[];

    return lapsData;
  } catch (error: unknown) {
    throw new Error(`Failed to read temporary Excel file: ${error instanceof Error ? error.message : String(error)}`);
  }
};

