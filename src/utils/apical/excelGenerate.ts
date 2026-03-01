import { ApicalSpreadsheetLapsRow, readTempApicalExcelFile, retrieveExcelData } from './apicalEventSpreadsheet';

import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

export interface ApicalExportToExcelResponse {
  FileGuid: string;
  FileName: string;
}

export const generateExcelData = (eventId: number, timestamp: number = Date.now()): Promise<ApicalExportToExcelResponse> => {
  const url = `https://apicalracetiming.com.au/RaceResult/Event/ExportToExcel?eventId=${eventId}&_=${timestamp}`;

  return fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to generate Excel data: ${response.statusText}`);
      }
      return response.json();
    })
    .then((data: ApicalExportToExcelResponse) => {
      if (!data || !data.FileGuid || !data.FileName) {
        throw new Error('Invalid Excel export response format');
      }
      return data;
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

export const generateOrGetCachedEventData = async (eventId: number): Promise<ApicalSpreadsheetLapsRow[]> => {
  let dataPath: string;

  if (!await apicalDataFileExists(eventId)) {
    console.log(`No data file exists for eventId ${eventId}. Generating new Excel data...`);
    dataPath = await generateExcelData(eventId).then((response: ApicalExportToExcelResponse) => {
      const { FileGuid, FileName } = response;
      console.log(`Generated Excel data for event ID ${eventId}: FileGuid=${FileGuid}, FileName=${FileName}`);
      return retrieveExcelData(FileGuid, FileName);
    });
  } else {
    dataPath = getApicalEventExcelFilePath(eventId);
  }

  return readTempApicalExcelFile(dataPath);
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
