import { CategoryNotFoundError, type EventCategoryId } from "../model/eventcategory.ts";
import type {
  ApicalLapByCategory,
} from "../model/apical.ts";
import type { EventId } from "../model/types.ts";
import { GenericTestSession } from "./genericTestSession.ts";
import type { PathLike } from "fs";
import type { RaceState } from "../model/racestate.ts";
import type { TestSession } from "./testsession.ts";
import type { TimeRecord } from "../model/timerecord.ts";
import { convertDataToEntrantsMap } from "../parsers/apical.ts";
import { createEventCategoryIdFromCategoryCode } from "../controllers/category.ts";
import { createGreenFlagEvent } from "../controllers/flag.ts";
import fs from 'fs/promises';
import { getTestFilePath } from "../testing/testDataFiles.ts";
import { parseFile } from "../parsers/rfidtiming.ts";
import { randomUUID } from "crypto";
import { v5 as uuidv5 } from "uuid";

const TEST_CROSSINGS_DATA_FILE = 'rfid-2025-06-06.txt';

export class ApicalTestRace extends GenericTestSession implements TestSession {
  private _data: Partial<RaceState> | undefined;
  private _eventId!: EventId;

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
    const filePath = getTestFilePath(TEST_CROSSINGS_DATA_FILE);
    return parseFile(filePath, new Date('2025-06-06T19:00:00+10:00'))
      .then((records: TimeRecord[]) => super.addRecords(records));
    
    return Promise.resolve();
    // throw new Error("Method not implemented.");
  }
  public async read(): Promise<Partial<RaceState>> {
    const filePath: PathLike = 'src/testdata/2025-06-06-data.json';
    const data = fs.readFile(filePath, 'utf8').then(d => JSON.parse(d) as ApicalLapByCategory);
    this._eventId = uuidv5('1', randomUUID());
    return data.then((d) => {
      return convertDataToEntrantsMap(this._eventId, new Date(), d, 200000);
    });
  }
}
