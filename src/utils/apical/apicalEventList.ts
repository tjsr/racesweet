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

export type ApicalEventListResponse = ApicalEventResponseEventData[];

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

export const loadCachedOrUpdatedEventList = async (cacheFileName: string, excludedEventIds: number[] = [], forceRefreshEvents: boolean = false): Promise<ApicalEventListResponse> => {
  const loadFromCache = () => fs.stat(cacheFileName).then(async () => {
    const existingData = await fs.readFile(cacheFileName, 'utf-8');
    if (existingData) {
      console.log(`Loaded event list from cache at ${cacheFileName}`);
      return JSON.parse(existingData);
    }
    throw new Error(`Cached event list file ${cacheFileName} is empty`);
  });

  const loadFromApi = () => {
    console.log(`Fetching fresh event list from API...`);
    return getApicalEventList().then((data: ApicalEventListResponse) => {
      console.log('Fetched event list from API, caching to file...');
      return writeJsonEventCache(data, cacheFileName).then(() => {
        console.log(`Event list cached successfully to ${cacheFileName}`);
        return data;
      });
    });
  };

  const loadEvents = forceRefreshEvents
    ? loadFromApi()
    : loadFromCache().catch(() => {
      console.log(`No cached event list found at ${cacheFileName}, fetching new data...`);
      return loadFromApi();
    });

  return loadEvents.then((events: ApicalEventListResponse) => {
    const filteredEvents = events.filter((e) => e.Name.includes('NF') && !excludedEventIds.includes(e.Id));
    return filteredEvents;
  });
};
