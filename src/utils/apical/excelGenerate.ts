import { ApicalDataException } from '../../errors/apicalDataException.js';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fetchExternalHttp } from '../externalHttp.js';
import { ApicalSpreadsheetLapsRow, retrieveExcelData } from './apicalEventSpreadsheet.js';

const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ApicalExportToExcelResponse {
  Cookie: string;
  FileGuid: string;
  FileName: string;
}

export const generateExcelData = async (eventId: number, timestamp: number = Date.now()): Promise<ApicalExportToExcelResponse> => {
  const url = `https://apicalracetiming.com.au/RaceResult/Event/ExportToExcel?eventId=${eventId}&_=${timestamp}`;

  const response = await fetchExternalHttp(url, {
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
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

  return {
    Cookie: response.headers.get('set-cookie') || '',
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
    // console.log(`No data file exists for eventId ${eventId}. Generating new Excel data...`);
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
