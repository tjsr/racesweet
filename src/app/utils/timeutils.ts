import type { EventCategoryId } from "../../model/eventcategory.js";
import type { FlagRecord } from "../../model/flag.js";
import type { TimeRecord } from "../../model/timerecord.js";
import { TZDate } from "@date-fns/tz";
import { findSessionStart } from "../../controllers/session.js";
import { formatRFC3339 } from "date-fns";

export const useRFCTime = false;

export type MillisecondsDuration = number;

export type UnknownDurationString = '--:--:--.---';

export type DurationString = `${string}:${string}.${string}` | `${string}:${string}:${string}.${string}` | UnknownDurationString;

export type TimeStringOrError = DurationString | 'Unknown time' | 'Invalid time' | 'Undefined time';

export type TimeDisplayZoneMode = 'event' | 'system' | 'gmt';

const isValidTimeTenthOfMillisecond = (value: number | null | undefined): value is number => {
  return value !== null && value !== undefined && Number.isInteger(value) && value >= 0 && value <= 9;
};

const appendTimeTenthOfMillisecond = (
  formattedTime: string,
  timeTenthOfMillisecond: number | null | undefined
): string => {
  return isValidTimeTenthOfMillisecond(timeTenthOfMillisecond)
    ? `${formattedTime}${timeTenthOfMillisecond}`
    : formattedTime;
};

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

const describeTimeValue = (time: Date | undefined): string => {
  if (!time) {
    return 'undefined';
  }

  return `toString="${time.toString()}", getTime=${time.getTime()}`;
};

export const tableTimeStringInTimeZone = (
  time: Date | undefined,
  timeZone: string | undefined,
  timeTenthOfMillisecond?: number | null
): string => {
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
    return appendTimeTenthOfMillisecond(
      `${parts.hour}:${parts.minute}:${parts.second}.${parts.fractionalSecond}`,
      timeTenthOfMillisecond
    );
  } catch (error) {
    console.error(`Error formatting time value ${describeTimeValue(time)} for time zone ${timeZone}`);
    throw error;
  }
};

export const timeOfDayInputStringInTimeZone = (
  time: Date | undefined,
  timeZone: string | undefined
): string => {
  return tableTimeStringInTimeZone(time, timeZone);
};

export const parseTimeOfDayInputInTimeZone = (
  anchorTime: Date | undefined,
  value: string,
  timeZone: string | undefined
): Date | undefined => {
  if (!anchorTime) {
    return undefined;
  }

  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
  if (!match) {
    return undefined;
  }

  const [, hoursText, minutesText, secondsText = '0', millisecondsText = '0'] = match;
  const normalizedTimeZone = normalizeTimeZone(timeZone);
  const { day, month, year } = getDatePartsInTimeZone(anchorTime, normalizedTimeZone);
  const zonedDate = new TZDate(
    year,
    month - 1,
    day,
    Number(hoursText),
    Number(minutesText),
    Number(secondsText),
    Number(millisecondsText.padEnd(3, '0')),
    normalizedTimeZone
  );
  return new Date(zonedDate.getTime());
};

export const dateStringInTimeZone = (date: Date | undefined, timeZone: string | undefined): string => {
  if (!date) {
    return '';
  }

  const { day, month, year } = getDatePartsInTimeZone(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

export const tableDateTimeStringInTimeZone = (
  time: Date | undefined,
  timeZone: string | undefined,
  timeTenthOfMillisecond?: number | null
): string => {
  if (!time) {
    return 'Unknown time';
  }

  return `${dateStringInTimeZone(time, timeZone)} ${tableTimeStringInTimeZone(time, timeZone, timeTenthOfMillisecond)}`;
};

export const millisecondsToTime = (milliseconds: MillisecondsDuration): DurationString => {
  const seconds = Math.floor((milliseconds / 1000) % 60);
  const minutes = Math.floor((milliseconds / (1000 * 60)) % 60);
  const hours = Math.floor(milliseconds / (1000 * 60 * 60));
  milliseconds = Math.floor(milliseconds % 1000);
  const secondsText = `${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
  const formattedTime = hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${secondsText}`
    : `${minutes}:${secondsText}`;
  return formattedTime as DurationString;
};

export const formatMinimumLapTimeInput = (milliseconds: number | null | undefined): string => {
  if (milliseconds === null || milliseconds === undefined || !Number.isFinite(milliseconds) || milliseconds < 0) {
    return '';
  }

  const wholeMilliseconds = Math.round(milliseconds);
  const hours = Math.floor(wholeMilliseconds / 3_600_000);
  const minutes = Math.floor((wholeMilliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((wholeMilliseconds % 60_000) / 1_000);
  const fractionalDigits = String((wholeMilliseconds % 1_000) * 10).padStart(4, '0');

  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${fractionalDigits}`;
};

export const parseMinimumLapTimeInputToMilliseconds = (value: string): number | null => {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  const durationMatch = /^(?:(?<hours>\d+):)?(?<minutes>\d{1,2}):(?<seconds>\d{2})(?:\.(?<fraction>\d{1,4}))?$/u.exec(trimmedValue);
  if (durationMatch?.groups) {
    const hours = Number(durationMatch.groups.hours || '0');
    const minutes = Number(durationMatch.groups.minutes);
    const seconds = Number(durationMatch.groups.seconds);
    const normalizedFraction = (durationMatch.groups.fraction || '').padEnd(4, '0');
    const milliseconds = Math.round(Number(normalizedFraction || '0') / 10);

    if (minutes >= 60 || seconds >= 60) {
      return null;
    }

    return (((hours * 60) + minutes) * 60 * 1000) + (seconds * 1000) + milliseconds;
  }

  const numericSeconds = Number(trimmedValue);
  return Number.isFinite(numericSeconds) && numericSeconds >= 0
    ? Math.round(numericSeconds * 1000)
    : null;
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

export const tableTimeString = (
  time: Date | undefined,
  timeZone?: string,
  timeTenthOfMillisecond?: number | null
): string => {
  if (!time) {
    return 'Unknown time';
  }
  if (timeZone) {
    return tableTimeStringInTimeZone(time, timeZone, timeTenthOfMillisecond);
  }
  let timeString: TimeStringOrError = !time ? 'Undefined time' : 'Invalid time';
  try {
    const tmpTimeString = formatRFC3339(time!, { fractionDigits: 3 });
    if (!useRFCTime) {
      // Now re-format in a shorter format.
      timeString = tmpTimeString.replace(/(.*T)/, '').replace(/([Z+].*)$/, '') as DurationString;
    }
    return appendTimeTenthOfMillisecond(timeString, timeTenthOfMillisecond);
  } catch (error) {
    console.error(`Error formatting time value ${describeTimeValue(time)} for green flag ${timeString}`);
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
