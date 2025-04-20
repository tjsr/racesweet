import type { ChipCrossingData } from "../model/chipcrossing.js";
import { parse } from "date-fns";
import { parseUnknownDateTimeString } from "./datetime.js";

export const parseDateTime = (dateTime: string, dateTimeFormat?: string | undefined, sourceTimezone?: string | undefined, dateHint: Date = new Date()): Date => {
  if (dateTimeFormat) {
    return parse(dateTime, dateTimeFormat, dateHint);
  }
  return parseUnknownDateTimeString(dateTime, sourceTimezone);
};

export const parseLineMatching = (line: string,
  regex: RegExp,
  dateTimeFormat?: string | undefined,
  sourceTimezone?: string | undefined
): ChipCrossingData => {
  const match = line.match(regex);
  if (!match) {
    throw new Error(`Line does not match regex: ${line}`);
  }

  const { chipCode, dateTime } = match.groups || {};
  const parsedChipCode = parseInt(chipCode, 10);

  const parsedTime: Date = parseDateTime(dateTime, dateTimeFormat, sourceTimezone);
  if (isNaN(parsedTime.getTime())) {
    throw new Error(`Invalid date format: ${dateTime}`);
  }
  return {
    chipCode: parsedChipCode,
    time: parsedTime,
  };
};
