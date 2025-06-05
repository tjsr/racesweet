import type { GreenFlagRecord } from "../model/flag.ts";
import type { PathLike } from "fs";
import type { RaceState } from "../model/racestate.ts";
import { Session } from "../model/racestate.ts";
import type { TestSession } from "./testsession.ts";
import { createGreenFlagEvent } from "../controllers/flag.ts";
import { loadCategoriesFromJsonFile } from "../controllers/category.ts";
import { parseFile as parseOutreachCrossingsFile } from "../parsers/outreach.ts";
import path from "path";
import { readParticipantsXlsx } from "../controllers/participant.ts";

const DATAFILE_DIR = path.resolve(path.join('.', 'src', 'testdata'));
const CATEGORIES_TEST_FILE = path.join(DATAFILE_DIR, '2025-02-07-categories.json');
const TEST_CROSSINGS_DATA_FILE = '192.168.1.119 2025-02-07.txt';
const ENTRIES_DATA_FILE = path.join(DATAFILE_DIR, '2025-02-07-entries.xlsx');
const TEST_EVENT_START_TIME = new Date('2025-02-07T19:02:43.867+10:00');
const TEST_EVENT_DATE = new Date('2025-02-07T00:00:00Z');

export class OutreachFileTestSession extends Session implements TestSession {
//   __loadingFiles: Promise<void>[] = [];

  //   readonly async get waitFor(): Promise<void> {
  //     return new Promise((resolve) => {
  //       while (true) {
  //         Promise.any(this.__loadingFiles)
  //           .then(() => {
  //             // Resolve the promise when at least one file has finished loading
  //           });
  //         Promise.any(this.__loadingFiles).then(() => {

  //         });
  //         // Wait for all promises to resolve
  //       }
  //     });
  //   }
  // };
  
  public static async create(): Promise<OutreachFileTestSession> {
    return Promise.resolve(new OutreachFileTestSession({} as RaceState));
  
  };
  
  public constructor(raceState?: RaceState) {
    super(raceState || {
      categories: [],
      participants: [],
      records: [],
      teams: [],
    });
  };

  public async loadTestData(): Promise<void> {
    return this.beginBulkProcess()
      .then(() => this.loadCategoriesFromFile(CATEGORIES_TEST_FILE))
      .then(() =>
        readParticipantsXlsx(
          ENTRIES_DATA_FILE,
          { Category: 'Grade', RacePlate: 'RaceNo', Tx: 'Transponder' },
          this.categories))
      .then((participants) => {
        this.addParticipants(participants);
        return;
      })
      .then(() => this.createGreenFlagTestRecords())
      .then(() => {
        let filePath = path.join(DATAFILE_DIR, TEST_CROSSINGS_DATA_FILE);
        if (filePath.startsWith('\\')) {
          filePath = filePath.replace(/^\\/, '');
        }
        return parseOutreachCrossingsFile(filePath, TEST_EVENT_DATE);
      }).then((records) => {
        return this.addRecords(records);
      }).then(() => 
        this.endBulkProcess()
      ).catch((error: unknown) => {
        console.log('Error loading test data:', error);
      });
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
