import { DateParseError } from "./errors.ts";
import { TZDate } from "@date-fns/tz";
import { datePartsToDMY } from "./dateutils.ts";
import { formatRFC3339 } from "date-fns";
import { parseSplitDateStringToDate } from "./splitStringToDate.js";

export const parseSlashedDateToDate = (input: string, tz?: string): Date => parseSplitDateStringToDate(input, '/', tz);

export const parseSlashedDateString = (input: string, tz: string = (new TZDate()).timeZone || 'UTC'): Date => {
  const date: Date = parseSlashedDateToDate(input, tz);
  const dt = date.getTime();

  if (isNaN(dt)) {
    throw new DateParseError(`Invalid slashed date value "${input}" resolved to ${dt}`, input);
  }

  return date;
};
  // parseSlashedDateToDate(input, dateHint?.timeZone ?? (new TZDate()).timeZone);

export const _oldParseSlashedDateString = (input: string, dateHint: Date = new Date()): Date => {
  if (input.includes(' ') || input.includes('T')) {
    throw new DateParseError('Can parse date only - time not supported', input);
  }

  const parts: string[] = input.split('/');
  if (parts.length !== 3) {
    throw new DateParseError("Invalid slashed date format", input);
  }

  // let [day, month, year]: [string, string, string] = [parts[0], parts[1], parts[2]];
  const dmyParts: [string, string, string] = [parts[0], parts[1], parts[2]];
  const dmy: { day: number; month: number; year: number } = datePartsToDMY(dmyParts);

  // if (/^\d{2}$/.test(year) && /^\d{2}$/.test(day)) {
  //   year = expandTwoDigitYear(year);
  //   // throw new DateParseError('Invalid slashed date value', input);
  // } else if (/^\d{2}$/.test(year) && /^\d{4}$/.test(day)) {
  //   [year, month, day] = [parts[0], parts[1], parts[2]];
  // } else if (/^\d{2}$/.test(year)) {
  //   year = expandTwoDigitYear(year);
  // }

  // validateYearFormat(year, input);
  const templateDate = new TZDate(dateHint);
  templateDate.setFullYear(dmy.year);
  templateDate.setMonth(dmy.month - 1);
  templateDate.setDate(dmy.day);

  const formatted: string = `${dmy.year}-${dmy.month}-${dmy.day}`;
  const date: Date = new TZDate(templateDate);

  // const formatted: string = `${year}-${month}-${day}T12:00:00`;
  // const date: Date = new Date(formatted);
  console.log(`Parsed date: ${date} from ${formatted}`);
  if (isNaN(date.getTime())) {
    // console.error(`Invalid slashed date value ${input} (${formatted} as ${date})`);
    // throw new DateParseError("Invalid slashed date value", input);
  } else if (formatRFC3339(date, { fractionDigits: 3 }).slice(0, 10) !== formatted) {
    console.trace(`Invalid slashed date value ${input} (${formatted} as ${date})`);
    throw new DateParseError("Invalid slashed date value", input);
  }

  return date;
};
