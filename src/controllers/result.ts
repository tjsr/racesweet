import { EntrantPassingRecord, ParticipantPassingRecord } from "../model/timerecord.js";

import { EventEntrantId } from "../model/entrant.js";
import { elapsedTimeSort } from "./timerecord.js";

export interface EntrantResult {
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

const isValidLapPassing = (record: ParticipantPassingRecord): boolean => {
  return record.isLapCompletion !== false && !(record.lapNo === undefined || record.lapNo === null || record.lapNo < 1);
};

export const getLapsOnly = (sortedRecords: EntrantPassingRecord[]): ParticipantPassingRecord[] => {
  const laps: ParticipantPassingRecord[] = [];

  sortedRecords.forEach((record) => {
    if (!isValidLapPassing(record)) {
      return; // Skip records without a valid lap number
    }
    laps.push(record);
  });

  return laps;
};

const getIncludedLapsOnly = (
  entrantPassings: EntrantPassingRecord[]
): EntrantPassingRecord[] => entrantPassings
  .filter((record) => record.isExcluded !== true)
  .filter(isValidLapPassing);

const getFastestLap = (passings: ParticipantPassingRecord[]): ParticipantPassingRecord | undefined => 
  passings.reduce((acc: ParticipantPassingRecord | undefined, record: ParticipantPassingRecord) => {
    if (acc === undefined || !acc.lapTime) {
      return record;
    }
    if (!record || !record.lapTime || !isValidLapPassing(record)) {
      return acc; // Skip invalid lap passings
    }
    if (record.lapTime < acc.lapTime) {
      return record;
    }
    return acc;
  }, undefined);

export const generateResult = (passings: Map<EventEntrantId, EntrantPassingRecord[]>, upToEventTime?: Date): EntrantResult[] => {
  const filteredPassings = new Map<EventEntrantId, EntrantPassingRecord[]>();
  const results: EntrantResult[] = [];

  passings.keys().forEach((entrantId) => {
    let entrantPassings = passings.get(entrantId) || [];
    entrantPassings = getIncludedLapsOnly(entrantPassings);

    if (upToEventTime) {
      entrantPassings = filterPassingsByTime(entrantPassings, upToEventTime);
    }
    entrantPassings.sort(elapsedTimeSort);
    filteredPassings.set(entrantId, entrantPassings);
    const result: Partial<EntrantResult> = {
      entrantId: entrantId,
      fastestLap: getFastestLap(entrantPassings),
      lapCount: entrantPassings.length,
      laps: entrantPassings,
      totalTime: entrantPassings.length > 0 ? (entrantPassings[entrantPassings.length - 1].elapsedTime || 0) : 0,
    };
    results.push(result as EntrantResult);
  });

  return results;
};

