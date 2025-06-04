import { assertValidTimeRecord, moveForwardIfUndefined } from "./crossingList.ts";

import type { ChipCrossingData } from "../model/chipcrossing.ts";
import type { PlateCrossingData } from "../model/platecrossing.ts";
import type { StartRecord } from "../model/flag.ts";
import type { TimeRecord } from "../model/timerecord.ts";

const formatTime = (time: Date | undefined): string => {
  if (!time) {
    return '--:--:--.---';
  }
  try {
    return time.toISOString();
  } catch (error: unknown) {
    console.error('Invalid time:', error);
    return '??:??:??.???';
  }
};

export const getTimeRecordIdentifier = (record: TimeRecord, excludeTime: boolean = false): string => {
  const timeString = formatTime(record.time);
  let id = `&${record.id}`;
  if (Object.prototype.hasOwnProperty.call(record, 'chipCode')) {
    const crossing = record as ChipCrossingData;
    id = `Tx${crossing.chipCode}`;
  } else if (Object.prototype.hasOwnProperty.call(record, 'plateNumber')) {
    const crossing = record as PlateCrossingData;
    id = `#${crossing.plateNumber}`;
  }

  if  (excludeTime) {
    return id;
  }
  return `${id}@${timeString}`;
};

export const compareByTime = (
  a: TimeRecord,
  b: TimeRecord
): number => compareTimes(a.time, b.time);

export const compareTimes = (a: Date | undefined, b: Date | undefined): number => {
  if (a === undefined && b === undefined) {
    return 0;
  }
  if (a === undefined) {
    return 1;
  }
  if (b === undefined) {
    return -1;
  }
  return a.getTime() - b.getTime();
};

export const filterToEventsBetween = (data: TimeRecord[], start: Date, end: Date): TimeRecord[] => {
  return data.filter((crossing) => {
    if (crossing.time === undefined) {
      return false;
    }
    const crossingTime = crossing.time.getTime();
    return crossingTime >= start.getTime() && crossingTime <= end.getTime();
  });
};
// const calculateCategoryElapsedTime

export const isRecordAfterStart = (
  lap: TimeRecord,
  eventOrCategoryStartEvent: StartRecord
): boolean => {
  if (!lap || lap.time === undefined) {
    return false;
  }
  if (!eventOrCategoryStartEvent || eventOrCategoryStartEvent.time === undefined) {
    return false;
  }
  if (lap.time.getTime() < eventOrCategoryStartEvent.time.getTime()) {
    return false;
  }
  return true;
};

export const isNotRecordType = (event: TimeRecord, recordType: number): boolean => (event.recordType & recordType) === 0;

export const addTimeRecord = (crossings: TimeRecord[], record: TimeRecord): void => {
  assertValidTimeRecord(record);

  let psn = crossings.push(record) - 1;
  moveForwardIfUndefined(crossings, psn);
  while (psn > 0) {
    const c1 = crossings[psn - 1];
    if (c1?.time === undefined) {
      break;
    }
    const c2 = crossings[psn];
    if (c2?.time === undefined) {
      break;
    }

    if (c2.time.getTime() < c1.time.getTime()) {
      const temp = crossings[psn];
      crossings[psn] = crossings[psn - 1];
      crossings[psn - 1] = temp;
      psn--;
    } else {
      break;
    }
  }
};

export const hasTime = (event: TimeRecord): boolean => {
  if (event?.time === undefined) {
    return false;
  }
  try {
    event.time.getTime();
  } catch (_error: unknown) {
    return false;
  }
  return true;
};

export const noTimeRecordFilter = (event: TimeRecord): boolean => !hasTime(event);

export const noTimeArrayRecordFilter = (event: TimeRecord, _idx: number, _arr: TimeRecord[]): boolean => {
  return !event || !hasTime(event);
};

