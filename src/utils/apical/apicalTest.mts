#!tsx

import { ApicalEventListResponse, ApicalEventResponseEventData, getApicalEventList } from './apicalEventList.ts';
import { apicalDataFileExists, generateOrGetCachedEventData } from './excelGenerate.ts';

console.log('Starting apicalTest...');

(async () => {
  try {
    console.log('Calling getApicalEventList...');
    const events: ApicalEventListResponse = (await getApicalEventList()).filter((e) => e.Name.includes("NF")).filter((_, index) => index < 3);

    events.forEach(async (event: ApicalEventResponseEventData) => {
      console.log(`Event ID: ${event.Id}, Name: ${event.Name}, Date: ${event.EventDate}`);
      if (await apicalDataFileExists(event.Id)) {
        console.log(`Data file exists for event ID: ${event.Id}`);
      } else {
        console.log(`Data file does not exist for event ID: ${event.Id}`);
      }

      generateOrGetCachedEventData(event.Id)
        .then((lapsData) => {
          console.log(`Laps data for event ID ${event.Id}:`, lapsData);
        })
        .catch((error) => {
           console.error(`Error fetching laps data for event ID ${event.Id}/${event.Name}:`, error);
        });
    });
    
    console.log('Fetched events:', events);
    console.log(`Total events: ${events.length}`);
  } catch (error) {
    console.error('Error fetching events:', error);
    process.exit(1);
  }
})();

console.log('Test');
