import { ApicalDataException } from '../../errors/apicalDataException.js';
import { promises as fs } from 'fs';
import { fetchExternalHttp } from '../externalHttp.js';
import { getApicalEventExcelFilePath } from './excelGenerate.js';
import XLSX from 'xlsx';

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


export const retrieveExcelData = async (fileGuid: string, fileName: string, eventId: number, Cookie: string): Promise<string> => {
  const url = `https://apicalracetiming.com.au/Download/DownloadExcel?fileGuid=${fileGuid}&filename=${encodeURIComponent(fileName)}`;
  // https://apicalracetiming.com.au/Download/DownloadExcel?fileGuid=c991bb98-6f27-4e68-8552-3a06f6bfa42a&filename=Results%20%20Summer%20NF%20Round%204%202026%202026-2-21.xlsx
  // https://apicalracetiming.com.au/Download/DownloadExcel?fileGuid=5ed20f8c-d871-4659-8d3a-bda0484680e6&filename=Results%20%20Summer%20NF%20Round%204%202026%202026-2-21.xlsx
  
  return fetchExternalHttp(url, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Cache-Control': 'max-age=0',
      'Cookie': Cookie,
      'Referrer': `https://apicalracetiming.com.au/raceresult/event/detail?id=${eventId}`,
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    },
    method: 'GET',
  })
    .then(async (response: Response) => {
      if (!response.ok) {
        throw new Error(`Failed to retrieve Excel data: ${response.statusText}`);
      }

      console.debug(`[${response.status}] Queried URL ${url}`);
      
      // console.log('Response headers:', response.headers.get('content-type'));
      // console.log('Response status:', response.status);
      
      const blob = await response.blob();
      // console.log('Blob size:', blob.size);
      
      const buffer = await blob.arrayBuffer();
      // console.log('ArrayBuffer size:', buffer.byteLength);
      if (buffer.byteLength === 0) {
        throw new ApicalDataException(`Apical Excel file downloaded from URL ${url} was empty`);
      }
      
      const nodeBuffer = Buffer.from(buffer);
      // console.log('Buffer size:', nodeBuffer.length);

      const eventFileOutputPath = getApicalEventExcelFilePath(eventId);
      await fs.writeFile(eventFileOutputPath, nodeBuffer);
      
      const stats = await fs.stat(eventFileOutputPath);
      console.log(`Excel data saved to temporary file: ${eventFileOutputPath} (${stats.size} bytes)`);
      return eventFileOutputPath;
    }).catch((error: unknown) => {
      throw error instanceof ApicalDataException
        ? error
        : new Error(`Error retrieving Excel data: ${error instanceof Error ? error.message : String(error)}`);
    });
};

export const readTempApicalExcelFile = async (dataPath: string): Promise<ApicalSpreadsheetLapsRow[]> => {
  // const tempFilePath = path.join(tempDir, fileName);
  try {
    const fileData = await fs.readFile(dataPath);
    const workbook = XLSX.read(fileData, { type: 'buffer' });
    if (!workbook.Sheets || Object.keys(workbook.Sheets).length === 0) {
      throw new ApicalDataException(`Apical Excel workbook ${dataPath} did not contain any sheets`);
    }
    const worksheet = workbook.Sheets['Laps'] || workbook.Sheets['Sheet1'];
    if (!worksheet) {
      throw new ApicalDataException(`Apical Excel workbook ${dataPath} did not contain a Laps or Sheet1 worksheet`);
    }
    const lapsData = XLSX.utils.sheet_to_json(worksheet) as ApicalSpreadsheetLapsRow[];
    if (lapsData.length === 0) {
      throw new ApicalDataException(`Apical Excel workbook ${dataPath} did not contain lap rows`);
    }

    return lapsData;
  } catch (error: unknown) {
    throw error instanceof ApicalDataException
      ? error
      : new Error(`Failed to read temporary Excel file: ${error instanceof Error ? error.message : String(error)}`);
  }
};

