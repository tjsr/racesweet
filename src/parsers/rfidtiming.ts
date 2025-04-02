import type { ChipCrossingData } from "../model/chipcrossing.js";
import { parseUnknownDateTimeString } from "./datetime.js";
import { safeIntOption } from "../utils.js";

const outreachRfidTimingFormatPattern: RegExp = /(?<antenna>\d),(?<chipCode>\d),(?<hexChipCode>\d),\"?(?<time>\s)\"?(,(?<reader>\d),(?<antenna2>\d))?/

class InvalidRfidTimingFormatError extends Error {
  constructor(reason: string, line: string) {
    super(`Invalid RFID timing format - ${reason}: ${line}`);
    this.name = 'InvalidRfidTimingFormatError';
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

const fromRfidTimingLine = (line: string, sourceTimezone: string, eventDateHint: Date): ChipCrossingData | null => {
  const rfidTimingMatches: RegExpMatchArray | null = line.match(outreachRfidTimingFormatPattern);
  if (!rfidTimingMatches) {
    return null;
  }
  if (rfidTimingMatches.groups?.time === undefined) {
    throw new InvalidRfidTimingFormatError('No time value', line);
  }
  const timeString: string = rfidTimingMatches.groups?.time;

  const timeValue: Date = parseUnknownDateTimeString(timeString, sourceTimezone, eventDateHint);
  if (timeValue === null) {
    throw new InvalidRfidTimingFormatError('Unrecognised time value', line);
  }

  const g = rfidTimingMatches.groups;

  const data: RFIDTimingChipCrossingData = {
    antenna: safeIntOption(g.antenna, g.antenna2),
    chipCode: chipOrHexChip(g.chipCode, g.hexChipCode),
    time: timeValue
  };
  return data;
};
