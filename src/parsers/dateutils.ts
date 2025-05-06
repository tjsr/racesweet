import { InvalidYearError } from "./errors.js";
import { TZDate } from "@date-fns/tz/date";
import { expandTwoDigitYear } from "./datestring.js";
import { toZonedTime } from "date-fns-tz";

export const validEpoch2DigitYear = (year: number): boolean =>
  // Years 38-69 are invalid for two-digit input.
  (year < 100 && year >= 0) && (year < 38 || year >= 70);

export const validEpoch4DigitYear = (year: number): boolean =>
  // Years 38-69 are invalid for two-digit input.
  year <= 2037 && year >= 1970;

export const isValidYear = (year: number): boolean => {
  return validEpoch2DigitYear(year) || validEpoch4DigitYear(year);
};

export const timeToLocal = (date: Date): Date => {
  // eslint-disable-next-line new-cap
  const tzCurrent: string = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzDate = TZDate.tz(tzCurrent, date);
  return tzDate;
};

export const dateToRFC3339Local = (date: Date): string => {
  // eslint-disable-next-line new-cap
  const tzCurrent: string = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return toZonedTime(date, tzCurrent).toISOString();
};

export const datePartsToDMY = (parts: [string, string, string]): { day: number; month: number; year: number } => {
  let [year, month, day]: [string, string, string] = [parts[0], parts[1], parts[2]];
  if (/^\d{2}$/.test(parts[0]) && (/^\d{4}$/.test(parts[2]) || parseInt(parts[2]) > 31)) {
    year = parts[2];
    day = parts[0];
  }

  let numYear = parseInt(year, 10);
  if (!isValidYear(numYear)) {
    throw new InvalidYearError(year);
  }
  
  if (numYear < 100) {
    year = expandTwoDigitYear(year);
    numYear = parseInt(year, 10);
  }

  return { day: parseInt(day, 10), month: parseInt(month, 10), year: numYear };
};

