import type { TimeRecordSource } from "../model/timerecord.js";
import type { TimeRecordSourceId } from "../model/types.js";

export const addTimeRecordSource = (TimeRecordSources: Map<TimeRecordSourceId, TimeRecordSource>, source: TimeRecordSource): void => {
  if (!source) {
    throw new Error("Time event source is undefined");
  }
  if (!source.id) {
    throw new Error("Time event source ID is undefined");
  }
  if (!source.name) {
    throw new Error("Time event source name is undefined");
  }
  
  TimeRecordSources.set(source.id, source);
};
