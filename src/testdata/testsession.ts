import type { Session } from "../model/racestate.js";

export interface TestSessionLoadProgress {
  completed: number;
  currentTask: string;
  total: number;
}

export type TestSessionLoadProgressCallback = (progress: TestSessionLoadProgress) => Promise<void>;
export type TestSessionItemLoadedCallback = (currentTask: string) => Promise<void>;

export interface TestSession extends Session {
  loadTestData(noBulkProcess: boolean, onProgress?: TestSessionLoadProgressCallback): Promise<void>;
  loadCrossings(onItemLoaded?: TestSessionItemLoadedCallback): Promise<void>;
  loadCategories(onItemLoaded?: TestSessionItemLoadedCallback): Promise<void>;
  loadParticipants(onItemLoaded?: TestSessionItemLoadedCallback): Promise<void>;
  loadFlags(onItemLoaded?: TestSessionItemLoadedCallback): Promise<void>;
}
