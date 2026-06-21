import type { EventCategoryId } from "../../model/eventcategory.js";
import type { FlagRecord } from "../../model/flag.js";
import type { TimeRecord } from "../../model/timerecord.js";
import { TZDate } from "@date-fns/tz";
import { findSessionStart } from "../../controllers/session.js";
import { formatRFC3339 } from "date-fns";

export const useRFCTime = false;

export type MillisecondsDuration = number;

export type UnknownDurationString = '--:--:--.---';

export type DurationString = `${string}:${string}:${string}.${string}` | UnknownDurationString;

export type TimeStringOrError = DurationString | 'Unknown time' | 'Invalid time' | 'Undefined time';

export type TimeDisplayZoneMode = 'event' | 'system' | 'gmt';

export const getSystemTimeZone = (): string => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
};

export const normalizeTimeZone = (timeZone: string | undefined): string => {
  const candidate = timeZone?.trim() || getSystemTimeZone();
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate });
    return candidate;
  } catch (_error: unknown) {
    return getSystemTimeZone();
  }
};

export const resolveDisplayTimeZone = (
  mode: TimeDisplayZoneMode | undefined,
  eventTimeZone: string | undefined
): string => {
  if (mode === 'gmt') {
    return 'UTC';
  }
  if (mode === 'system') {
    return getSystemTimeZone();
  }
  return normalizeTimeZone(eventTimeZone);
};

export const getSupportedTimeZones = (): string[] => {
  const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  const systemTimeZone = getSystemTimeZone();
  const zones = typeof supportedValuesOf === 'function'
    ? supportedValuesOf('timeZone')
    : ['UTC', 'Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', systemTimeZone];
  return Array.from(new Set([systemTimeZone, ...zones])).sort((left, right) => left.localeCompare(right));
};

export const getDatePartsInTimeZone = (date: Date, timeZone: string | undefined): { day: number; month: number; year: number } => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: normalizeTimeZone(timeZone),
    year: 'numeric',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    day: Number(parts.day),
    month: Number(parts.month),
    year: Number(parts.year),
  };
};

export const dateAtStartOfDayInTimeZone = (date: Date, timeZone: string | undefined): Date => {
  const normalizedTimeZone = normalizeTimeZone(timeZone);
  const { day, month, year } = getDatePartsInTimeZone(date, normalizedTimeZone);
  return new TZDate(year, month - 1, day, 0, 0, 0, 0, normalizedTimeZone);
};

export const tableTimeStringInTimeZone = (time: Date | undefined, timeZone: string | undefined): string => {
  if (!time) {
    return 'Unknown time';
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      fractionalSecondDigits: 3,
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
      second: '2-digit',
      timeZone: normalizeTimeZone(timeZone),
    });
    const parts = Object.fromEntries(formatter.formatToParts(time).map((part) => [part.type, part.value]));
    return `${parts.hour}:${parts.minute}:${parts.second}.${parts.fractionalSecond}`;
  } catch (error) {
    console.error(`Error formatting time for time zone ${timeZone}`);
    throw error;
  }
};

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

export const tableTimeString = (time: Date | undefined, timeZone?: string): string => {
  if (!time) {
    return 'Unknown time';
  }
  if (timeZone) {
    return tableTimeStringInTimeZone(time, timeZone);
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
