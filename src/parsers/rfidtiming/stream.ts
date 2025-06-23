import { handleIteration, iterateRfidData } from "./fromIterator.ts";

import { ChipCrossingData } from "../../model/chipcrossing.ts";
import { MAX_ERRORS } from "./settings.ts";
import { RFIDTimingChipCrossingData } from "./model.ts";
import { ReadStream } from "fs";
// import { parseRfidLine } from "./rfidtiming.ts";
import { uuid } from "../../model/types.ts";

export async function* iterateRfidStream(
  iterator: AsyncIterable<string>,
  source: uuid): AsyncGenerator<RFIDTimingChipCrossingData> {
  let lineNumber = 0;
  const errors: Error[] = [];
  for await (const line of iterator) {
    const crossing =  handleIteration(line, ++lineNumber, source, errors);
    if (crossing) {
      yield crossing;
    }
  }
  return errors; // Indicate end of iteration
};

export const parseRfidDataStream = async (stream: ReadStream, source: uuid): Promise<ChipCrossingData[]> => {
  const lineErrors: unknown[] = [];
  
  // const streamIterator = stream.iterator();
  const streamIterator = stream.iterator();

  // Collect all lines from the async iterator into an array
  const lines: string[] = [];
  for await (const line of streamIterator) {
    lines.push(line);
  }

  const rfidDataIterator = iterateRfidData(lines, lineErrors, source);
  
  const unparsedData: RFIDTimingChipCrossingData[] = [];
  for (const parsedLine of rfidDataIterator) {
    if (parsedLine) {
      unparsedData.push(parsedLine);
    }
  }

  if (lineErrors.length > MAX_ERRORS) {
    throw new Error(`Errors occurred while parsing RFID data: ${lineErrors.length}`);
  }

  return unparsedData;
};
