import { humanDateStringToSystemDateString } from "./humandate.js";
import { parseISO } from "date-fns/parseISO";
import { tz } from "@date-fns/tz";

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

  if (parsedIso) {
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

export const splitDateTime = (input: string): { date: string; time: string } => {
  if (!input) {
    throw new Error("Input cannot be empty");
  }
  if (input.includes('T')) {
    // Handle ISO 8601 format
    const dateTimeParts = input.split('T');
    if (dateTimeParts.length === 2) {
      return { date: dateTimeParts[0], time: dateTimeParts[1] };
    }
  }
  const dateTimeParts = input.split(' ');
  if (dateTimeParts.length === 2 && dateTimeParts[1].includes(':')) {
    return { date: humanDateStringToSystemDateString(dateTimeParts[0]), time: dateTimeParts[1] };
  } else if (dateTimeParts.length === 1 && systemDateString.test(dateTimeParts[0])) {
    return { date: humanDateStringToSystemDateString(dateTimeParts[1]), time: dateTimeParts[0] };
  }

  throw new Error(`Invalid date/time format: ${input}`);
};
