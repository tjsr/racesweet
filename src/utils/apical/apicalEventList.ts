import { EventHandicapData } from './apicalData.js';
import fs from 'fs/promises';

export const COMPANY_GMBC = 2;

const getApicalEventListUrl = (companyId: number = COMPANY_GMBC, timestamp: number = Date.now()): string => `https://apicalracetiming.com.au/raceresult/event/getall?companyId=${companyId}&_=${timestamp}`;

export interface ApicalEventResponseEventData {
  Id: number;
  Name: string;
  EventDate: string;
  CompanyName: string;
  ThumbPathAndFileName: string;
}

export interface ExtendedApicalEventListData extends ApicalEventResponseEventData {
  ExcelDataPath: string;
  EventHandicapData?: EventHandicapData;
}

export type  ApicalEventListResponse = ApicalEventResponseEventData[];

export const getApicalEventList = (companyId: number = COMPANY_GMBC, timestamp: number = Date.now()): Promise<ApicalEventListResponse> => {
  const url = getApicalEventListUrl(companyId, timestamp);
  return fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch event list: ${response.statusText}`);
      }
      return response.json();
    })
    .then((data: ApicalEventListResponse) => {
      if (!data || !Array.isArray(data)) {
        throw new Error('Invalid event list response format');
      }
      return data;
    });
};

export const writeJsonEventCache = async (events: ApicalEventListResponse, outputFile: string): Promise<void> => {
  const jsonData = JSON.stringify(events, null, 2);
  return fs.writeFile(outputFile, jsonData, 'utf-8');
};

export const loadCachedOrUpdatedEventList = async (): Promise<ApicalEventListResponse> => {
  return fs.stat('cachedEvents.json').then(async (stats) => {
    const existingData = await fs.readFile('cachedEvents.json', 'utf-8');
    if (existingData) {
      console.log('Loaded event list from cache');
      return JSON.parse(existingData);
    } throw new Error('Cached event list file is empty');
  }).catch((err) => {
    console.log('No cached event list found, fetching new data...');
    return getApicalEventList().then((data: ApicalEventListResponse) => {
      console.log('Fetched event list from API, caching to file...');
          
      const returnData = data.filter((e) => e.Name.includes("NF"));
      return writeJsonEventCache(data, 'cachedEvents.json').then(() => {
        console.log('Event list cached successfully');
        return returnData;
      });
    });
  });
};
