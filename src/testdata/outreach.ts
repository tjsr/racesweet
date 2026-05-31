import { ExcelResourceProvider } from "../controllers/resource/excel.js";
import { GenericTestSession } from "./genericTestSession.js";
import type { GreenFlagRecord } from "../model/flag.js";
import type { RaceState } from "../model/racestate.js";
import { ResourceProvider } from "../controllers/resource/provider.js";
import type { TestSession } from "./testsession.js";
import { WorkBook } from "xlsx";
import { createGreenFlagEvent } from "../controllers/flag.js";
import { getTestFilePath } from "../testing/testDataFiles.js";
import { parseFile as parseOutreachCrossingsFile } from "../parsers/outreach.js";
import { readParticipantsFromWorkbook } from "../controllers/participant.js";

const CATEGORIES_TEST_FILE = '2025-02-07-categories.json';
const TEST_CROSSINGS_DATA_FILE = '192.168.1.119 2025-02-07.txt';
const ENTRIES_DATA_FILE = '2025-02-07-entries.xlsx';
const TEST_EVENT_START_TIME = new Date('2025-02-07T19:02:43.867+10:00');
const TEST_EVENT_DATE = new Date('2025-02-07T00:00:00Z');

export class OutreachTeamsRaceTestSession
  extends GenericTestSession
  implements TestSession {
  private _resourceProvider: ResourceProvider<Buffer>;
  private _excelFileResourceProvider: ExcelResourceProvider | undefined;

  constructor(resourceProvider: ResourceProvider<Buffer>, state?: RaceState) {
    super(state);
    this._resourceProvider = resourceProvider;
    this._excelFileResourceProvider = new ExcelResourceProvider(resourceProvider);
  }
  
  public async loadCategories(): Promise<void> {
    return this._resourceProvider.getResource(CATEGORIES_TEST_FILE).then((data) => {
      const jsonData = JSON.parse(data.toString());
      this.addCategories(jsonData);
    });
  }

  public async loadParticipants(): Promise<void> {
    this._excelFileResourceProvider?.getWorkbook(ENTRIES_DATA_FILE)
      .then((workbook: WorkBook) => 
        readParticipantsFromWorkbook(workbook,
          { Category: 'Grade', RacePlate: 'RaceNo' }, // , Tx: 'ChipCode' },
          this.categories))
      .then((participants) => this.addParticipants(participants));
  }

  public async loadFlags(): Promise<void> {
    return this.createGreenFlagTestRecords();
  }

  public async loadCrossings(): Promise<void> {
    const filePath = getTestFilePath(TEST_CROSSINGS_DATA_FILE);
    return parseOutreachCrossingsFile(filePath, TEST_EVENT_DATE)
      .then((records) => this.addRecords(records, false));
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
}
