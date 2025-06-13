import type { EventCategoryId } from "../../model/eventcategory.ts";
import type { FlagRecord } from "../../model/flag.ts";
import type { TimeRecord } from "../../model/timerecord.ts";
import { findSessionStart } from "../../controllers/session.ts";
import { formatRFC3339 } from "date-fns";

export const useRFCTime = false;

export const millisecondsToTime = (milliseconds: number): string => {
  const seconds = Math.floor((milliseconds / 1000) % 60);
  const minutes = Math.floor((milliseconds / (1000 * 60)) % 60);
  const hours = Math.floor((milliseconds / (1000 * 60 * 60)) % 24);
  milliseconds = Math.floor(milliseconds % 1000);
  const formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
  return formattedTime;
};

export const elapsedTimeMilliseconds = (start: Date, end: Date): number => {
  const startTime = start.getTime();
  const endTime = end.getTime();
  return endTime - startTime;
};
// const addCachedParticipantLap = (laps: Map<EventParticipantId, ParticipantPassingRecord[]>, record: ParticipantPassingRecord): void => {
//   const participantId = record?.participantId;
//   if (!participantId) {
//     return;
//   }
//   if (!laps.has(participantId)) {
//     laps.set(participantId, []);
//   }
//   const participantLaps = laps.get(participantId)!;
//   participantLaps.push(record);
// };
// const sortParticipantTimes = (laps: Map<EventParticipantId, ParticipantPassingRecord[]>) => {
//   for (const key of laps.keys()) {
//     const participantLaps = laps.get(key);
//     if (!participantLaps || participantLaps.length === 0) {
//       console.error(`Participant ${key} has no laps`);
//     }
//     if (participantLaps && participantLaps.length > 0) {
//       participantLaps.sort(compareByTime);
//     }
//   }
// };
export const getElapsedTimeStart = (
  eventFlagEvents: FlagRecord[],
  categoryId: EventCategoryId
): Date | undefined => {
  const startTime: FlagRecord | undefined = findSessionStart(eventFlagEvents, categoryId);
  if (!startTime || startTime.time === undefined) {
    console.debug(`Tried to calculate elapsed time for category ${categoryId} with no start time`);
    return undefined;
  }
  return startTime.time;
};

export const tableTimeString = (time: Date | undefined): string => {
  if (!time) {
    return 'Unknown time';
  }
  let timeString = !time ? 'Undefined time' : 'Invalid time';
  try {
    timeString = formatRFC3339(time!, { fractionDigits: 3 });
    if (!useRFCTime) {
      // Now re-format in a shorter format.
      timeString = timeString.replace(/(.*T)/, '').replace(/([Z+].*)$/, '');
    }
    return timeString;
  } catch (error) {
    console.error(`Error formatting time for green flag ${timeString}`);
    throw error;
  }
};
export const isAfter = (first: Date, second: Date): boolean => first && second && first.getTime() > second.getTime();

export const lapTimeAfterStart = (lap: TimeRecord, participantStartTime: Date): number | undefined => {
  if (!lap?.time || !isAfter(lap.time, participantStartTime)) {
    return undefined;
  }

  const lapTime = elapsedTimeMilliseconds(participantStartTime, lap.time);
  return lapTime;
};

export const addToTime = (time: Date, duration: number): Date => {
  const newTime = new Date(time.getTime() + duration);
  return newTime;
};
