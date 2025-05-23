import type { TimeEvent } from "../model/timeevent.ts";
import type { TimeEventSource } from "../model/timeevent.ts";
import type { TimeEventSourceId } from "../model/types.ts";

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
