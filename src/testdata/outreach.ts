import type { PathLike } from "fs";
import type { RaceState } from "../model/racestate.ts";
import { Session } from "../model/racestate.ts";
import type { TestSession } from "./testsession.ts";
import { createGreenFlagTestRecords } from "./greenFlagEvents.ts";
import { loadCategoriesFromJsonFile } from "../controllers/category.ts";
import { parseFile as parseOutreachCrossingsFile } from "../parsers/outreach.ts";
import path from "path";
import { readParticipantsXlsx } from "../controllers/participant.ts";

const DATAFILE_DIR = path.resolve(path.join('.', 'src', 'testdata'));
const CATEGORIES_TEST_FILE = path.join(DATAFILE_DIR, 'categories.json');
const TEST_CROSSINGS_DATA_FILE = '192.168.1.119 2025-03-03.txt';
const ENTRIES_DATA_FILE = path.join(DATAFILE_DIR, '2025-03-03-entries.xlsx');
const TEST_EVENT_DATE = new Date('2025-03-03T00:00:00Z');

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

  public loadTestData(): Promise<void> {
    return this.loadCategoriesFromFile(CATEGORIES_TEST_FILE)
      .then(() =>
        readParticipantsXlsx(
          ENTRIES_DATA_FILE,
          { Category: 'Grade', RacePlate: 'RaceNo', Tx: 'ChipNum' },
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
      });
  }

  public createGreenFlagTestRecords(): Promise<void> {
    // This method is intentionally left empty for the test session.
    const flags = createGreenFlagTestRecords();
    this.addRecords(flags);

    return Promise.resolve();
  }

  public async loadCategoriesFromFile(filePath: PathLike): Promise<void> {
    const loadedCategories = await loadCategoriesFromJsonFile(filePath);
    this.addCategories(loadedCategories);
    return Promise.resolve();
  }
}
