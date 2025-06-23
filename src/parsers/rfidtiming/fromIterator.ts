import { MAX_ERRORS } from "./settings";
import { RFIDTimingChipCrossingData } from "./model";
import { parseRfidLine } from "./rfidtiming";
import { uuid } from "@model/types";

const isEmpty = (line: string): boolean => 
  !line || line.trim() === '';

const isEmptyLine = (line: string): boolean =>
  isEmpty(line) || line.trim().startsWith('#');

export const nonEmptyLinesFilter = (line: string): boolean => !isEmptyLine(line);

export const handleIteration = (
  line: string,
  lineNumber: number,
  source: uuid,
  errors: unknown[]
): RFIDTimingChipCrossingData | null => {
  if (isEmptyLine(line)) {
    return null;
  }
  try {
    const parsedLine: RFIDTimingChipCrossingData = parseRfidLine(line, source);
    return parsedLine;
  } catch (error: unknown) {
    console.error(`Error parsing line ${lineNumber}:`, line, error);
    errors.push(error);
    if (errors.length > MAX_ERRORS) {
      console.error(`Too many errors (${MAX_ERRORS}) while parsing file. Stopping.`);
      throw new Error(`Too many errors while parsing RFID data: ${errors.length}`);
    }
    return null; // Skip this line on error
  }
};

export function* iterateRfidData(
  iterator: Iterable<string>,
  errors: unknown[],
  source: uuid): Generator<RFIDTimingChipCrossingData | null> {
  let lineNumber = 0;
  for (const line of iterator) {
    const crossing =  handleIteration(line, ++lineNumber, source, errors);
    if (crossing) {
      yield crossing;
    }
  }
  return null; // Indicate end of iteration
};
