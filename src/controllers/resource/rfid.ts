import { iterateRfidData, nonEmptyLinesFilter } from "../../parsers/rfidtiming/fromIterator.ts";

import { ChipCrossingData } from "../../model/chipcrossing.ts";
import { MAX_ERRORS } from "../../parsers/rfidtiming/settings.ts";
import { ResourceProvider } from "./provider.ts";
import { TimeRecord } from "../../model/timerecord.ts";
import { getRfidSourceUuid } from "../../parsers/rfidtiming/rfidtiming.ts";
import { parseUnparsedChipCrossings } from "../../parsers/genericTimeParser.ts";
import type { uuidv5 } from "../../model/types.ts";

export class RfidResourceProvider implements ResourceProvider<TimeRecord[]> {
  _baseProvider: ResourceProvider<Buffer>;

  constructor(baseProvider: ResourceProvider<Buffer>) {
    this._baseProvider = baseProvider;
  }

  public getRecordsFromRfidData(
    data: Buffer,
    eventDate: Date,
    errors: unknown[],
    source?: uuidv5
  ): Promise<TimeRecord[]> {
    return this.getRecordsFromRfidData(data, eventDate, errors, source);
  }

  public static getCrossingLinesFromData(
    data: Buffer
  ): string[] {
    const fileContent = data.toString('utf-8');
    const crossingLines = fileContent.split('\n')
      .map((line) => line.trim()
        .replace(/[\r\n]+/g, '')) // Normalize line endings
      .filter(nonEmptyLinesFilter);
    return crossingLines;
  }
  
  public static async getRecordsFromRfidData(
    data: Buffer,
    fileEventDate: Date,
    errors: unknown[],
    source: uuidv5
  ): Promise<TimeRecord[]> {
    const crossingLines = this.getCrossingLinesFromData(data);
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

  public static getRecords(rp: ResourceProvider<Buffer>, filename: string, fileEventDate: Date): Promise<TimeRecord[]> {
    const source = getRfidSourceUuid(filename);
    const errors: unknown[] = [];
    return rp.getResource(filename)
      .then((data: Buffer) => this.getRecordsFromRfidData(data, fileEventDate, errors, source));
  }

  public async getResource(resourceName: string, eventDate: Date): Promise<TimeRecord[]> {
    return this._baseProvider.getResource(resourceName).then(async (buffer) => {
      const errors: unknown[] = [];
      return this.getRecordsFromRfidData(buffer, eventDate, errors).then((records: TimeRecord[]) => {
        if (errors.length > MAX_ERRORS) {
          console.warn(`Errors encountered while parsing RFID data for ${resourceName}:`, errors);
        }
        return records;
      });
    });
  }
}
