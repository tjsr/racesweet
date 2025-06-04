import type { Session } from "../model/racestate.ts";

export interface TestSession extends Session {
  createGreenFlagTestRecords(): Promise<void>;
  loadTestData(): Promise<void>;
}
