import type { TimeRecord, UnparsedTimeStringEvent } from "../model/timerecord.ts";
import { createIdHash, safeIntOption } from "../utils.ts";

import type { ChipCrossingData } from "../model/chipcrossing.ts";
import type { PathLike } from "node:fs";
import { open } from 'node:fs/promises';
import { parseUnparsedChipCrossings } from "./genericTimeParser.ts";
import type { uuid } from "../model/types.ts";
import { v5 as uuidv5 } from 'uuid';

const outreachRfidTimingFormatPattern: RegExp = /(?<antenna>\d+),(?<chipCode>\d+),(?<hexChipCode>[0-f]+),"?(?<timeString>[\d\-/\s:.]+)"?(,(?<reader>\d+),(?<antenna2>\d+))?/;
const MAX_ERRORS = 20;

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

const parseRfidFile = async  (filePath: PathLike): Promise<ChipCrossingData[]> => {
  return open(filePath).then(async (file) => {
    const unparsedData: RFIDTimingChipCrossingData[] = [];
    const lineErrors: unknown[] = [];
    const filePathString = filePath.toString();
    
    let lineNumber = 0;
    for await (const line of file.readLines()) {
      lineNumber++;
      try {
        if (!line || line.trim() == '') {
          console.warn('Skipping empty line');
          continue;
        } else if (line.startsWith('#')) {
          continue;
        }
        const source = uuidv5(filePathString, uuidv5.URL);
        const rfidCrossing = fromRfidTimingLine(line, source) as Omit<RFIDTimingChipCrossingData, 'source' | 'id'>;
        const crossingId = createIdHash(source, rfidCrossing);
        const parsedLine: RFIDTimingChipCrossingData = {
          ...rfidCrossing,
          antenna: rfidCrossing.antenna || undefined,
          chipCode: rfidCrossing.chipCode!,
          dataLine: line,
          id: crossingId,
          source: filePathString,
          timeString: rfidCrossing.timeString!,
        };
        unparsedData.push(parsedLine);
      } catch (error: unknown) {
        console.error(`Unknown error parsing line ${lineNumber}:`, line, error);
        lineErrors.push(error);
        if (lineErrors.length > MAX_ERRORS) {
          console.error(`Too many errors (${MAX_ERRORS}) while parsing file. Stopping.`);
          break;
        }
      }
    }
    return file.close().then(() => {
      console.log(parseRfidFile.name, `Finished parsing and closed RFID data file.  ${unparsedData.length} unparsed crossings returned.`);
      return unparsedData;
    });
  });
};

export const parseFile = async (filePath: PathLike, fileEventDate: Date): Promise<TimeRecord[]> => {
  if (!fileEventDate) {
    throw new Error('File event date is required');
  }
  
  return parseRfidFile(filePath)
    .then((unparsedData: ChipCrossingData[]) => parseUnparsedChipCrossings(fileEventDate, unparsedData));
};
