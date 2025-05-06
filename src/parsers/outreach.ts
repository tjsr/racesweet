import type { ChipCrossingData } from "../model/chipcrossing.js";
import type { PathLike } from "node:fs";
import { fromRfidTimingLine } from "./rfidtiming.js";
import { open } from 'node:fs/promises';
import { parseLineMatching } from "./genericLineMatcher.js";

const MAX_ERRORS = 20;

const simpleTransponderTimeEvent: RegExp = /^(?<chipCode>\d+)[\s,;]+"?(?<dateTime>[\w\s\-:.]+)"?$/;

export const parseSimpleOutreachChipLine = (
  line: string,
  sourceTimezone?: string | undefined
): ChipCrossingData =>
  parseLineMatching(line, simpleTransponderTimeEvent, sourceTimezone);


export const parseOutreachLine = (line: string): ChipCrossingData => {
  try {
    const parsed: ChipCrossingData | null = fromRfidTimingLine(line, 'UTC', new Date()) || parseSimpleOutreachChipLine(line);
    if (parsed) {
      return parsed;
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

const parseOutreachFile = async  (filePath: PathLike): Promise<ChipCrossingData[]> => {
  return open(filePath).then(async (file) => {
    const parsedData: ChipCrossingData[] = [];
    const lineErrors: unknown[] = [];
    
    for await (const line of file.readLines()) {
      try {
        if (!line || line.trim() == '') {
          console.warn('Skipping empty line');
          continue;
        }
        const parsedLine: ChipCrossingData = parseOutreachLine(line);
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
