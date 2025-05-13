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
