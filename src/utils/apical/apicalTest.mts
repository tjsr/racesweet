#!tsx

import { readFileSync } from 'fs';

import { calculateEventHandicapData, EventHandicapData } from './apicalData.js';
import { ApicalEventListResponse, ApicalEventResponseEventData, ExtendedApicalEventListData, loadCachedOrUpdatedEventList, writeJsonEventCache } from './apicalEventList.js';
import { ApicalSpreadsheetLapsRow, readTempApicalExcelFile } from './apicalEventSpreadsheet.js';
import { generateOrGetCachedEventPath } from './excelGenerate.js';
import { generateEventHandicapList } from './handicapRoundData.js';
import { mapSnapshotEvents, writeHandicapSnapshot } from './handicapSnapshotOutput.js';
import { buildHandicapSnapshot, outputProcessedHandicaps, processHandicaps } from '../handicapData.js';

const args = process.argv.slice(2);
const forceRefreshEvents = args.includes('--refresh-events') || args.includes('--force-refresh');
const forceRefreshExcel = args.includes('--refresh-excel') || args.includes('--force-refresh');

if (forceRefreshEvents) console.log('Cache mode: forcing event list refresh');
if (forceRefreshExcel) console.log('Cache mode: forcing Excel file refresh');

console.log('Starting apicalTest...');
const CACHED_EVENTS_FILE = 'cachedEvents.json';
const HANDICAP_SNAPSHOT_FILE = 'src/generated/handicapSnapshot.json';
const EXCLUDE_EVENTS = [
  46, // Summer NFF 2 - didn't run
  48, // Multi-part race - race 1
  49, // Multipart race - race 2
];

(async () => {
  try {
    const events: ApicalEventListResponse = await loadCachedOrUpdatedEventList(
      CACHED_EVENTS_FILE,
      EXCLUDE_EVENTS,
      forceRefreshEvents
    );

    let file;
    try {
      file = readFileSync(CACHED_EVENTS_FILE, 'utf-8');
    } catch (error: unknown) {
      console.error('Error reading cached events file:', error instanceof Error ? error.message : String(error));
    }
    const cachedEvents: ExtendedApicalEventListData[] = file ? JSON.parse(file) : [];

    const eventDataResults: Array<ExtendedApicalEventListData | undefined> = await Promise.all(
      events.map(async (event: ApicalEventResponseEventData): Promise<ExtendedApicalEventListData | undefined> => {
        try {
          const cachedEvent: ExtendedApicalEventListData | undefined = cachedEvents.find((ce) => ce.Id === event.Id);
          const dataPath = await generateOrGetCachedEventPath(event.Id, forceRefreshExcel);
          const lapsData: ApicalSpreadsheetLapsRow[] = await readTempApicalExcelFile(dataPath);
          const handicapData: EventHandicapData = calculateEventHandicapData(event, lapsData);

          return {
            ...event,
            EventHandicapData: handicapData,
            ExcelDataPath: cachedEvent?.ExcelDataPath || dataPath,
          };
        } catch (error) {
          console.error(`Error fetching laps data for event ID ${event.Id}/${event.Name}:`, error);
          return undefined;
        }
      })
    );

    const validEventData: ExtendedApicalEventListData[] = eventDataResults.filter(
      (event): event is ExtendedApicalEventListData => event !== undefined
    );

    if (validEventData.length === 0) {
      throw new Error('No event handicap data could be generated.');
    }

    const outputHandicapData: Map<string, number> = new Map<string, number>();
    const sortedEvents: ExtendedApicalEventListData[] = validEventData.sort(
      (eventDataA, eventDataB) => new Date(eventDataB.EventDate).getTime() - new Date(eventDataA.EventDate).getTime()
    );
    const riderEventHandicapList: Map<string, string> = generateEventHandicapList(sortedEvents);
    const eventIds: number[] = sortedEvents.map((event: ExtendedApicalEventListData) => event.Id);
    const snapshotEvents = mapSnapshotEvents(sortedEvents);

    sortedEvents.forEach((event: ExtendedApicalEventListData) => {
      if (event.EventHandicapData) {
        processHandicaps(outputHandicapData, event.EventHandicapData);
      }
    });

    outputProcessedHandicaps(outputHandicapData, riderEventHandicapList);
    const handicapSnapshot = buildHandicapSnapshot(outputHandicapData, riderEventHandicapList, eventIds, snapshotEvents);
    const handicapSnapshotJson = JSON.stringify(handicapSnapshot, null, 2);
    console.log(`Writing handicap snapshot to ${HANDICAP_SNAPSHOT_FILE}...`);

    await writeHandicapSnapshot(HANDICAP_SNAPSHOT_FILE, handicapSnapshotJson);
    await writeJsonEventCache(sortedEvents, CACHED_EVENTS_FILE);

  } catch (error) {
    console.error('Error fetching events:', error);
    process.exit(1);
  }
})();
