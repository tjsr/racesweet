import type { TimeRecord, TimeRecordSource } from "../model/timerecord.ts";

import type { EventId, TimeRecordSourceId } from "../model/types.ts";
import type { RaceEvent } from "../model/raceevent.ts";
import type { RaceState } from "../model/racestate.ts";

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
