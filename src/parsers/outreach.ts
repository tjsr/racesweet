import type { ChipCrossingData } from "../model/chipcrossing.ts";
import type { PathLike } from "node:fs";
import { TZDate } from "@date-fns/tz";
import { fromRfidTimingLine } from "./rfidtiming.js";
import { open } from 'node:fs/promises';
import { parseLineMatching } from "./genericLineMatcher.js";
import { v5 as uuidv5 } from 'uuid';

const MAX_ERRORS = 20;
type uuid = string;
type uuid5 = uuid;

const simpleTransponderTimeEvent: RegExp = /^(?<chipCode>\d+)[\s,;]+"?(?<dateTime>[\w\s\-:.]+)"?$/;

export type OutreachChipCrossingData = ChipCrossingData & {
  id: unknown;
  antenna?: string | undefined;
  hexChipCode?: string | undefined;
  lineNumber?: number | undefined;
};

export type UnsourcedOutreachChipCrossingData = Omit<OutreachChipCrossingData, 'source' | 'id'>;

export const parseSimpleOutreachChipLine = (
  line: string,
  dateHint: TZDate
): UnsourcedOutreachChipCrossingData => {
  console.trace(parseSimpleOutreachChipLine, line, dateHint);
  const crossingLine  = parseLineMatching(line, simpleTransponderTimeEvent, dateHint);
  return {
    ...crossingLine,
    chipCode: crossingLine.chipCode!,
    time: crossingLine.time!,
  };
};

export const parseOutreachLine = (line: string, dateHint: TZDate): UnsourcedOutreachChipCrossingData => {
  try {
    const parsed: Partial<ChipCrossingData> | null = fromRfidTimingLine(line, dateHint) || parseSimpleOutreachChipLine(line, dateHint);
    if (parsed) {
      return {
        ...parsed,
      } as OutreachChipCrossingData;
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error parsing line: ${line}`);
      console.error(error.message);
    } else {
      console.error(`Unknown error parsing line: ${line}`);
    }
    throw error;
  }

  throw new Error(`Failed to parse line: ${line}`);
};

const createIdHash = (source: uuid, crossing: UnsourcedOutreachChipCrossingData): uuid5 => {
  return uuidv5(JSON.stringify({ ...crossing, source: source }), source);
};

const parseOutreachFile = async  (filePath: PathLike): Promise<ChipCrossingData[]> => {
  return open(filePath).then(async (file) => {
    const parsedData: OutreachChipCrossingData[] = [];
    const lineErrors: unknown[] = [];
    const filePathString = filePath.toString();
    
    let lineNumber = 0;
    for await (const line of file.readLines()) {
      lineNumber++;
      try {
        if (!line || line.trim() == '') {
          console.warn('Skipping empty line');
          continue;
        }
        const dateHint = new TZDate();
        const outreachCrossing = parseOutreachLine(line, dateHint);
        const source = uuidv5(filePathString, uuidv5.URL);
        const crossingId = createIdHash(source, outreachCrossing);
        const parsedLine: OutreachChipCrossingData = {
          ...outreachCrossing,
          antenna: outreachCrossing.antenna || undefined,
          chipCode: outreachCrossing.chipCode!,
          hexChipCode: outreachCrossing.hexChipCode || undefined,
          id: crossingId,
          lineNumber: lineNumber,
          source: filePathString,
          time: outreachCrossing.time!,
        };
        parsedData.push(parsedLine);
      } catch (error: unknown) {
        console.error(`Unknown error parsing line: ${line}`, error);
        lineErrors.push(error);
        if (lineErrors.length > MAX_ERRORS) {
          break;
        }
      }

      console.log(line);
    }
    return file.close().then(() => {
      console.log('File closed');
      return parsedData;
    });
  });
};

export const parseFile = async (filePath: PathLike): Promise<ChipCrossingData[]> => {
  return parseOutreachFile(filePath);
};
