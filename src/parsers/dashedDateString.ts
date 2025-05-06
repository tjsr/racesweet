import { DateParseError } from "./errors.js";
import { datePartsToDMY } from "./dateutils.js";

export const parseDashedDateString = (input: string): Date => {
  if (input.includes(' ') || input.includes('T')) {
    throw new DateParseError('Can parse date only - time not supported', input);
  }

  const parts: string[] = input.split('-');
  if (parts.length !== 3) {
    throw new DateParseError("Invalid dashed date format", input);
  }

  const dmyParts: [string, string, string] = [parts[0], parts[1], parts[2]];

  // if (/^\d{2}$/.test(year) && /^\d{2}$/.test(day)) {
  //   throw new DateParseError('Invalid dashed date value', input);
  // }
  const dmy: { day: number; month: number; year: number } = datePartsToDMY(dmyParts);

  // if (/^\d{2}$/.test(year) && /^\d{4}$/.test(day)) {
  //   day = parts[0];
  //   month = parts[1];
  //   year = parts[2];
  //   [day, month, year] = [parts[0], parts[1], parts[2]];
  // }

  // if (!/^\d{4}$/.test(year)) {
  //   console.warn(`Invalid year format: '${year}' in ${input}`);
  //   throw new InvalidYearError(year, input);
  // }

  // if (/^[a-zA-Z]{3}$/.test(month)) {
  //   month = monthStringToNumber(month, input);
  // }

  const formatted: string = `${dmy.year}-${dmy.month}-${dmy.day}`;
  const date: Date = new Date(formatted + 'T12:00:00');

  if (isNaN(date.getTime())) {
    throw new DateParseError(`Invalid dashed date value ${input} (${formatted})"`, input);
  }

  return date;
};
