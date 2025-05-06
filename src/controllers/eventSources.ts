import type { TimeEventSource } from "../model/chipcrossing.js";
import type { TimeEventSourceId } from "../model/types.js";

export const addTimeEventSource = (timeEventSources: Map<TimeEventSourceId, TimeEventSource>, source: TimeEventSource): void => {
  if (!source) {
    throw new Error("Time event source is undefined");
  }
  if (!source.id) {
    throw new Error("Time event source ID is undefined");
  }
  if (!source.name) {
    throw new Error("Time event source name is undefined");
  }
  
  timeEventSources.set(source.id, source);
};
