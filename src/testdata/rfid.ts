import { GenericTestSession } from "./genericTestSession.ts";
import type { PathLike } from "fs";
import type { RaceState } from "../model/racestate.ts";
import type { TestSession } from "./testsession.ts";
import type { TimeRecord } from "../model/timerecord.ts";
import { createGreenFlagEvent } from "../controllers/flag.ts";
import { getTestFilePath } from "../testing/testDataFiles.ts";
import { loadCategoriesFromJsonFile } from "../controllers/category.ts";
import { parseFile } from "../parsers/rfidtiming.ts";

const TEST_CROSSINGS_DATA_FILE = 'rfid-2025-06-06.txt';
const CATEGORIES_TEST_FILE = '2025-06-06-categories.json';

export class RfidIndividualTestRace extends GenericTestSession implements TestSession {
  constructor(raceState?: RaceState) {
    super(raceState);
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
    const filePath = getTestFilePath(TEST_CROSSINGS_DATA_FILE);
    return parseFile(filePath, new Date('2025-06-06T19:00:00+10:00'))
      .then((records: TimeRecord[]) => super.addRecords(records));
  }
}
