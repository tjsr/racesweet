import { DateParseError, InvalidYearError } from "./errors.ts";

import { isValidYear } from "./dateutils.ts";
import { parseDashedDateString } from "./dashedDateString.ts";
import { parseSlashedDateString } from "./slashedDateString.ts";

export const expandTwoDigitYear = (yy: string): string => {
  if (yy == undefined || yy.length !== 2) {
    throw new DateParseError(`Invalid two-digit year: '${yy}'`);
  }
  const yearNum: number = parseInt(yy, 10);
  if (isNaN(yearNum)) {
    throw new DateParseError(`Invalid two-digit year: '${yy}'`);
  }
  if (yearNum < 50) return (2000 + yearNum).toString();
  return (1900 + yearNum).toString();
};

export const validateYearFormat = (year: string, date: string): void => {
  if (/^\d{3}$/.test(year)) {
    throw new InvalidYearError(year, date);
  }
  if (!/\d{2,4}$/.test(year) || !parseInt(year)) {
    throw new DateParseError(`Invalid year format: '${year}'`, date);
  }
  const numYear = parseInt(year);
  if (!isValidYear(numYear)) {
    throw new InvalidYearError(year, date);
  }
};

export const monthStringToNumber = (month: string, dateInput: string): string => {
  const date = new Date(`${month} 1, 2000`);
  if (isNaN(date.getTime())) {
    throw new DateParseError(`Invalid month string: '${month}'`, dateInput);
  }
  return (date.getMonth() + 1).toString().padStart(2, '0');
};

export const parseDateString = (input: string): Date => {
  if (input.includes(' ') || input.includes('T')) {
    throw new DateParseError('Can parse date only - time not supported', input);
  }

  if (input.includes('-')) {
    return parseDashedDateString(input);
  } else if (input.includes('/')) {
    return parseSlashedDateString(input);
  } else {
    throw new DateParseError("Unsupported date format: must use '-' or '/' separators", input);
  }
};
