import { GenericTestSession } from "./genericTestSession.js";
import type { PathLike } from "fs";
import type { RaceState } from "../model/racestate.js";
import { ResourceProvider } from "../processing/resource/provider.js";
import { RfidResourceProvider } from "../processing/resource/rfid.js";
import type { TestSession } from "./testsession.js";
import { createGreenFlagEvent } from "../processing/flag.js";
import { getTestFilePath } from "../testing/testDataFiles.js";
import { loadCategoriesFromJsonFile } from '../processing/import.ts';

const TEST_CROSSINGS_DATA_FILE = 'rfid-2025-06-06.txt';
const CATEGORIES_TEST_FILE = '2025-06-06-categories.json';

export class RfidIndividualTestRace extends GenericTestSession implements TestSession {
  private _resourceProvider: ResourceProvider<Buffer>;
  private _rfidProvider: RfidResourceProvider;
  
  constructor(resourceProvider: ResourceProvider<Buffer>, raceState?: RaceState) {
    super(raceState);
    this._resourceProvider = resourceProvider;
    this._rfidProvider = new RfidResourceProvider(resourceProvider);
  }
  
  createGreenFlagTestRecords(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  // loadTestData(): Promise<void> {
  //   throw new Error("Method not implemented.");
  // }

  public async loadCategoriesFromFile(filePath: PathLike): Promise<void> {
    const loadedCategories = await loadCategoriesFromJsonFile(filePath);
    this.addCategories(loadedCategories);
    return Promise.resolve();
  }

  loadCategories(): Promise<void> {
    const categoriesFile = getTestFilePath(CATEGORIES_TEST_FILE);
    return this.loadCategoriesFromFile(categoriesFile);
  }

  loadParticipants(): Promise<void> {
    return Promise.resolve();
    // throw new Error("Method not implemented.");
  }
  
  loadFlags(): Promise<void> {
    this.addRecords([
      createGreenFlagEvent({
        categoryIds: ['1'],
        time: new Date('2025-06-06T19:01:17+10:00'),
      }),
      createGreenFlagEvent({
        categoryIds: ['2', '21', '31'],
        time: new Date('2025-06-06T19:01:37+10:00'),
      }),
      createGreenFlagEvent({
        categoryIds: ['3', '22', '31'],
        time: new Date('2025-06-06T19:01:57+10:00'),
      }),
      createGreenFlagEvent({
        categoryIds: ['4'],
        time: new Date('2025-06-06T19:02:15+10:00'),
      }),
    ]);
    return Promise.resolve();
  }
  
  public async loadCrossings(): Promise<void> {
    return this._rfidProvider
      .getResource(TEST_CROSSINGS_DATA_FILE, new Date('2025-06-06T19:00:00+10:00'))
      .then((records) => {
        return super.addRecords(records);
      });
  }
}
