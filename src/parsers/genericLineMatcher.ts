import type { ChipCrossingData } from "../model/chipcrossing.ts";
import { TZDate } from "@date-fns/tz";
import { parse } from "date-fns";
import { parseUnknownDateTimeString } from "./date/datetime.ts";

export const parseDateTime = (dateTime: string, dateHint: TZDate, dateTimeFormat?: string | undefined): Date => {
  if (dateTimeFormat) {
    return parse(dateTime, dateTimeFormat, dateHint);
  }
  return parseUnknownDateTimeString(dateTime, dateHint);
};

export const parseLineMatching = (line: string,
  regex: RegExp,
  dateHint: TZDate,
  dateTimeFormat?: string | undefined
): Partial<ChipCrossingData> => {
  const match = line.match(regex);
  if (!match) {
    throw new Error(`Line does not match regex: ${line}`);
  }

  const { chipCode, dateTime } = match.groups || {};
  const parsedChipCode = parseInt(chipCode, 10);

  const parsedTime: Date = parseDateTime(dateTime, dateHint, dateTimeFormat);
  if (isNaN(parsedTime.getTime())) {
    throw new Error(`Invalid date format: ${dateTime}`);
  }
  return {
    chipCode: parsedChipCode,
    time: parsedTime,
  };
};
