import { EntrantPassingRecord, ParticipantPassingRecord, isPassingExcluded } from "../model/timerecord.js";

import { EventEntrantId } from "../model/entrant.js";
import { isCountedLapPassing } from "./laps.js";
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
    return record.time <= upToTime && !isPassingExcluded(record);
  });

const isValidLapPassing = (
  record: ParticipantPassingRecord,
  finishLineNumbers: number[] | undefined
): boolean => {
  return isCountedLapPassing(record, finishLineNumbers);
};

export const getLapsOnly = (
  sortedRecords: EntrantPassingRecord[],
  finishLineNumbers: number[] | undefined = undefined
): ParticipantPassingRecord[] => {
  const laps: ParticipantPassingRecord[] = [];

  sortedRecords.forEach((record) => {
    if (!isValidLapPassing(record, finishLineNumbers)) {
      return; // Skip records without a valid lap number
    }
    laps.push(record);
  });

  return laps;
};

const getIncludedLapsOnly = (
  entrantPassings: EntrantPassingRecord[],
  finishLineNumbers: number[] | undefined
): EntrantPassingRecord[] => entrantPassings
  .filter((record) => !isPassingExcluded(record))
  .filter((record) => isValidLapPassing(record, finishLineNumbers));

const getFastestLap = (
  passings: ParticipantPassingRecord[],
  finishLineNumbers: number[] | undefined
): ParticipantPassingRecord | undefined => 
  passings.reduce((acc: ParticipantPassingRecord | undefined, record: ParticipantPassingRecord) => {
    if (acc === undefined || !acc.lapTime) {
      return record;
    }
    if (!record || !record.lapTime || !isValidLapPassing(record, finishLineNumbers)) {
      return acc; // Skip invalid lap passings
    }
    if (record.lapTime < acc.lapTime) {
      return record;
    }
    return acc;
  }, undefined);

export const generateResult = (
  passings: Map<EventEntrantId, EntrantPassingRecord[]>,
  upToEventTime?: Date,
  finishLineNumbers: number[] | undefined = undefined
): EntrantResult[] => {
  const filteredPassings = new Map<EventEntrantId, EntrantPassingRecord[]>();
  const results: EntrantResult[] = [];

  passings.keys().forEach((entrantId) => {
    let entrantPassings = passings.get(entrantId) || [];
    entrantPassings = getIncludedLapsOnly(entrantPassings, finishLineNumbers);

    if (upToEventTime) {
      entrantPassings = filterPassingsByTime(entrantPassings, upToEventTime);
    }
    entrantPassings.sort(elapsedTimeSort);
    filteredPassings.set(entrantId, entrantPassings);
    const result: Partial<EntrantResult> = {
      entrantId: entrantId,
      fastestLap: getFastestLap(entrantPassings, finishLineNumbers),
      lapCount: entrantPassings.length,
      laps: entrantPassings,
      totalTime: entrantPassings.length > 0 ? (entrantPassings[entrantPassings.length - 1].elapsedTime || 0) : 0,
    };
    results.push(result as EntrantResult);
  });

  return results;
};

