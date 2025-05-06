import type { TimeEvent, TimeEventSource } from "../model/chipcrossing.js";

import type { TimeEventSourceId } from "../model/types.js";

export type AppState = {
  crossings: TimeEvent[];
  timeEventSources: Map<TimeEventSourceId, TimeEventSource>;
};

const globalState: AppState = {
  crossings: [],
  timeEventSources: new Map(),
};

export const getGlobalState = (): AppState => {
  return globalState;
};
