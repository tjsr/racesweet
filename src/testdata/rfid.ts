import { iterateRfidData, nonEmptyLinesFilter } from "../parsers/rfidtiming/fromIterator.ts";

import { ChipCrossingData } from "../model/chipcrossing.ts";
import { GenericTestSession } from "./genericTestSession.ts";
import LocalFileResourceProvider from "../controllers/resource/local.ts";
import type { PathLike } from "fs";
import type { RaceState } from "../model/racestate.ts";
import type { TestSession } from "./testsession.ts";
import { createGreenFlagEvent } from "../controllers/flag.ts";
import { getTestFilePath } from "../testing/testDataFiles.ts";
import { loadCategoriesFromJsonFile } from '../controllers/import.ts';
import { parseUnparsedChipCrossings } from "../parsers/genericTimeParser.ts";
import { v5 as uuidv5 } from 'uuid';

const TEST_CROSSINGS_DATA_FILE = 'rfid-2025-06-06.txt';
const CATEGORIES_TEST_FILE = '2025-06-06-categories.json';

export class RfidIndividualTestRace extends GenericTestSession implements TestSession {
  private _crossingResourceProvider: LocalFileResourceProvider<string[]>;
  constructor(raceState?: RaceState) {
    super(raceState);
    this._crossingResourceProvider = new LocalFileResourceProvider<string[]>('src/testdata');
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
    const source = uuidv5(TEST_CROSSINGS_DATA_FILE, uuidv5.URL);
    const errors: unknown[] = [];
    const fileEventDate = new Date('2025-06-06T19:00:00+10:00');
    return this._crossingResourceProvider.getResource(TEST_CROSSINGS_DATA_FILE)
      .then((crossingLines: string[]) => {
        const lines = crossingLines.filter(nonEmptyLinesFilter);
        const crossingsIter = lines[Symbol.iterator]();
        const crossings: ChipCrossingData[] = [];
        const iCrossings = iterateRfidData(crossingsIter, errors, source);

        for (const parsedLine of iCrossings) {
          if (parsedLine) {
            crossings.push(parsedLine);
          }
        }
        const records = parseUnparsedChipCrossings(fileEventDate, crossings);
        return super.addRecords(records);
      });
  }
}
