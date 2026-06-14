import { ApicalDataException } from '../../errors/apicalDataException.js';
import { promises as fs } from 'fs';
import { fetchExternalHttp } from '../externalHttp.js';
import { createApicalExcelDownloadHeaders, getApicalExcelDownloadUrl } from './excelDownload.js';
import { getApicalEventExcelFilePath } from './excelGenerate.js';
import XLSX from 'xlsx';
import { formatResponseHeaders } from '../../app/apicalDataSource.js';

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
  const baseUrl = 'https://apicalracetiming.com.au';
  const url = getApicalExcelDownloadUrl(baseUrl, fileGuid, fileName);
  // https://apicalracetiming.com.au/Download/DownloadExcel?fileGuid=c991bb98-6f27-4e68-8552-3a06f6bfa42a&filename=Results%20%20Summer%20NF%20Round%204%202026%202026-2-21.xlsx
  // https://apicalracetiming.com.au/Download/DownloadExcel?fileGuid=5ed20f8c-d871-4659-8d3a-bda0484680e6&filename=Results%20%20Summer%20NF%20Round%204%202026%202026-2-21.xlsx
  
  const headers = createApicalExcelDownloadHeaders(baseUrl, eventId, Cookie);
  return fetchExternalHttp(url, {
    headers,
    method: 'GET',
  })
    .then(async (response: Response) => {
      if (!response.ok) {
        throw new Error(`Failed to retrieve Excel data: ${response.statusText}`);
      }

      console.debug(`[${response.status}] Queried URL ${url} with headers ${headers} and received response with headers ${formatResponseHeaders(response, true)}`);
      
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

