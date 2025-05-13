import { DateParseError } from "./errors.ts";
import { TZDate } from "@date-fns/tz";
import { datePartsToDMY } from "./dateutils.ts";

export const parseSplitDateStringToDate = (input: string, delimiter: string = '-', tz?: string): TZDate => {
  if (input.includes(' ') || input.includes('T')) {
    throw new DateParseError('Can parse date only - time not supported', input);
  }

  const parts: string[] = input.split(delimiter);
  if (parts.length !== 3) {
    throw new DateParseError("Invalid dashed date format", input);
  }

  const dmyParts: [string, string, string] = [parts[0], parts[1], parts[2]];

  const dmy: { day: number; month: number; year: number } = datePartsToDMY(dmyParts);
  if (tz) {
    return new TZDate(dmy.year, dmy.month - 1, dmy.day, tz);
  }
  return new TZDate(dmy.year, dmy.month - 1, dmy.day, (new TZDate()).timeZone);
};
