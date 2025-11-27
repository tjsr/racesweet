import { ParticipantPassingRecord } from "../model/timerecord.ts";
import { elapsedTimeSort } from "./timerecord.ts";

export const generateLapChart = (passing: ParticipantPassingRecord[]): ParticipantPassingRecord[][] => {
  const laps: ParticipantPassingRecord[][] = [];
  const sortedRecords = passing.sort(elapsedTimeSort);
  sortedRecords.forEach((record) => {
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
