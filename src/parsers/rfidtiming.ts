import type { ChipCrossingData } from "../model/chipcrossing.ts";
import { safeIntOption } from "../utils.ts";

const outreachRfidTimingFormatPattern: RegExp = /(?<antenna>\d+),(?<chipCode>\d+),(?<hexChipCode>[0-f]+),"?(?<timeString>[\d\-/\s:.]+)"?(,(?<reader>\d+),(?<antenna2>\d+))?/;

class InvalidRfidTimingFormatError extends Error {
  constructor(reason: string, line: string) {
    super(`Invalid RFID timing format - ${reason}: ${line}`);
    this.name = 'InvalidRfidTimingFormatError';
  }
}

class _DateTimeParseError extends Error {
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

export const fromRfidTimingLine = (line: string): Partial<RFIDTimingChipCrossingData> | null => {
  const rfidTimingMatches: RegExpMatchArray | null = matchRfidLine(line);
  if (!rfidTimingMatches) {
    return null;
  }
  const g = rfidTimingMatches.groups;
  if (g?.timeString === undefined) {
    throw new InvalidRfidTimingFormatError('No time value', line);
  }

  const data: Partial<RFIDTimingChipCrossingData> = {
    antenna: safeIntOption(g.antenna, g.antenna2),
    chipCode: chipOrHexChip(g.chipCode, g.hexChipCode),
    timeString: g.timeString,
  };
  return data;
};
