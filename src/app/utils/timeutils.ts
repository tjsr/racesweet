import type { EventCategoryId } from "../../model/eventcategory.js";
import type { FlagRecord } from "../../model/flag.js";
import type { TimeRecord } from "../../model/timerecord.js";
import { findSessionStart } from "../../controllers/session.js";
import { formatRFC3339 } from "date-fns";

export const useRFCTime = false;

export type MillisecondsDuration = number;

export type UnknownDurationString = '--:--:--.---';

export type DurationString = `${string}:${string}:${string}.${string}` | UnknownDurationString;

export type TimeStringOrError = DurationString | 'Unknown time' | 'Invalid time' | 'Undefined time';

export const millisecondsToTime = (milliseconds: MillisecondsDuration): DurationString => {
  const seconds = Math.floor((milliseconds / 1000) % 60);
  const minutes = Math.floor((milliseconds / (1000 * 60)) % 60);
  const hours = Math.floor((milliseconds / (1000 * 60 * 60)) % 24);
  milliseconds = Math.floor(milliseconds % 1000);
  const formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}` as DurationString;
  return formattedTime;
};

export const elapsedTimeMilliseconds = (start: Date, end: Date): MillisecondsDuration => {
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
  let timeString: TimeStringOrError = !time ? 'Undefined time' : 'Invalid time';
  try {
    const tmpTimeString = formatRFC3339(time!, { fractionDigits: 3 });
    if (!useRFCTime) {
      // Now re-format in a shorter format.
      timeString = tmpTimeString.replace(/(.*T)/, '').replace(/([Z+].*)$/, '') as DurationString;
    }
    return timeString;
  } catch (error) {
    console.error(`Error formatting time for green flag ${timeString}`);
    throw error;
  }
};
export const isAfter = (first: Date, second: Date): boolean => first && second && first.getTime() > second.getTime();

export const lapTimeAfterStart = (lap: TimeRecord, participantStartTime: Date): MillisecondsDuration | undefined => {
  if (!lap?.time || !isAfter(lap.time, participantStartTime)) {
    return undefined;
  }

  const lapTime = elapsedTimeMilliseconds(participantStartTime, lap.time);
  return lapTime;
};

export const addToTime = (time: Date, duration: MillisecondsDuration): Date => {
  const newTime = new Date(time.getTime() + duration);
  return newTime;
};
