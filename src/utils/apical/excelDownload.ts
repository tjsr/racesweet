import { readApicalExcelBuffer } from '../../controllers/apical/apicalSpreadsheetProcessor.js';
import { ApicalDataException } from "../../errors/apicalDataException.js";
import { ExcelDownloadException } from "../../errors/excelDownloadException.js";
import type { ApicalLapByCategory } from "../../model/apical.js";

export const APICAL_EXCEL_DOWNLOAD_ACCEPT_HEADER = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';
export const APICAL_EXCEL_GENERATE_ACCEPT_HEADER = 'application/json, text/javascript, */*; q=0.01';

export const getApicalExcelDownloadUrl = (baseUrl: string, fileGuid: string, fileName: string): string => {
  return `${baseUrl.replace(/\/$/, '')}/Download/DownloadExcel?fileGuid=${fileGuid}&filename=${encodeURIComponent(fileName)}`;
};

export const createApicalExcelDownloadHeaders = (baseUrl: string, eventId: number): Headers => {
    if (!eventId) {
    throw new ExcelDownloadException('eventId is required to get Apical excel file.');
  }
  const headers = new Headers();
  headers.set('Accept', APICAL_EXCEL_DOWNLOAD_ACCEPT_HEADER);
  headers.set('Accept-Encoding', 'gzip, deflate, br, zstd');
  headers.set('Cache-Control', 'max-age=0');
  headers.set('Referrer', `${baseUrl.replace(/\/$/, '')}/raceresult/event/detail?id=${eventId}`);
  headers.set('Sec-Fetch-Dest', 'document');
  headers.set('Sec-Fetch-Mode', 'navigate');
  headers.set('Sec-Fetch-Site', 'none');
  headers.set('Sec-Fetch-User', '?1');
  headers.set('Upgrade-Insecure-Requests', '1');
  return headers;
};
export const readApicalExcelPayload = async (response: Response): Promise<ApicalLapByCategory> => {
  if (!response) {
    throw new ApicalDataException('No response received when trying to read Apical Excel payload.');
  }
  const buffer = await response.arrayBuffer();
  return readApicalExcelPayloadBuffer(buffer);
};

export const readApicalExcelPayloadBuffer = async (buffer: ArrayBuffer): Promise<ApicalLapByCategory> => {
  if (buffer.byteLength === 0) {
    throw new ApicalDataException('Apical Excel file was empty');
  }
  return readApicalExcelBuffer(buffer);
};
