import type { TimeRecord, TimeRecordSource } from "../model/timerecord.js";

import type { TimeRecordSourceId } from "../model/types.js";

export type AppState = {
  crossings: TimeRecord[];
  timeRecordSources: Map<TimeRecordSourceId, TimeRecordSource>;
};

const globalState: AppState = {
  crossings: [],
  timeRecordSources: new Map(),
};

export const getGlobalState = (): AppState => {
  return globalState;
};
