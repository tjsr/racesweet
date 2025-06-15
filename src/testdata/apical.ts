import { CategoryNotFoundError, type EventCategoryId } from "../model/eventcategory.ts";
import type {
  ApicalLapByCategory,
} from "../model/apical.ts";
import type { EventId } from "../model/types.ts";
import { GenericTestSession } from "./genericTestSession.ts";
import type { RaceState } from "../model/racestate.ts";
import { ResourceProvider } from "../controllers/resource/provider.ts";
import type { TestSession } from "./testsession.ts";
// import type { TimeRecord } from "../model/timerecord.ts";
import { convertDataToEntrantsMap } from "../parsers/apical.ts";
import { createEventCategoryIdFromCategoryCode } from "../controllers/category.ts";
import { createGreenFlagEvent } from "../controllers/flag.ts";
// import { parseFile } from "../parsers/rfidtiming/file.ts";
// import LocalFileResourceProvider from "../controllers/resource/local.ts";

const TEST_CROSSINGS_DATA_FILE = 'rfid-2025-06-06.txt';

export abstract class ApicalTestRace extends GenericTestSession implements TestSession {
  private _data: Partial<RaceState> | undefined;
  private _eventId!: EventId;
  private _resourceProvider: ResourceProvider<ApicalLapByCategory>;

  public get eventId(): EventId {
    return this._eventId;
  }
  public set eventId(value: EventId) {
    this._eventId = value;
  }

  constructor(resourceProvider: ResourceProvider<ApicalLapByCategory>) {
    super();
    this._resourceProvider = resourceProvider;
  }

  protected getResource(name: string): Promise<ApicalLapByCategory> {
    return this._resourceProvider.getResource(name);
  }

  private categoryCodes(codes: string[]): EventCategoryId[] {
    return codes.map((c) => {
      const id = createEventCategoryIdFromCategoryCode(this._eventId, c);
      if (!this.categoryExists(id)) {
        throw new CategoryNotFoundError(
          `Category with code ${c} not found in event ${this._eventId}.`);
      }
      return id;
    });
  }

  public async loadCategories(): Promise<void> {
    return this.read().then((data: Partial<RaceState>) => {
      this._data = data;
      if (this._data.categories) {
        this.addCategories(this._data.categories);
      }
      return Promise.resolve();
    });
    // throw new Error("Method not implemented.");
  }

  public loadParticipants(): Promise<void> {
    if (this._data?.participants) {
      this.addParticipants(this._data.participants);
    }
    return Promise.resolve();
    // throw new Error("Method not implemented.");
  }

  public loadFlags(): Promise<void> {
    this.addRecords([
      createGreenFlagEvent({
        categoryIds: this.categoryCodes(['A']),
        time: new Date('2025-06-06T19:02:06+10:00'),
      }),
      createGreenFlagEvent({
        categoryIds: this.categoryCodes(['B', 'WA', 'EBIKE']),
        time: new Date('2025-06-06T19:02:23+10:00'),
      }),
      createGreenFlagEvent({
        categoryIds: this.categoryCodes(['C', 'WB']),
        time: new Date('2025-06-06T19:02:39+10:00'),
      }),
      createGreenFlagEvent({
        categoryIds: this.categoryCodes(['D']),
        time: new Date('2025-06-06T19:03:03.14+10:00'),
      }),
    ]);
    return Promise.resolve();
    // throw new Error("Method not implemented.");
  }

  public async loadCrossings(): Promise<void> {
    if (!this._data?.records) {
      throw new Error("No records found in data.");
    }
    return super.addRecords(this._data?.records);
    //   if (record.categoryId) {
    //     if (!this.categoryExists(record.categoryId)) {
    // // const filePath = getTestFilePath(TEST_CROSSINGS_DATA_FILE);
    // const filePath = this.getResourcePath(TEST_CROSSINGS_DATA_FILE);
    // const response = await fetch(filePath).then((response) => {
    //   if (!response.ok || !response.body) {
    //     throw new Error(`Failed to fetch file: ${filePath}`);
    //   }
    //   const stream = response.body;
    //   stream.getReader().read().then((result) => {
    //     if (result.done) {
    //       throw new Error(`No data read from file: ${filePath}`);
    //     }
    //     const decoder = new TextDecoder();
    //     const text = decoder.decode(result.value);
    //     const lines = text.split(/\r?\n/).filter(line => line.length > 0);
    //     function* lineIterator(lines: string[]): IterableIterator<string> {
    //       for (const line of lines) {
    //         yield line;
    //       }
    //     }

    //     const linesIter = lineIterator(lines);
    //     const iVal = linesIter.next(); // Skip the first line if it's a header
    //     const val = iVal.value;
    //     // Now you can process each line individually, e.g.:
    //     for (const line of lines) {
    //       // parse each line here
    //     }
    //   });

    // });

    // return parseFile(filePath, new Date('2025-06-06T19:00:00+10:00'))
    //   .then((records: TimeRecord[]) => super.addRecords(records));
    
    // return Promise.resolve();
    // // throw new Error("Method not implemented.");
  }

  protected convert(eventId: EventId, data: ApicalLapByCategory): Partial<RaceState> {
    return convertDataToEntrantsMap(this.eventId, new Date(), data, 200000);
  }

  protected async read(): Promise<Partial<RaceState>> {
    return this.getResource(TEST_CROSSINGS_DATA_FILE).then((data: ApicalLapByCategory) => {
      return this.convert(this.eventId, data);
    });
  }
}
