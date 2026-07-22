import { CategoryNotFoundError, type EventCategoryId } from "../model/eventcategory.js";
import { v1 as randomUUID, v5 as uuidv5, validate as validateUuid } from "uuid";
import type {
  ApicalLapByCategory,
} from "../model/apical.ts";
import { GenericTestSession } from "./genericTestSession.js";
import { MAX_ERRORS } from "../parsers/rfidtiming/settings.js";
import type { RaceState } from "../model/racestate.js";
import { ResourceProvider } from "../processing/resource/provider.js";
import { RfidResourceProvider } from "../processing/resource/rfid.js";
import type { TestSession } from "./testsession.js";
// import type { TimeRecord } from "../model/timerecord.ts";
import { TimeRecord } from "../model/timerecord.js";
import { convertDataToRaceState } from "../parsers/apical.js";
import { createEventCategoryIdFromCategoryCode } from "../processing/category.js";
import { createGreenFlagEvent } from "../processing/flag.js";
import { getRfidSourceUuid } from "../parsers/rfidtiming/rfidtiming";
import { EventId } from "../model/raceevent.ts";
// import { parseFile } from "../parsers/rfidtiming/file.ts";
// import LocalFileResourceProvider from "../processing/resource/local.ts";

const TEST_EVENT_DATE = new Date('2025-06-06T10:00:00+10:00');
const TEST_CROSSINGS_DATA_FILE = 'rfid-2025-06-06.txt';
const TEST_APICAL_DATA_FILE = '2025-06-06-data.json';
type JsonFilename = `${string}.json`;
type TextFilename = `${string}.txt`;
// const CATEGORIES_TEST_FILE: JsonFilename = '2025-06-06-categories.json';
export abstract class ApicalTestRace extends GenericTestSession implements TestSession {
  private _data: Partial<RaceState> | undefined;
  private _dataPromise: Promise<Partial<RaceState>> | undefined;
  private _eventId!: EventId;
  private _provider: ResourceProvider<Buffer>;
  private _rfidProvider: RfidResourceProvider;
  // private _apicalResourceProvider: ResourceProvider<ApicalLapByCategory>;

  public get eventId(): EventId {
    return this._eventId;
  }
  public set eventId(value: EventId) {
    if (!validateUuid(value)) {
      throw new Error(`Invalid UUID for eventId: ${value}`);
    }
    this._eventId = value;
  }

  constructor(baseProvider: ResourceProvider<Buffer>) {
    super();
    this._provider = baseProvider;
    this._rfidProvider = new RfidResourceProvider(baseProvider);
    // this._apicalResourceProvider = new ApicalResourceProvider(baseProvider);
  }

  protected getApicalJsonResource(name: JsonFilename): Promise<ApicalLapByCategory> {
    console.debug(`Retrieving Apical data for event ${this.eventId} from ${name}...`);

    return this._provider.getResource(name).then((data: Buffer) => {
      const td: TextDecoder = new TextDecoder('utf8');
      const dataString: string = td.decode(data);
      
      // data.toString('utf8');
      try {
        const jsonData = JSON.parse(dataString);
        return jsonData as ApicalLapByCategory;
      } catch (error) {
        console.error(`Failed while parsing JSON in file ${name}`, error);
        console.debug('Data begins with :', dataString.slice(0, 100));
        throw error;
      }
    });
  }

  protected getRfidResource(filename: TextFilename, eventDate: Date): Promise<TimeRecord[]> {
    return this._provider.getResource(filename)
      .then((data: Buffer) => {
        const source = getRfidSourceUuid(filename);
        const errors: unknown[] = [];
        return this._rfidProvider.getRecordsFromRfidData(data, eventDate, errors, source).then((records: TimeRecord[]) => {
          if (errors.length > MAX_ERRORS) {
            throw new Error(`Too many errors (${errors.length}) while parsing RFID data from ${filename}.`);
          }
          return records;
        });
      });
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
    return this.loadData().then((data: Partial<RaceState>) => {
      if (data.categories) {
        this.addCategories(data.categories);
      }
      return Promise.resolve();
    });
    // throw new Error("Method not implemented.");
  }

  public async loadParticipants(): Promise<void> {
    return this.loadData().then((_data: Partial<RaceState>) => {
      if (!this._data?.participants) {
        throw new Error('No participants in data.');
      }
      if (this._data?.participants) {
        this.addParticipants(this._data.participants);
      }
      return Promise.resolve();;
    });
  }

  public async loadFlags(): Promise<void> {
    return this.loadData().then((_data: Partial<RaceState>) => {
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
    });
    // throw new Error("Method not implemented.");
  }

  public async loadCrossings(): Promise<void> {
    return this.loadData().then((_data: Partial<RaceState>) => {
      if (!this._data?.records) {
        throw new Error("No records found in data.");
      }
      return super.addRecords(this._data?.records);
    });
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
    return convertDataToRaceState(this.eventId, new Date(), data, 200000);
  }

  private async loadApicalRaceState(): Promise<Partial<RaceState>> {
    return this.retrieveApicalDataAsRaceState().then ((raceState: Partial<RaceState>) => {
      this._data = raceState;
      return raceState;
    });
  }

  protected async retrieveApicalDataAsRaceState(): Promise<Partial<RaceState>> {
    return this.getApicalJsonResource(TEST_APICAL_DATA_FILE)
      .then((data: ApicalLapByCategory) => {
        return this.convert(this.eventId, data);
      });
  }

  /** This method must gaurantee this._data is populated when resolved. */
  private loadData(): Promise<Partial<RaceState>> {
    if (this._dataPromise) {
      return this._dataPromise;
    }

    this._dataPromise = this.getRfidResource(TEST_CROSSINGS_DATA_FILE, TEST_EVENT_DATE)
      .then((records: TimeRecord[]) => {
        this.addRecords(records, false);
      }).then(() => this.loadApicalRaceState());
    return this._dataPromise;
  }
}


export class ApicalFile extends ApicalTestRace {
  constructor(resourceProvider: ResourceProvider<Buffer>) {
    super(resourceProvider);
    super.eventId = uuidv5('1', randomUUID());
  }

  public async retrieveApicalDataAsRaceState(): Promise<Partial<RaceState>> {
    return super.getApicalJsonResource('2025-06-06-data.json')
      .then((apicalData) => super.convert(this.eventId, apicalData));
  }
}
