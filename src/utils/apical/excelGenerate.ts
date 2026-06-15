import { ApicalSpreadsheetLapsRow, retrieveExcelData } from './apicalEventSpreadsheet.js';

import { ApicalDataException } from '../../errors/apicalDataException.js';
import { fetchExternalHttp } from '../externalHttp.js';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ApicalExportToExcelResponse {
  Cookie: string;
  FileGuid: string;
  FileName: string;
}

export const generateExcelData = async (eventId: number, timestamp: number = Date.now()): Promise<ApicalExportToExcelResponse> => {
  const url = `https://apicalracetiming.com.au/RaceResult/Event/ExportToExcel?eventId=${eventId}&_=${timestamp}`;

  const response = await fetchExternalHttp(url, {
    credentials: 'include',
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      'Access-Control-Allow-Credentials': 'true',
    },
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`Failed to generate Excel data: ${response.statusText}`);
  }

  const jsonData = await response.json() as Partial<ApicalExportToExcelResponse>;
  if (!jsonData.FileGuid || !GUID_REGEX.test(String(jsonData.FileGuid)) || !jsonData.FileName) {
    throw new ApicalDataException(`Invalid Excel export response format from url ${url}`);
  }

  let cookieHeader = response.headers.get('Set-Cookie');
  if (!cookieHeader) {
    const cookies = Object.fromEntries(document.cookie.split('; ').map(cookieStr => cookieStr.split('=')));
    if (cookies) {
      console.debug('Got a cookie from document.cookie:', JSON.stringify(cookies), document.cookie);
      cookieHeader = cookies['.AspNetCore.Antiforgery'] || cookies['.AspNetCore.Cookies'];
    } else {
      console.warn('No cookies found in document.cookie');
    }
  }

  if (!cookieHeader) {
    const headerKeys = response.headers.keys().map((key: string) => key.toLowerCase()).toArray().join(', ');
    const hasConvertedSetCookie = response.headers.keys().map((key: string) => key.toLowerCase()).toArray().includes('set-cookie');

    throw new ApicalDataException(`Missing set-cookie header in Excel export response from url ${url} (hasConvertedSetCookie=${hasConvertedSetCookie}, headers=${headerKeys})`);
  }

  // const setCookieHeaders = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.();
  // let setCookieHeader = Array.isArray(setCookieHeaders) ? setCookieHeaders.join('; ') : setCookieHeaders;
  
  // console.log(`Cookie: ${response.headers.get('cookie')}.  SetCookie: ${response.headers.get('set-cookie')}.`);
  // if (!setCookieHeader) {
  //   setCookieHeader =  response.headers.get('Set-Cookie') || (response.headers as any).get('cookie');
  // }


  return {
    Cookie: cookieHeader,
    FileGuid: jsonData.FileGuid,
    FileName: jsonData.FileName,
  };
};

export const getApicalEventExcelFilePath = (eventId: number): string => {
  const temp = tmpdir();
  return path.join(temp, `apical_event_${eventId}.xlsx`);
};

export const apicalDataFileExists = async (evenId: number): Promise<boolean> => {
  const filePath = getApicalEventExcelFilePath(evenId);
  return fs.access(filePath, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false);
};

export const generateOrGetCachedEventPath = async (eventId: number, forceRefreshExcel: boolean = false): Promise<string> => {
  let dataPath: string;

  if (forceRefreshExcel || !await apicalDataFileExists(eventId)) {
    console.log(`No data file exists for eventId ${eventId}. Generating new Excel data...`);
    dataPath = await generateExcelData(eventId).then((response: ApicalExportToExcelResponse) => {
      const { FileGuid, FileName, Cookie } = response;
      // console.log(`Generated Excel data for event ID ${eventId}: FileGuid=${FileGuid}, FileName=${FileName}`);
      return retrieveExcelData(FileGuid, FileName, eventId, Cookie);
    });
  } else {
    // console.log(`Data file already exists for eventId ${eventId}. Using cached data...`);
    dataPath = getApicalEventExcelFilePath(eventId);
  }
  return dataPath;
};

export const createLapsListForParticipants = (lapsData: ApicalSpreadsheetLapsRow[]): Record<string, ApicalSpreadsheetLapsRow[]> => {
  return lapsData.reduce((acc, lap) => {
    const participantKey = `${lap.TeamNameDisplay}-${lap.FullName}`;
    if (!acc[participantKey]) {
      acc[participantKey] = [];
    }
    acc[participantKey].push(lap);
    return acc;
  }, {} as Record<string, ApicalSpreadsheetLapsRow[]>);
};
