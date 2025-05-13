import type { ChipCrossingData, UnparsedTimeEvent } from "../model/chipcrossing.ts";

import type { TZDate } from "@date-fns/tz";
import { parseUnknownDateTimeString } from "./date/datetime.ts";
import { safeIntOption } from "../utils.ts";
import { tryParseDateTime } from "./rfidTimingDate.ts";

const outreachRfidTimingFormatPattern: RegExp = /(?<antenna>\d+),(?<chipCode>\d+),(?<hexChipCode>\d+),"?(?<timeString>[\d\-/\s:.]+)"?(,(?<reader>\d+),(?<antenna2>\d+))?/;

class InvalidRfidTimingFormatError extends Error {
  constructor(reason: string, line: string) {
    super(`Invalid RFID timing format - ${reason}: ${line}`);
    this.name = 'InvalidRfidTimingFormatError';
  }
}

class DateTimeParseError extends Error {
  constructor(reason: string, line: string) {
    super(`Invalid date/time format - ${reason}: ${line}`);
    this.name = 'DateTimeParseError';
  }
}

interface RFIDTimingChipCrossingData extends ChipCrossingData {
  antenna: number | undefined;
}

const chipOrHexChip = (chipCode: string, hexChipCode: string): number => {
  if (chipCode !== undefined) {
    return parseInt(chipCode, 10);
  }
  if (hexChipCode !== undefined) {
    return parseInt(hexChipCode, 16);
  }
  throw new Error('No chip code provided');
};

export const matchRfidLine = (line: string): RegExpMatchArray | null => line.match(outreachRfidTimingFormatPattern);

export const fromRfidTimingLine = (line: string, eventDateHint: TZDate): Partial<UnparsedTimeEvent<RFIDTimingChipCrossingData>> | null => {
  console.trace(fromRfidTimingLine, line, eventDateHint);
  const rfidTimingMatches: RegExpMatchArray | null = matchRfidLine(line);
  if (!rfidTimingMatches) {
    return null;
  }
  if (rfidTimingMatches.groups?.timeString === undefined) {
    throw new InvalidRfidTimingFormatError('No time value', line);
  }
  const timeString: string = rfidTimingMatches.groups?.timeString;

  // let timeValue: Date | null = null;
  // try {
  //   timeValue = tryParseDateTime(timeString, eventDateHint);
  // } catch (_dateParseError) {
  //   timeValue = parseUnknownDateTimeString(timeString, eventDateHint);
  // }
  // if (timeValue === null) {
  //   throw new InvalidRfidTimingFormatError(`Unrecognised time value: ${timeString}`, line);
  // }  

  const g = rfidTimingMatches.groups;
  // const fullYear = timeValue.getUTCFullYear();
  // if (fullYear < 2000) {
  //   throw new DateTimeParseError(`Invalid year ${fullYear} in time value`, line);
  // }

  const data: Partial<UnparsedTimeEvent<RFIDTimingChipCrossingData>> = {
    antenna: safeIntOption(g.antenna, g.antenna2),
    chipCode: chipOrHexChip(g.chipCode, g.hexChipCode),
    timeString: timeString,
  };
  return data;
};
