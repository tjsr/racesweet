#!tsx

import { calculateEventHandicapData, EventHandicapData, getAllMedianLapTimes, getEntrantLapTimeMap, outputHandicapsInOrder } from './apicalData.ts';
import { ApicalEventListResponse, ApicalEventResponseEventData, ExtendedApicalEventListData, getApicalEventList, writeJsonEventCache } from './apicalEventList.ts';
import { ApicalSpreadsheetLapsRow, readTempApicalExcelFile } from './apicalEventSpreadsheet.ts';
import { apicalDataFileExists, generateOrGetCachedEventPath } from './excelGenerate.ts';
import { readFile, readFileSync } from 'fs';

console.log('Starting apicalTest...');
const CACHED_EVENTS_FILE = 'cachedEvents.json';

(async () => {
  try {
    console.log('Calling getApicalEventList...');
    const events: ApicalEventListResponse = (await getApicalEventList()).filter((e) => e.Name.includes("NF"));

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

    Promise.all(eventPromises).then((data: ExtendedApicalEventListData[]) => {
      const outputHandicapData: Map<string, number> = new Map<string, number>();
      const sortedEvents: ExtendedApicalEventListData[] = data.sort((eventDataA, eventDataB) => new Date(eventDataB.EventDate).getTime() - new Date(eventDataA.EventDate).getTime());
      sortedEvents.forEach((event: ExtendedApicalEventListData) => {
        console.log(`Event handicap data for event ID ${event.Id}/${event.Name}:`);
        if (event.EventHandicapData) {
          outputHandicapsInOrder(event.EventHandicapData);
          processHandicaps(outputHandicapData, event.EventHandicapData);
        }
      });



      console.log(`Total events: ${events.length}`);
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
