import { DateParseError, InvalidDateTimeStringError, TimeParseError } from "./errors.js";
import { TZDate, tz } from "@date-fns/tz";

import type { RFC3339DateStamp } from "./dateutils.js";
import adp from 'any-date-parser';
import { formatRFC3339 } from "date-fns";
import { parseDateString } from "./datestring.js";
import { parseISO } from "date-fns/parseISO";
import { splitDateTime } from "./splitDateTime.js";
import { validateTimeString } from "../../validators/time.js";

export const systemDateString = /^(?<year>\d{4})[-/](?<month>\d{1,2})[-/](?<day>\d{1,2})$/;
// const reverseDateString = /^(?<day>\d{1,2})[-/](?<month>\d{1,2})[-/](?<year>\d{4})$/;

// const reverseDateString = /^(?<day>\d{1,2})[-/](?<month>\d{1,2})[-/](?<year>\d{4})$/;

export const getUserTimezone = (): string => {
  return 'Australia/Melbourne'; // Replace with actual logic to get user's timezone
};

export const combineDateWithTimeString = (date: Date, time: string): TZDate => {
  const [hour, minute, second, millisecond] = time.split(/[:.]/).map(Number);
  const newDate = new TZDate(date.getTime());
  newDate.setUTCHours(hour || 0, minute || 0, second || undefined, millisecond || undefined);
  return newDate;
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

export const fixDateInDateTimeString = (date: string): string => {
  if (!date) {
    throw new DateParseError('Date must be a valid string', date);
  } 
  const dateParts = date.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})[\sT](.*)$/);
  if (dateParts) {
    const day = dateParts[1];
    const month = dateParts[2];
    const year = dateParts[3];
    return `${year}-${month}-${day}T${dateParts[4]}`;
  }
  return date;
};

export const dateAndTimeStringToDate = (date: string, time: string, dateHint: TZDate): TZDate => {
  if (!time) {
    throw new TimeParseError('Time must be a valid string', time);
  }

  // const hasTz = containsTimezone(time);
  // if (!hasTz && dateHint) {
  //   time = time + tz(dateHint.getTimezoneOffset());
  // } else if (!hasTz) {
  //   time = time + timeOffsetToString(dateHint.getTimezoneOffset());
  // }


  // const nDate = new TZDate(dateHint);
  // const dDate = TZDate.parse(date);
  // const tTime = TZDate.parse(time);


  // const { day, month, year } = parseDateString(date);
  const dateValue: Date = parseDateString(date); // Validate date format
  const day = dateValue.getUTCDate();
  const month = dateValue.getUTCMonth() + 1; // Months are zero-based in JavaScript
  const year = dateValue.getUTCFullYear();
  
  // const [day, month, year] = date.split(/[-/]/).map(Number);
  const [hour, minute, second, millisecond] = time.split(/[:.]/).map(Number);
  console.debug(dateAndTimeStringToDate, hour, minute, second, millisecond);

  const output = new TZDate(year, month - 1, day, hour || 0, minute || 0, second || 0, millisecond || 0, dateHint.timeZone || getUserTimezone());
  return output;
};

export const dateAndTimeStringToIsoFormat = (date: string, time: string, dateHint: TZDate): RFC3339DateStamp => {
  const parsed = dateAndTimeStringToDate(date, time, dateHint);
  console.debug(dateAndTimeStringToIsoFormat, date, time, parsed);
  return formatRFC3339(parsed, { fractionDigits: 3 });
};

const assertValidTimeString = (input: string): void => {
  const hasValidTime = validateTimeString(input);

  if (!hasValidTime) {
    throw new TimeParseError('Time value could not be parsed.', input);
  }
};

export const anyDateParseUnknownDateTimeString = (input: string): TZDate => {
  const date = adp.fromString(input);
  if (date !== null) {
    return new TZDate(date);;
  }

  throw new DateParseError('Date value could not be parsed.', input);
};

export const parseUnknownDateTimeString = (input: string, eventDateHint: TZDate): TZDate => {
  const hasDate = hasDateComponent(input);
  if (hasDate) {
    assertValidTimeString(input.split(' ')[1] || input.split('T')[1]);
  } else {
    assertValidTimeString(input);
  }

  if (!hasDate && !eventDateHint) {
    throw new Error("Event date hint is required for time-only input");
  }

  const useTz = tz(eventDateHint.timeZone || getUserTimezone());

  const parseTz = input.includes('+') ? undefined : useTz;
  // Check if the input is in ISO 8601 format
  const parsedIso = parseISO(input, { in: parseTz });

  if (parsedIso && !isNaN(parsedIso.getTime())) {
    console.debug(parseUnknownDateTimeString, 'Returning parsed ISO date:', parsedIso.toISOString());
    // If the input is a valid ISO 8601 date, return it
    return parsedIso;
  }

  if (hasDateComponent(input)) {
    const dtParts = splitDateTime(input);
    const isoDate = dateAndTimeStringToIsoFormat(dtParts.date, dtParts.time, eventDateHint);
    const parsedDate = parseISO(isoDate, { in: useTz });
    return parsedDate;
  } else if (validateTimeString(input)) {
    // If the input is a time string, use the eventDateHint to create a full date
    if (!eventDateHint) {
      throw new Error("Event date hint is required for time-only input");
    }
    const newDate: TZDate = combineDateWithTimeString(eventDateHint, input);
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

