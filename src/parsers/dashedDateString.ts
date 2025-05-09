import { DateParseError } from "./errors.js";
import { datePartsToDMY } from "./dateutils.js";

export const parseDashedDateToDate = (input: string): Date => prseSplitDateStringToDate(input, '-');

export const parseSlashedDateToDate = (input: string): Date => prseSplitDateStringToDate(input, '/');

export const prseSplitDateStringToDate = (input: string, delimiter: string = '-'): Date => {
  if (input.includes(' ') || input.includes('T')) {
    throw new DateParseError('Can parse date only - time not supported', input);
  }

  const parts: string[] = input.split(delimiter);
  if (parts.length !== 3) {
    throw new DateParseError("Invalid dashed date format", input);
  }

  const dmyParts: [string, string, string] = [parts[0], parts[1], parts[2]];

  const dmy: { day: number; month: number; year: number } = datePartsToDMY(dmyParts);
  return new Date(dmy.year, dmy.month - 1, dmy.day);
};

export const parseDashedDateString = (input: string): Date => {
  const date: Date = parseDashedDateToDate(input);

  if (isNaN(date.getTime())) {
    throw new DateParseError(`Invalid dashed date value ${input}"`, input);
  }

  return date;
};
