import { ApicalDataException } from '../../errors/apicalDataException.js';
import XLSX from 'xlsx';
import { fetchExternalHttp } from '../externalHttp.js';
import { promises as fs } from 'fs';
import { createApicalExcelDownloadHeaders, getApicalExcelDownloadUrl } from './excelDownload.js';
import { getApicalEventExcelFilePath } from './excelGenerate.js';

const COOKIE_PAIR_REGEX = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+=[^\s;,]+/;
const URL_ENCODED_OCTET_REGEX = /%[0-9a-f]{2}/i;
import { formatResponseHeaders } from '../../app/apicalDataSource.js';

export interface ApicalSpreadsheetLapsRow {
  EventName: string;
  EventDate: string;
  CategoryName: string;
  Position: number;
  TeamNameDisplay: string;
  FullName: string;
  LapNumber: number;
  TimeOfDay: string | number;
  LapTimeSpan: string | number;
  CumulativeLapTimeSpan: string | number;
  LapSeconds: number;
  CumulativeSeconds: number;
  RaceNumber: number;
}

const formatHeaders = (headers: HeadersInit): string => JSON.stringify(Object.fromEntries(new Headers(headers).entries()));

const formatRetrieveExcelContext = (url: string, headers: HeadersInit, response?: Response): string => {
  const responseDetails = response
    ? ` responseStatus=${response.status} responseStatusText=${response.statusText || '(empty)'} responseHeaders=${formatHeaders(response.headers)}`
    : ' responseStatus=(no response)';
  return `url=${url} requestHeaders=${formatHeaders(headers)}${responseDetails}`;
};

const validateCookie = (Cookie: unknown): string => {
  if (typeof Cookie !== 'string' || Cookie.trim().length === 0) {
    throw new ApicalDataException(`Apical Excel download requires a non-empty Cookie header value, got ${Cookie}`);
  }

  if (Cookie !== Cookie.trim() || /[\r\n]/.test(Cookie) || !COOKIE_PAIR_REGEX.test(Cookie)) {
    throw new ApicalDataException('Apical Excel download Cookie header value is not a valid cookie');
  }

  return Cookie;
};

const validateFileName = (fileName: unknown): string => {
  if (typeof fileName !== 'string' || fileName.trim().length === 0) {
    throw new ApicalDataException('Apical Excel download requires a non-empty fileName value');
  }

  if (fileName !== fileName.trim() || URL_ENCODED_OCTET_REGEX.test(fileName) || /[\0\r\n/\\]/.test(fileName)) {
    throw new ApicalDataException('Apical Excel download fileName must be an unencoded local file name');
  }

  return fileName;
};

export const retrieveExcelData = async (fileGuid: string, fileName: string, eventId: number, Cookie: string): Promise<string> => {
  const validatedFileName = validateFileName(fileName);
  const validatedCookie = validateCookie(Cookie);
  const baseUrl = 'https://apicalracetiming.com.au';
  const url = getApicalExcelDownloadUrl(baseUrl, fileGuid, validatedFileName);
  // https://apicalracetiming.com.au/Download/DownloadExcel?fileGuid=c991bb98-6f27-4e68-8552-3a06f6bfa42a&filename=Results%20%20Summer%20NF%20Round%204%202026%202026-2-21.xlsx
  // https://apicalracetiming.com.au/Download/DownloadExcel?fileGuid=5ed20f8c-d871-4659-8d3a-bda0484680e6&filename=Results%20%20Summer%20NF%20Round%204%202026%202026-2-21.xlsx

  const headers = {
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Cache-Control': 'max-age=0',
      'Cookie': validatedCookie,
      'Referrer': `https://apicalracetiming.com.au/raceresult/event/detail?id=${eventId}`,
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    },
    method: 'GET',
  };

  try {
    const response = await fetchExternalHttp(url, headers);
    if (!response.ok) {
      throw new ApicalDataException(`Failed to retrieve Apical Excel data. ${formatRetrieveExcelContext(url, headers.headers, response)}`);
    }

      console.debug(`[${response.status}] Queried URL ${url} with headers ${headers} and received response with headers ${formatResponseHeaders(response, true)}`);
      
    // console.log('Response headers:', response.headers.get('content-type'));
    // console.log('Response status:', response.status);
      
    const blob = await response.blob();
    if (blob.size === 0) {
      throw new ApicalDataException(`Apical Excel download response blob was empty. ${formatRetrieveExcelContext(url, headers.headers, response)}`);
    }
    // console.log('Blob size:', blob.size);
      
    const buffer = await blob.arrayBuffer();
    // console.log('ArrayBuffer size:', buffer.byteLength);
    if (buffer.byteLength === 0) {
      throw new ApicalDataException(`Apical Excel file downloaded from URL ${url} was empty. ${formatRetrieveExcelContext(url, headers.headers, response)}`);
    }
      
    const nodeBuffer = Buffer.from(buffer);
    // console.log('Buffer size:', nodeBuffer.length);

    const eventFileOutputPath = getApicalEventExcelFilePath(eventId);
    await fs.writeFile(eventFileOutputPath, nodeBuffer);
      
    const stats = await fs.stat(eventFileOutputPath);
    console.log(`Excel data saved to temporary file: ${eventFileOutputPath} (${stats.size} bytes)`);
    return eventFileOutputPath;
  } catch (error: unknown) {
    throw error instanceof ApicalDataException
      ? error
      : new Error(`Error retrieving Excel data: ${error instanceof Error ? error.message : String(error)}. ${formatRetrieveExcelContext(url, headers.headers)}`);
  }
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

