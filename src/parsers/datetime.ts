import { InvalidDateTimeStringError, TimeParseError } from "./errors.js";

import { parseDateString } from "./datestring.ts";
import { parseISO } from "date-fns/parseISO";
import { splitDateTime } from "./splitDateTime.ts";
import { tz } from "@date-fns/tz";
import { validateTimeString } from "../validators/time.js";

export const systemDateString = /^(?<year>\d{4})[-/](?<month>\d{1,2})[-/](?<day>\d{1,2})$/;
// const reverseDateString = /^(?<day>\d{1,2})[-/](?<month>\d{1,2})[-/](?<year>\d{4})$/;

// const reverseDateString = /^(?<day>\d{1,2})[-/](?<month>\d{1,2})[-/](?<year>\d{4})$/;

const getUserTimezone = (): string => {
  return 'Australia/Melbourne'; // Replace with actual logic to get user's timezone
};

export const combineDateWithTimeString = (date: Date, time: string): Date => {
  const [hour, minute, second, millisecond] = time.split(/[:.]/).map(Number);
  const newDate = new Date(date.getTime());
  newDate.setUTCHours(hour || 0, minute || 0, second || undefined, millisecond || undefined);
  return newDate;
};

const asSafeNumber = (value: string | number | undefined): number => {
  if (value === undefined) {
    return 0;
  }
  if (typeof value === 'number') {
    return value;
  }
  const parsedValue = parseInt(value, 10);
  return isNaN(parsedValue) ? 0 : parsedValue;
};

// export const parseDateString = (date: string): { day: number, month: number, year: number } => {
//   if (!date) {
//     throw new DateParseError('Date must be a valid string', date);
//   }
//   const dateParts = date.match(systemDateString) || date.match(reverseDateString);
//   if (!dateParts) {
//     throw new DateParseError('Date must be a valid string', date);
//   }
//   const day = asSafeNumber(dateParts?.groups?.day);
//   const month = asSafeNumber(dateParts?.groups?.month);
//   const year = asSafeNumber(dateParts?.groups?.year);

//   return { 
//     day, month, year,
//   };
// };

const dateAndTimeStringToDate = (date: string, time: string): Date => {
  if (!time) {
    throw new TimeParseError('Time must be a valid string', time);
  }

  // const { day, month, year } = parseDateString(date);
  const dateValue: Date = parseDateString(date); // Validate date format
  const day = dateValue.getUTCDate();
  const month = dateValue.getUTCMonth() + 1; // Months are zero-based in JavaScript
  const year = dateValue.getUTCFullYear();
  
  // const [day, month, year] = date.split(/[-/]/).map(Number);
  const [hour, minute, second, millisecond] = time.split(/[:.]/).map(Number);
  console.log(hour, minute, second, millisecond);

  const output = new Date(Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || undefined, millisecond || undefined));
  return output;
};

const dateAndTimeStringToIsoFormat = (date: string, time: string): string => {
  const parsed = dateAndTimeStringToDate(date, time);
  return parsed.toISOString();
};

export const parseUnknownDateTimeString = (input: string, sourceTimezone?: string | undefined, eventDateHint?: Date | undefined): Date => {
  if (sourceTimezone === undefined) {
    sourceTimezone = getUserTimezone();
  }
  // Check if the input is in ISO 8601 format
  const parsedIso = parseISO(input, { in: tz(sourceTimezone) });

  if (parsedIso && !isNaN(parsedIso.getTime())) {
    console.debug('Returning parsed ISO date:', parsedIso.toISOString());
    // If the input is a valid ISO 8601 date, return it
    return parsedIso;
  }

  if (hasDateComponent(input)) {
    const dtParts = splitDateTime(input);
    const isoDate = dateAndTimeStringToIsoFormat(dtParts.date, dtParts.time);
    const parsedDate = parseISO(isoDate, { in: tz(sourceTimezone) });
    return parsedDate;
  } else if (validateTimeString(input)) {
    // If the input is a time string, use the eventDateHint to create a full date
    if (!eventDateHint) {
      throw new Error("Event date hint is required for time-only input");
    }
    const newDate = combineDateWithTimeString(eventDateHint, input);
    return newDate;
  }

  throw new InvalidDateTimeStringError(input);
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

export const hasDateComponent = (input: string): boolean => 
  !!input.match(/.*([\sT]).*/) ||
  !!input.match(/.*\d{4}[-/]\d{1,2}[-/]\d{1,2}/) ||
  !!input.match(/.*\d{1,2}[-/]\d{1,2}[-/]\d{4}.*/);

