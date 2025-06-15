import { MAX_ERRORS } from "./settings";
import { RFIDTimingChipCrossingData } from "./model";
import { parseRfidLine } from "./rfidtiming";
import { uuid } from "@model/types";

export const nonEmptyLinesFilter = (line: string): boolean =>
  line !== undefined && line !== null && line.trim() !== '' && !line.trim().startsWith('#');

export  function* iterateRfidData(
  iterator: IterableIterator<string>,
  errors: unknown[],
  source: uuid): Generator<RFIDTimingChipCrossingData | null> {
  let lineNumber = 0;
  for (const line of iterator) {
    lineNumber++;
    if (!line || line.trim() === '') {
      console.warn('Skipping empty line');
      continue;
    }
    if (line.startsWith('#')) {
      continue;
    }
    try {
      const parsedLine: RFIDTimingChipCrossingData = parseRfidLine(line, source);
      yield parsedLine;
    } catch (error: unknown) {
      console.error(`Error parsing line ${lineNumber}:`, line, error);
      errors.push(error);
      if (errors.length > MAX_ERRORS) {
        console.error(`Too many errors (${MAX_ERRORS}) while parsing file. Stopping.`);
        throw new Error(`Too many errors while parsing RFID data: ${errors.length}`);
      }
      continue;
    }
  }
  return null; // Indicate end of iteration
}
