import { createIdHash, safeIntOption } from "../../utils.ts";

import { InvalidRfidTimingFormatError } from "./errors.ts";
import { RFIDTimingChipCrossingData } from "./model.ts";
import type { UnparsedTimeStringEvent } from "../../model/timerecord.ts";
import type { uuid } from "../../model/types.ts";

const outreachRfidTimingFormatPattern: RegExp = /(?<antenna>\d+),(?<chipCode>\d+),(?<hexChipCode>[0-f]+),"?(?<timeString>[\d\-/\s:.]+)"?(,(?<reader>\d+),(?<antenna2>\d+))?/;

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

export const fromRfidTimingLine = (line: string, source?: uuid): (Partial<RFIDTimingChipCrossingData> & UnparsedTimeStringEvent) | null => {
  const rfidTimingMatches: RegExpMatchArray | null = matchRfidLine(line);
  if (!rfidTimingMatches) {
    return null;
  }
  const g = rfidTimingMatches.groups;
  if (g?.timeString === undefined) {
    throw new InvalidRfidTimingFormatError('No time value', line);
  }

  const data: Partial<RFIDTimingChipCrossingData> & UnparsedTimeStringEvent = {
    antenna: safeIntOption(g.antenna, g.antenna2),
    chipCode: chipOrHexChip(g.chipCode, g.hexChipCode),
    source: source,
    timeString: g.timeString,
  };
  return data;
};

export const parseRfidLine = (line: string, source: uuid): RFIDTimingChipCrossingData => {
  const rfidCrossing = fromRfidTimingLine(line, source) as Omit<RFIDTimingChipCrossingData, 'source' | 'id'>;
  const crossingId = createIdHash(source, rfidCrossing);
  const parsedLine: RFIDTimingChipCrossingData = {
    ...rfidCrossing,
    antenna: rfidCrossing.antenna || undefined,
    chipCode: rfidCrossing.chipCode!,
    dataLine: line,
    id: crossingId,
    source: source,
    timeString: rfidCrossing.timeString!,
  };
  if (!rfidCrossing) {
    throw new InvalidRfidTimingFormatError('Line could not be parsed as RFID data', line);
  }
  if (rfidCrossing.chipCode === undefined) {
    throw new InvalidRfidTimingFormatError('No chip code found in line', line);
  }
  if (rfidCrossing.timeString === undefined) {
    throw new InvalidRfidTimingFormatError('No time string found in line', line);
  }
  return parsedLine;
};
