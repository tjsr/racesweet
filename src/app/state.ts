import type { EventId, RaceEvent } from "../model/raceevent.ts";
import type { TimeRecord, TimeRecordSource } from "../model/timerecord.js";

import type { RaceState } from "../model/racestate.ts";
import type { TimeRecordSourceId } from "../model/types.js";

export type AppState = {
  crossings: TimeRecord[];
  timeRecordSources: Map<TimeRecordSourceId, TimeRecordSource>;
  events: RaceEvent[];
  eventData: Map<EventId, Partial<RaceState>>;
};

const globalState: AppState = {
  crossings: [],
  eventData: new Map(),
  events: [],
  timeRecordSources: new Map(),
};

export const getGlobalState = (): AppState => {
  return globalState;
};
