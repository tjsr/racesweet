#!tsx

import { calculateEventHandicapData, EventHandicapData, getAllMedianLapTimes, getEntrantLapTimeMap, outputHandicapsInOrder } from './apicalData.js';
import { ApicalEventListResponse, ApicalEventResponseEventData, ExtendedApicalEventListData, getApicalEventList, loadCachedOrUpdatedEventList, writeJsonEventCache } from './apicalEventList.js';
import { ApicalSpreadsheetLapsRow, readTempApicalExcelFile } from './apicalEventSpreadsheet.js';
import { apicalDataFileExists, generateOrGetCachedEventPath } from './excelGenerate.js';
import { readFileSync } from 'fs';
import { outputProcessedHandicaps, processHandicaps } from '../handicapData.js';
import { count } from 'console';

console.log('Starting apicalTest...');
const CACHED_EVENTS_FILE = 'cachedEvents.json';

(async () => {
  try {
    console.log('Calling getApicalEventList...');

    const events: ApicalEventListResponse = await loadCachedOrUpdatedEventList();

    let file;
    try {
      file = readFileSync(CACHED_EVENTS_FILE, 'utf-8');
    } catch (error: unknown) {
      console.error('Error reading cached events file:', error instanceof Error ? error.message : String(error));
    }
    const cachedEvents: ExtendedApicalEventListData[] = file ? JSON.parse(file) : [];
    const modifiedEvents: ExtendedApicalEventListData[] = [];
    const eventPromises: Promise<ExtendedApicalEventListData>[] = events.map(
      (event: ApicalEventResponseEventData) => new Promise<ExtendedApicalEventListData>(async (resolve, reject) => {

        console.log(`Event ID: ${event.Id}, Name: ${event.Name}, Date: ${event.EventDate}`);
        if (await apicalDataFileExists(event.Id)) {
          console.log(`Data file exists for event ID: ${event.Id}`);
        } else {
          console.log(`Data file does not exist for event ID: ${event.Id}`);
        }
        const cachedEvent: ExtendedApicalEventListData | undefined = cachedEvents.find((ce) => ce.Id === event.Id);

        const extendedEvent: Partial<ExtendedApicalEventListData> = {
            ...event,
            ExcelDataPath: cachedEvent ? cachedEvent.ExcelDataPath : undefined,
          };

        generateOrGetCachedEventPath(event.Id)
          .then((dataPath) => {
            extendedEvent.ExcelDataPath = dataPath;
            modifiedEvents.push(extendedEvent as ExtendedApicalEventListData);
            return readTempApicalExcelFile(dataPath);
            // resolve(extendedEvent as ExtendedApicalEventListData);
          })
          .then((lapsData: ApicalSpreadsheetLapsRow[]) => {
            const handicapData: EventHandicapData = calculateEventHandicapData(event, lapsData);
            extendedEvent.EventHandicapData = handicapData;
            resolve(extendedEvent as ExtendedApicalEventListData);
          })
          .catch((error) => {
            console.error(`Error fetching laps data for event ID ${event.Id}/${event.Name}:`, error);
          });
      }));
    
    const countOccurrences = (str: string, char: string): number => (str.match(new RegExp(char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    const generateEventHandicapList = (data: ExtendedApicalEventListData[]): Map<string, string> => {
      const output: Map<string, string> = new Map<string, string>();
      data.forEach((d: ExtendedApicalEventListData, idx: number) => {
        d.EventHandicapData?.entrantData.forEach((entrant) => {
          // const existingEntrant: string = output.get(entrant.name)!;
          let existingVal: string | undefined = output.get(entrant.name) || '';
          while (countOccurrences(existingVal, ",") < idx) {
            existingVal = existingVal + ",";
          }
          existingVal = existingVal + entrant.ratioScore.toFixed(4);
          output.set(entrant.name, existingVal);
        });
        output.forEach((val: string, key: string) => {
          while (countOccurrences(val, ",") < idx) {
            val = val + ",";
          }
          output.set(key, val);
        });
      });
      return output;
    };

    Promise.all(eventPromises).then((data: ExtendedApicalEventListData[]) => {
      const outputHandicapData: Map<string, number> = new Map<string, number>();
      const sortedEvents: ExtendedApicalEventListData[] = data.sort((eventDataA, eventDataB) => new Date(eventDataB.EventDate).getTime() - new Date(eventDataA.EventDate).getTime());
      const riderEventHandicapList: Map<string, string> = generateEventHandicapList(data);
      sortedEvents.forEach((event: ExtendedApicalEventListData) => {
        if (event.EventHandicapData) {
          // console.log(`Event handicap data for event ID ${event.Id}/${event.Name}:`);
          // outputHandicapsInOrder(event.EventHandicapData);
          processHandicaps(outputHandicapData, event.EventHandicapData);
        }
      });

      console.log(`Total events: ${events.length}`);
      outputProcessedHandicaps(outputHandicapData, riderEventHandicapList);
      return writeJsonEventCache(sortedEvents, CACHED_EVENTS_FILE);
    }).then(() => { 
      console.log(`Event cache written to ${CACHED_EVENTS_FILE}`);
    });

  } catch (error) {
    console.error('Error fetching events:', error);
    process.exit(1);
  }
})();

console.log('Test');
