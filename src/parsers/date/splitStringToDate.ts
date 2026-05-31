import { DateParseError } from "./errors.js";
import { TZDate } from "@date-fns/tz";
import { datePartsToDMY } from "./dateutils.js";

export const parseSplitDateStringToDate = (input: string, delimiter: string = '-', tz?: string): TZDate => {
  if (input.includes(' ') || input.includes('T')) {
    throw new DateParseError('Can parse date only - time not supported', input);
  }

  const parts: string[] = input.split(delimiter);
  if (parts.length !== 3) {
    throw new DateParseError("Invalid dashed date format", input);
  }

  const dmyParts: [string, string, string] = [parts[0], parts[1], parts[2]];

  // Reject ambiguous 2-digit years in range 37-69: these expand to 2037 (valid epoch) or
  // 1938-1969 (below epoch) but are ambiguous and not reliably parseable.
  if (parts[0].length === 2 && parts[2].length === 2) {
    const potentialYear = parseInt(parts[2], 10);
    if (potentialYear >= 37 && potentialYear < 70) {
      throw new DateParseError(`Ambiguous 2-digit year in range 37-69: '${parts[2]}'`, input);
    }
  }

  const dmy: { day: number; month: number; year: number } = datePartsToDMY(dmyParts);
  if (tz) {
    return new TZDate(dmy.year, dmy.month - 1, dmy.day, tz);
  }
  return new TZDate(dmy.year, dmy.month - 1, dmy.day);
};
