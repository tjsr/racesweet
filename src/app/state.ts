import type { TimeRecord, TimeRecordSource } from "../model/timerecord.ts";

import type { TimeRecordSourceId } from "../model/types.ts";

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
