import { GenericTestSession } from "./genericTestSession.ts";
import type { RaceState } from "../model/racestate.ts";
import type { TestSession } from "./testsession.ts";
import type { TimeRecord } from "../model/timerecord.ts";
import { createGreenFlagEvent } from "../controllers/flag.ts";
import { getTestFilePath } from "../testing/testDataFiles.ts";
import { parseFile } from "../parsers/rfidtiming.ts";

const TEST_CROSSINGS_DATA_FILE = 'rfid-2025-06-06.txt';
const CATEGORIES_TEST_FILE = 'categories.json';

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
  loadCategories(): Promise<void> {
    const categoriesFile = getTestFilePath(CATEGORIES_TEST_FILE);
    return this.loadCategoriesFromFile(categoriesFile);

    this.addCategories()
    return Promise.resolve();
    throw new Error("Method not implemented.");
  }
  loadParticipants(): Promise<void> {
    return Promise.resolve();
    throw new Error("Method not implemented.");
  }
  loadFlags(): Promise<void> {
    this.addRecords([
      new createGreenFlagEvent({
        time: new Date('2025-06-06T19:01:37+10:00'),
        categoryIds: [

        ]
      }),
    ])
    return Promise.resolve();
    throw new Error("Method not implemented.");
  }

  public async loadCrossings(): Promise<void> {
    const filePath = getTestFilePath(TEST_CROSSINGS_DATA_FILE);
    return parseFile(filePath, new Date('2025-06-06T19:00:00+10:00'))
      .then((records: TimeRecord[]) => super.addRecords(records));
  }
}
