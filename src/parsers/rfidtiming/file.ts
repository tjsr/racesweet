import type { ChipCrossingData, TimeRecord } from "../../model";
import type { PathLike, ReadStream } from "fs";

import { closeStream } from "../../utils/stream.ts";
import { getFileStream } from '../../utils/file.ts';
import { parseRfidDataStream } from "./stream.ts";
import { parseUnparsedChipCrossings } from "../genericTimeParser.ts";
import { v5 as uuidv5 } from 'uuid';

export const parseFile = async (filePath: PathLike, fileEventDate: Date): Promise<TimeRecord[]> => {
  if (!fileEventDate) {
    throw new Error('File event date is required');
  }

  return parseRfidFile(filePath)
    .then((unparsedData: ChipCrossingData[]) => parseUnparsedChipCrossings(fileEventDate, unparsedData));
};

export const parseRfidFile = async (filePath: PathLike): Promise<ChipCrossingData[]> => {
  const filePathString = filePath.toString();
  
  const source = uuidv5(filePathString, uuidv5.URL);
  return getFileStream(filePath)
    .then(async (stream: ReadStream) => parseRfidDataStream(stream, source)
      .then((parsedData: ChipCrossingData[]) => closeStream(stream)
        .then(() => {
          console.log(parseRfidFile.name, `Finished parsing and closed RFID data file.  ${parsedData.length} unparsed crossings returned.`);
          return parsedData;
        })
      )
    );
};
