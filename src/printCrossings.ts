import { OutreachFileTestSession } from './testdata/outreach.ts';
import type { TestSession } from './testdata/testsession.ts';
import colors from 'colors';
import { getCliTable } from "./controllers/clitable.ts";

export const useRFCTime = false;
colors.enable();

export const warn = (message?: string, ...optionalParams: unknown[]): void => {
  console.warn(`Warning: ${message}`, optionalParams);
};

export const MINIMUM_LAP_TIME_SECONDS = 300; // 5 minutes in milliseconds

// const filePath = path.format({
//   base: '192.168.1.119 2025-03-03.txt',
//   dir: testdata_dir,
// });
// const eventDate = new Date('2025-03-03T00:00:00Z');

// const categories = getCategoryList();

const eventSession: TestSession = new OutreachFileTestSession();
await eventSession.loadTestData();

// // If you want to get the rows with no valid time, assign the result to a variable:
// const rowsWithNoTime = event.records.filter(noTimeArrayRecordFilter);
// console.log('Rows with no time:', rowsWithNoTime.length);
// export let validTimes = event.records.filter((record) => !rowsWithNoTime.includes(record));
// const eventStartTime = new Date('2025-03-03T19:01:20');
// const eventEndTime = new Date('2025-03-03T20:00:00');
// validTimes = filterToEventsBetween(validTimes, eventStartTime, eventEndTime);
// console.log('Valid times:', validTimes.length);
// const sortedTimeRecords: TimeRecord[] = validTimes.sort(compareByTime);
// const sortedTimeRecords: TimeRecord[] = eventSession.records;

// eventSession.createGreenFlagTestRecords();
// // event.categories.push(...loadedCategories);

// const startFlags = eventSession.flags;
// // getFlagEvents(validTimes);
// console.log('Event flags: ', startFlags.length);

// export const participantMap: Map<EventParticipantId, EventParticipant> = new Map<EventParticipantId, EventParticipant>();
// event.participants.forEach((participant) => {
//   const id = participant.id;
//   if (id) {
//     participantMap.set(id, participant);
//   } else {
//     console.error(`Entrant ${participant.firstname} ${participant.surname} has no ID`);
//   }
// });

console.log(getCliTable(eventSession).toString());



