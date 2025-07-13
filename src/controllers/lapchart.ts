import { ParticipantPassingRecord } from "../model/timerecord";

const elapsedTimeSort = (a: ParticipantPassingRecord, b: ParticipantPassingRecord): number => {
  if (a.elapsedTime === undefined || a.elapsedTime === null) {
    return 1; // Treat undefined or null as greater than any valid elapsed time
  }
  if (b.elapsedTime === undefined || b.elapsedTime === null) {
    return -1; // Treat undefined or null as less than any valid elapsed time
  }
  return a.elapsedTime - b.elapsedTime;
};

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
