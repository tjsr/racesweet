import { humanDateStringToSystemDateString } from "./humandate.js";
import { parseISO } from "date-fns/parseISO";
import { tz } from "@date-fns/tz";
import { validateTimeString } from "../validators/time.js";

const systemDateString = /^(?<year>\d{4})[-/](?<month>\d{1,2})[-/](?<day>\d{1,2})$/;

const getUserTimezone = (): string => {
  return 'Australia/Melbourne'; // Replace with actual logic to get user's timezone
};

export const parseUnknownDateTimeString = (input: string, sourceTimezone?: string | undefined, eventDateHint?: Date | undefined): Date => {
  if (sourceTimezone === undefined) {
    sourceTimezone = getUserTimezone();
  }
  // Check if the input is in ISO 8601 format
  const parsedIso = parseISO(input, { in: tz(sourceTimezone) });

  if (parsedIso && !isNaN(parsedIso.getTime())) {
    // If the input is a valid ISO 8601 date, return it
    return parsedIso;
  }

  const dtParts = splitDateTime(input);
  const dateToIsoFormat = (date: string, time: string): string => {
    const [day, month, year] = date.split(/[-/]/).map(Number);
    const [hour, minute] = time.split(/[:.]/).map(Number);
    const isoDate = new Date(Date.UTC(year, month - 1, day, hour || 0, minute || 0));
    return isoDate.toISOString();
  };
  const isoDate = dateToIsoFormat(dtParts.date, dtParts.time);
  const parsedDate = parseISO(isoDate, { in: tz(sourceTimezone) });

  return parsedDate;
};

export const hasDateAndTime = (input: string): boolean => {
  if (!input) {
    return false;
  }
  if (input.includes('T')) {
    return true; // ISO 8601 format
  }
  if (!input.includes(' ')) {
    return false;
  }
  const dateTimeParts = input.split(' ');
  if (dateTimeParts.length !== 2) {
    return false;
  }

  return dateTimeParts.some(p => p.includes(':'));
};

export const splitDateTime = (input: string): { date: string; time: string } => {
  if (!input) {
    throw new Error("Input cannot be empty");
  }
  let datePart: string | undefined = undefined;
  let timePart: string | undefined = undefined;
  if (!input.includes(' ') && !input.includes('T')) {
    throw new Error(`Invalid date/time format - missing space or T separator: ${input}`);
  }

  const dateTimeParts = input.split(input.includes('T') ? 'T' : ' ');
  if (dateTimeParts.length === 2 && dateTimeParts[1].includes(':')) {
    timePart = dateTimeParts[1];
    datePart = humanDateStringToSystemDateString(dateTimeParts[0]);
  } else if (dateTimeParts.length === 1 && systemDateString.test(dateTimeParts[0])) {
    datePart = humanDateStringToSystemDateString(dateTimeParts[1]);
    timePart = dateTimeParts[0];
  }

  const isValidTimeString: boolean = validateTimeString(timePart);
  if (!isValidTimeString) {
    throw new Error(`Invalid time format: ${timePart}`);
  }
  
  if (datePart && timePart) {
    return { date: datePart, time: timePart };
  }

  throw new Error(`Invalid date/time format: ${input}`);
};
