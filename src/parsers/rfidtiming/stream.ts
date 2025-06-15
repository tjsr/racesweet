import { ChipCrossingData } from "../../model/chipcrossing.ts";
import { RFIDTimingChipCrossingData } from "./model.ts";
import { ReadStream } from "fs";
import { iterateRfidData } from "./fromIterator.ts";
import { uuid } from "../../model/types.ts";

export const parseRfidDataStream = async (stream: ReadStream, source: uuid): Promise<ChipCrossingData[]> => {
  const lineErrors: unknown[] = [];
  
  const streamIterator = stream.iterator();

  const rfidDataIterator = iterateRfidData(streamIterator, lineErrors, source);
  
  const unparsedData: RFIDTimingChipCrossingData[] = [];
  for await (const parsedLine of rfidDataIterator) {
    if (parsedLine) {
      unparsedData.push(parsedLine);
    }
  }
  return unparsedData;
};
