import { ApicalSpreadsheetLapsRow, retrieveExcelData } from './apicalEventSpreadsheet.js';

import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

export interface ApicalExportToExcelResponse {
  Cookie: string;
  FileGuid: string;
  FileName: string;
}

export const generateExcelData = (eventId: number, timestamp: number = Date.now()): Promise<ApicalExportToExcelResponse> => {
  const url = `https://apicalracetiming.com.au/RaceResult/Event/ExportToExcel?eventId=${eventId}&_=${timestamp}`;

  return fetch(url, {
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
    },
    method: 'GET',
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to generate Excel data: ${response.statusText}`);
      }
      const result = {
        cookie: response.headers.get('set-cookie') || '',
        json: response.json(),
      };
      return result;
    })
    .then((result) => { // }: ApicalExportToExcelResponse) => {
      const { cookie, json } = result;
      return json.then((jsonData) => {
        if (!jsonData || !jsonData.FileGuid || !jsonData.FileName) {
          throw new Error('Invalid Excel export response format');
        }

        if (!json || !jsonData.FileGuid || !jsonData.FileName) {
          throw new Error('Invalid Excel export response format');
        }
        const data: ApicalExportToExcelResponse = {
          Cookie: cookie,
          FileGuid: jsonData.FileGuid,
          FileName: jsonData.FileName,
        };
        return data;
      });
    });
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

export const generateOrGetCachedEventPath = async (eventId: number): Promise<string> => {
  let dataPath: string;

  if (!await apicalDataFileExists(eventId)) {
    console.log(`No data file exists for eventId ${eventId}. Generating new Excel data...`);
    dataPath = await generateExcelData(eventId).then((response: ApicalExportToExcelResponse) => {
      const { FileGuid, FileName, Cookie } = response;
      console.log(`Generated Excel data for event ID ${eventId}: FileGuid=${FileGuid}, FileName=${FileName}`);
      return retrieveExcelData(FileGuid, FileName, eventId, Cookie);
    });
  } else {
    console.log(`Data file already exists for eventId ${eventId}. Using cached data...`);
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
