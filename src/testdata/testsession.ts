import type { Session } from "../model/racestate.ts";

export interface TestSession extends Session {
  loadTestData(): Promise<void>;
  loadCrossings(): Promise<void>;
  loadCategories(): Promise<void>;
  loadParticipants(): Promise<void>;
  loadFlags(): Promise<void>;
}
