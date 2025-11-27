import { EntrantPassingRecord, ParticipantPassingRecord } from "../model/timerecord.ts";

import { EventEntrantId } from "../model/entrant.ts";
import { elapsedTimeSort } from "./timerecord.ts";

interface EntrantResult {
  entrantId: EventEntrantId;
  lapCount: number;
  totalTime: number; // Total time in milliseconds
  fastestLap: ParticipantPassingRecord; // Fastest lap time in milliseconds
  laps: ParticipantPassingRecord[]; // All laps data for the entrant
}

export const filterPassingsByTime = (passings: EntrantPassingRecord[], upToTime: Date): EntrantPassingRecord[] => 
  passings.filter((record) => {
    if (record.time === undefined) {
      return false; // Skip records without a time
    }
    return record.time <= upToTime && record.isExcluded !== true;
  });

export const generateResult = (passings: Map<EventEntrantId, EntrantPassingRecord[]>, upToEventTime?: Date): EntrantResult[] => {
  const laps: ParticipantPassingRecord[][] = [];
  const filteredPassings = new Map<EventEntrantId, EntrantPassingRecord[]>();
  // const entrantPassings: Map<EntrantId, EntrantResult[] = [];

  passings.keys().forEach((entrantId) => {
    let entrantPassings = passings.get(entrantId) || [];
    entrantPassings = entrantPassings.filter((record) => record.isExcluded !== true);
    if (upToEventTime) {
      entrantPassings = filterPassingsByTime(entrantPassings, upToEventTime);
    }
    entrantPassings.sort(elapsedTimeSort);
    filteredPassings.set(entrantId, entrantPassings);
  });

  sortedRecords.forEach((record) => {
    const entrantId = record.entrantId;


    if (record.lapNo === undefined || record.lapNo === null || record.lapNo < 1) {
      return; // Skip records without a valid lap number
    }
    if (!laps[record.lapNo - 1]) {
      laps[record.lapNo - 1] = [];
    }
    laps[record.lapNo - 1].push(record);
  });

  return laps;
};
