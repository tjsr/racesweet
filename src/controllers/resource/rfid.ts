import { iterateRfidData, nonEmptyLinesFilter } from "../../parsers/rfidtiming/fromIterator";

import { ChipCrossingData } from "../../model/chipcrossing";
import { MAX_ERRORS } from "../../parsers/rfidtiming/settings";
import { ResourceProvider } from "./provider";
import { TimeRecord } from "../../model/timerecord";
import { getRfidSourceUuid } from "../../parsers/rfidtiming/rfidtiming";
import { parseUnparsedChipCrossings } from "../../parsers/genericTimeParser";
import type { uuidv5 } from "../../model/types";

export class RfidResourceProvider implements ResourceProvider<TimeRecord[]> {
  _baseProvider: ResourceProvider<Buffer>;

  constructor(baseProvider: ResourceProvider<Buffer>) {
    this._baseProvider = baseProvider;
  }

  public getRecordsFromRfidData(
    data: Buffer,
    eventDate: Date,
    errors: unknown[],
    source: uuidv5
  ): Promise<TimeRecord[]> {
    return RfidResourceProvider.convertRecordsFromRfidData(data, eventDate, errors, source);
  }

  public static getCrossingLinesFromString(
    data: string
  ): string[] {
    const crossingLines = data.split('\n')
      .map((line) => line.trim()
        .replace(/[\r\n]+/g, '')) // Normalize line endings
      .filter(nonEmptyLinesFilter);
    return crossingLines;
  }

  public static getCrossingLinesFromBuffer(
    data: Buffer
  ): string[] {
    const fileContent = new TextDecoder('utf-8').decode(data);
    return RfidResourceProvider.getCrossingLinesFromString(fileContent);
  }
  
  public static async convertRecordsFromRfidData(
    data: Buffer,
    fileEventDate: Date,
    errors: unknown[],
    source: uuidv5
  ): Promise<TimeRecord[]> {
    const crossingLines = this.getCrossingLinesFromBuffer(data);
    const lines = crossingLines.filter(nonEmptyLinesFilter);
    const crossingsIter = lines[Symbol.iterator]();
    const crossings: ChipCrossingData[] = [];
    const iCrossings = iterateRfidData(crossingsIter, errors, source);

    for (const parsedLine of iCrossings) {
      if (parsedLine) {
        crossings.push(parsedLine);
      }
    }
    const records = parseUnparsedChipCrossings(fileEventDate, crossings);
    return records;
  };

  public static async getRecords(
    rp: ResourceProvider<Buffer>,
    filename: string,
    fileEventDate: Date
  ): Promise<TimeRecord[]> {
    const source = getRfidSourceUuid(filename);
    const errors: unknown[] = [];
    return rp.getResource(filename)
      .then((data: Buffer) => this.convertRecordsFromRfidData(data, fileEventDate, errors, source));
  }

  public async getResource(resourceName: string, eventDate: Date): Promise<TimeRecord[]> {
    return this._baseProvider.getResource(resourceName).then(async (buffer) => {
      const sourceUuid = getRfidSourceUuid(resourceName);
      const errors: unknown[] = [];
      return this.getRecordsFromRfidData(buffer, eventDate, errors, sourceUuid).then((records: TimeRecord[]) => {
        if (errors.length > MAX_ERRORS) {
          console.warn(`Errors encountered while parsing RFID data for ${resourceName}:`, errors);
        }
        return records;
      });
    });
  }
}
