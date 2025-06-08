import { GenericTestSession } from "./genericTestSession.js";
import type { GreenFlagRecord } from "../model/flag.ts";
import type { PathLike } from "fs";
import type { RaceState } from "../model/racestate.ts";
import type { TestSession } from "./testsession.ts";
import { createGreenFlagEvent } from "../controllers/flag.ts";
import { getTestFilePath } from "../testing/testDataFiles.ts";
import { loadCategoriesFromJsonFile } from "../controllers/category.ts";
import { parseFile as parseOutreachCrossingsFile } from "../parsers/outreach.ts";
import { readParticipantsXlsx } from "../controllers/participant.ts";

const CATEGORIES_TEST_FILE = '2025-02-07-categories.json';
const TEST_CROSSINGS_DATA_FILE = '192.168.1.119 2025-02-07.txt';
const ENTRIES_DATA_FILE = '2025-02-07-entries.xlsx';
const TEST_EVENT_START_TIME = new Date('2025-02-07T19:02:43.867+10:00');
const TEST_EVENT_DATE = new Date('2025-02-07T00:00:00Z');

export class OutreachTeamsRaceTestSession extends GenericTestSession implements TestSession, GenericTestSession {
  public static async create(): Promise<OutreachTeamsRaceTestSession> {
    return Promise.resolve(new OutreachTeamsRaceTestSession({} as RaceState));
  };

  public async loadCategories(): Promise<void> {
    const categoriesFile = getTestFilePath(CATEGORIES_TEST_FILE);
    return this.loadCategoriesFromFile(categoriesFile);
  }

  public async loadParticipants(): Promise<void> {
    const entriesFile = getTestFilePath(ENTRIES_DATA_FILE);
    return readParticipantsXlsx(
      entriesFile,
      { Category: 'Grade', RacePlate: 'RaceNo' }, // , Tx: 'ChipCode' },
      this.categories)
      .then(this.addParticipants);
  }

  public async loadFlags(): Promise<void> {
    return this.createGreenFlagTestRecords();
  }

  public async loadCrossings(): Promise<void> {
    const filePath = getTestFilePath(TEST_CROSSINGS_DATA_FILE);
    return parseOutreachCrossingsFile(filePath, TEST_EVENT_DATE)
      .then(this.addRecords);
  }

  public createGreenFlagTestRecords(): Promise<void> {
    // This method is intentionally left empty for the test session.
    // const flags = createGreenFlagTestRecords();

    const greenFlag: GreenFlagRecord = createGreenFlagEvent({
      time: TEST_EVENT_START_TIME,
    });
    this.addRecords([greenFlag]);

    return Promise.resolve();
  }

  public async loadCategoriesFromFile(filePath: PathLike): Promise<void> {
    const loadedCategories = await loadCategoriesFromJsonFile(filePath);
    this.addCategories(loadedCategories);
    return Promise.resolve();
  }
}
