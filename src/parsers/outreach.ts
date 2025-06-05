import type { ChipCrossingData } from "../model/chipcrossing.ts";
import type { PathLike } from "node:fs";
import type { TimeRecord } from "../model/timerecord.ts";
import { asUnparsedChipCrossing } from "../controllers/chipCrossing.ts";
import { createIdHash } from "../utils.ts";
import { formatRFC3339 } from "date-fns";
import { fromRfidTimingLine } from "./rfidtiming.js";
import { getSequenceNumber } from "../app/utils/sequence.ts";
import { open } from 'node:fs/promises';
import { parseLineMatching } from "./genericLineMatcher.js";
import { parseRfidTimingDate } from "./rfidTimingDate.ts";
import { v5 as uuidv5 } from 'uuid';

const MAX_ERRORS = 20;
export type uuid = string;
export type uuid5 = uuid;

const simpleTransponderTimeRecord: RegExp = /^(?<chipCode>\d+)[\s,;]+"?(?<dateTime>[\w\s\-:.]+)"?$/;

export type OutreachChipCrossingData = ChipCrossingData & {
  id: unknown;
  antenna?: string | number | undefined;
  hexChipCode?: string | undefined;
  lineNumber?: number | undefined;
};

export type UnsourcedOutreachChipCrossingData = Omit<OutreachChipCrossingData, 'source' | 'id'>;

export const parseSimpleOutreachChipLine = (
  line: string
): UnsourcedOutreachChipCrossingData => {
  // console.trace(parseSimpleOutreachChipLine, line);
  const crossingLine  = parseLineMatching(line, simpleTransponderTimeRecord);
  return {
    ...crossingLine,
    chipCode: crossingLine.chipCode!,
    recordType: 0,
    sequence: getSequenceNumber(),
    timeString: crossingLine.timeString!,
  };
};

export const parseOutreachLine = (line: string): UnsourcedOutreachChipCrossingData => {
  const parsed: Partial<ChipCrossingData> | null = fromRfidTimingLine(line) || parseSimpleOutreachChipLine(line);
  if (parsed) {
    return {
      ...parsed,
    } as UnsourcedOutreachChipCrossingData;
  }

  throw new Error(`Failed to parse line: ${line}`);
};

const parseOutreachFile = async  (filePath: PathLike): Promise<ChipCrossingData[]> => {
  return open(filePath).then(async (file) => {
    const unparsedData: OutreachChipCrossingData[] = [];
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
        const outreachCrossing = parseOutreachLine(line);
        const source = uuidv5(filePathString, uuidv5.URL);
        const crossingId = createIdHash(source, outreachCrossing);
        const parsedLine: OutreachChipCrossingData = {
          ...outreachCrossing,
          antenna: outreachCrossing.antenna || undefined,
          chipCode: outreachCrossing.chipCode!,
          dataLine: line,
          hexChipCode: outreachCrossing.hexChipCode || undefined,
          id: crossingId,
          lineNumber: lineNumber,
          source: filePathString,
          timeString: outreachCrossing.timeString!,
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
      console.log(parseOutreachFile.name, `Finished parsing and closed outreach data file.  ${unparsedData.length} unparsed crossings returned.`);
      return unparsedData;
    });
  });
};

const toYYYYMMDD = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const timeOrTimeToday = (today: Date, time: string): Date => {
  const datePrefix = /[\sT]/.test(time) ? '' : (toYYYYMMDD(today) + 'T');
  const toParse = datePrefix + time;

  const parsedDate = parseRfidTimingDate(toParse);
  try {
    const _timeString = formatRFC3339(parsedDate, { fractionDigits: 3 });
  } catch (_error) {
    console.trace(`Error formatting time ${time}`);
  }

  return parsedDate;
};

export const parseFile = async (filePath: PathLike, fileEventDate: Date): Promise<TimeRecord[]> => {
  if (!fileEventDate) {
    throw new Error('File event date is required');
  }
  
  // const eventTimezone = getUserTimezone();
  return parseOutreachFile(filePath).then((unparsedData: ChipCrossingData[]) => {
    return unparsedData.map((crossing: ChipCrossingData) => {
      if (asUnparsedChipCrossing(crossing)) {
        if (!crossing.timeString) {
          throw new Error(`Crossing ${crossing.chipCode} has no timeString`);
        }
        const parsedTime = timeOrTimeToday(fileEventDate, crossing.timeString!);
        try {
          const _checkFormattable = formatRFC3339(parsedTime, { fractionDigits: 3 });
          const _t = parsedTime.getTime();
          return {
            ...crossing,
            time: parsedTime,
          } as TimeRecord;
        } catch (_error) {
          return crossing;
        }
      } else {
        return crossing;
      }
    });
  });
};
