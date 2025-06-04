import { DateParseError, InvalidMonthError, InvalidYearError } from "./errors.ts";

import { TZDate } from "@date-fns/tz/date";
import { expandTwoDigitYear } from "./datestring.js";
import { toZonedTime } from "date-fns-tz";

// import { toZonedTime } from "@date-fns/tz";
export type RFC3339DateStamp = string;

export const validEpoch2DigitYear = (year: number): boolean =>
  // Years 38-69 are invalid for two-digit input.
  (year < 100 && year >= 0) && (year < 38 || year >= 70);

export const validEpoch4DigitYear = (year: number): boolean =>
  // Years 38-69 are invalid for two-digit input.
  year <= 2037 && year >= 1970;

export const isValidYear = (year: number): boolean => {
  return validEpoch2DigitYear(year) || validEpoch4DigitYear(year);
};

export const timeToLocal = (date: Date): TZDate => {
  // eslint-disable-next-line new-cap
  const tzCurrent: string = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzDate: TZDate = TZDate.tz(tzCurrent, date);
  return tzDate;
};

export const dateToRFC3339Local = (date: Date): string => {
  throw new Error('Do not use');
  // eslint-disable-next-line new-cap
  const tzCurrent: string = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return toZonedTime(date, tzCurrent).toISOString();
};

export const datePartsToDMY = (parts: [string, string, string]): { day: number; month: number; year: number } => {
  if (parts.some((part) => part.length !== 1 && part.length !== 2 && part.length !== 4)) {
    throw new DateParseError(`Invalid date part lengths: '${parts}'`);
  }

  let [year, month, day]: [string, string, string] = [parts[0], parts[1], parts[2]];

  if (parts[0].length == 4) {
    year = parts[0];
    day = parts[2];
  } else if (parts[0].length == 2 && parts[2].length == 2) {
    day = parts[0];
    year = parts[2];
  } else if (parts[2].length == 4) {
    year = parts[2];
    day = parts[0];
  }  

  const numDay = parseInt(day, 10);
  if (numDay > 31) {
    throw new DateParseError(`Invalid day value in ${parts}: '${day}, year parsed as ${year}'`);
  }

  if (year.length == 2) {
    year = expandTwoDigitYear(year);
  }
  const numYear = parseInt(year, 10);
  if (!isValidYear(numYear)) {
    throw new InvalidYearError(year);
  }

  const numMonth = parseInt(month, 10);
  if (numMonth > 12) {
    throw new InvalidMonthError(month);
  }

  return { day: numDay, month: numMonth, year: numYear };
};

export const isDate = (input: string): boolean => {
  if (!input) {
    return false;
  }
  if (!/.*([-/]).*/.test(input)) {
    return false;
  };
  const parts = input.split(/[-/]/);
  if (parts.length < 3) {
    return false;
  }
  if (parts.some((part) => part.length !== 1 && part.length !== 2 && part.length !== 4)) {
    return false;
  }
  if (parseInt(parts[1], 10) > 12) {
    return false;
  }

  return true;
};

export const containsDate = (input: string): boolean => {
  const parts = input.split(/[\sT]/);
  if (parts.length < 1 || (!parts[0] && !parts[1])) {
    return false;
  }

  return isDate(parts[0]);
};

export const formatDate = (input: string): string|undefined => {
  const parts = input.split(/[\sT]/);
  if (!containsDate(input)) {
    throw new DateParseError('Invalid date string', input);
  }
  if (parts.length < 1) {
    return undefined;
  }
  const dateParts: string[] = parts[0].split(/[-/]/);
  if (dateParts.length < 3) {
    throw new DateParseError(`Invalid date string: '${input}'`);
  }
  const { day, month, year } = datePartsToDMY([dateParts[0], dateParts[1], dateParts[2]]);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; 
};

const getTimeFromString = (input: string): string => {
  const parts = input.split(/[\sT]/);
  if (parts.length <= 1 || !parts[0] || !parts[1]) {
    return '';
  }
  const timeParts = parts[parts.length - 1];
  return timeParts;
};

const _getTimeOffsetFromString = (input: string): string|undefined => {
  const time = getTimeFromString(input);
  if (time.includes('Z')) {
    return 'Z';
  } else if (time.includes('+')) {
    const parts = time.split('+');
    if (parts.length > 1) {
      return '+' + parts[1].trim();
    }
  };
  return undefined;
};

export const containsTimezone = (input: string): boolean => {
  const parts = input.split(/[\sT]/);
  if (parts.length <= 1 || !parts[0] || !parts[1]) {
    return false;
  }
  return /.*([+-]\d{2}:\d{2}|Z).*/.test(parts[parts.length - 1]);
};
export const isBetween = (query: Date, start: Date | undefined, end: Date | undefined): boolean => {
  const qt = query?.getTime();
  if (isNaN(qt)) {
    return false;
  }

  if (start) {
    const qs = start?.getTime();
    if (isNaN(qs)) {
      return false;
    }
    if (qs > qt) {
      return false;
    }
  }

  if (end) {
    const qe = end?.getTime();
    if (isNaN(qe)) {
      return false;
    }
    if (qe < qt) {
      return false;
    }
  }
  return true;
};
