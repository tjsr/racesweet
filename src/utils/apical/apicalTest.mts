#!tsx

import { calculateEventHandicapData, EventEntrantHandicapData, EventHandicapData } from './apicalData.js';
import { ApicalEventListResponse, ApicalEventResponseEventData, ExtendedApicalEventListData, loadCachedOrUpdatedEventList, writeJsonEventCache } from './apicalEventList.js';
import { ApicalSpreadsheetLapsRow, readTempApicalExcelFile } from './apicalEventSpreadsheet.js';
import { apicalDataFileExists, generateOrGetCachedEventPath } from './excelGenerate.js';
import { readFileSync } from 'fs';
import { outputProcessedHandicaps, processHandicaps } from '../handicapData.js';
import { count } from 'console';

console.log('Starting apicalTest...');
const CACHED_EVENTS_FILE = 'cachedEvents.json';
const EXCLUDE_EVENTS = [
  46, // Summer NFF 2 - didn't run
  48, // Multi-part race - race 1
  49, // Multipart race - race 2
];

(async () => {
  try {
    const events: ApicalEventListResponse = await loadCachedOrUpdatedEventList(CACHED_EVENTS_FILE, EXCLUDE_EVENTS);

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

        // console.log(`Event ID: ${event.Id}, Name: ${event.Name}, Date: ${event.EventDate}`);
        if (await apicalDataFileExists(event.Id)) {
          // console.log(`Data file exists for event ID: ${event.Id}`);
        } else {
          // console.log(`Data file does not exist for event ID: ${event.Id}`);
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
    const generateEventHandicapList = (events: ExtendedApicalEventListData[]): Map<string, string> => {
      const output: Map<string, string> = new Map<string, string>();
      events.forEach((d: ExtendedApicalEventListData, eventIndex: number) => {
        const eventNumber = eventIndex + 1;

        d.EventHandicapData?.entrantData.forEach((entrant: EventEntrantHandicapData) => {
          // const existingEntrant: string = output.get(entrant.name)!;
          let existingVal: string | undefined = output.get(entrant.name) || '';
          const entrantEventNumber = countOccurrences(existingVal, ",");
          let roundsMissing = eventNumber - entrantEventNumber;
          let outputRound = countOccurrences(existingVal, ",") + 1;
          while (outputRound < eventNumber) {
            const crstr = outputRound + "=";
            existingVal = existingVal + "," + crstr + ":";
            outputRound = countOccurrences(existingVal, ",") + 1;
          }
          existingVal = existingVal + "," + outputRound + "=" + entrant.ratioScore.toFixed(4) +":" + entrant.medianLapTime.toFixed(0);
          output.set(entrant.name, existingVal);
        });

        // Append commas to entrants who did not participate in this event to maintain alignment
        output.forEach((val: string, key: string) => {
          let currentRound = countOccurrences(val, ",") + 1;
          while (currentRound <= eventNumber) {
            const crstr = currentRound + "=";
            val = val + "," + crstr + ":";
            currentRound = countOccurrences(val, ",") + 1;
          }
          output.set(key, val);
        });
      });
      output.forEach((val: string, key: string) => {
        output.set(key, val.replaceAll(/[:=]/g, ","));
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
          // processMediaLaps(event.EventHandicapData);
        }
      });

      // console.log(`Total events: ${events.length}`);
      outputProcessedHandicaps(outputHandicapData, riderEventHandicapList);
      return writeJsonEventCache(sortedEvents, CACHED_EVENTS_FILE);
    }).then(() => { 
      // console.log(`Event cache written to ${CACHED_EVENTS_FILE}`);
    });

  } catch (error) {
    console.error('Error fetching events:', error);
    process.exit(1);
  }
})();
