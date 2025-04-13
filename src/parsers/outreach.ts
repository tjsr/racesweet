import type { ChipCrossingData } from "../model/chipcrossing.js";
import type { PathLike } from "node:fs";
import { fromRfidTimingLine } from "./rfidtiming.js";
import { open } from 'node:fs/promises';

export const parseOutreachLine = (line: string): ChipCrossingData => {
  try {
    const parsed: ChipCrossingData | null = fromRfidTimingLine(line, 'UTC', new Date());
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
  }

  throw new Error(`Failed to parse line: ${line}`);
};

const parseOutreachFile = async  (filePath: PathLike): Promise<ChipCrossingData[]> => {
  return open(filePath).then(async (file) => {
    const parsedData: ChipCrossingData[] = [];
    const lineErrors: unknown[] = [];
    
    for await (const line of file.readLines()) {
      try {
        const parsedLine: ChipCrossingData = parseOutreachLine(line);
        parsedData.push(parsedLine);
      } catch (error: unknown) {
        console.error(`Unknown error parsing line: ${line}`, error);
        lineErrors.push(error);
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
