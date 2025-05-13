import { DateParseError } from "./errors.ts";
import { TZDate } from "@date-fns/tz";
import { parseSplitDateStringToDate } from "./splitStringToDate.ts";

export const validateDashedDateFormat = (input: string): boolean => {
  const dashedDateRegex = /\b\d{2}-\d{2}-\d{2}\b(?!\d)/;

  if (dashedDateRegex.test(input)) {
    throw new DateParseError("Invalid dashed date format", input);
  }
  return true;
};

export const parseDashedDateToDate = (input: string, tz?: string): Date => {
  validateDashedDateFormat(input);
  return parseSplitDateStringToDate(input, '-', tz);
};

export const parseDashedDateString = (input: string, tz: string = (new TZDate()).timeZone || 'UTC'): Date => {
  const date: Date = parseDashedDateToDate(input, tz);
  const dt = date.getTime();

  if (isNaN(dt)) {
    throw new DateParseError(`Invalid dashed date value "${input}" resolved to ${dt}`, input);
  }

  return date;
};
