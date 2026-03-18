import type { Session } from "../model/racestate.js";

export interface TestSession extends Session {
  loadTestData(noBulkProcess: boolean): Promise<void>;
  loadCrossings(): Promise<void>;
  loadCategories(): Promise<void>;
  loadParticipants(): Promise<void>;
  loadFlags(): Promise<void>;
}
