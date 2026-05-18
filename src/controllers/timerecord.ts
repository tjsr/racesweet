import type { ParticipantPassingRecord, TimeRecord, Validated } from "../model/timerecord.js";
import { assertValidTimeRecord, moveForwardIfUndefined } from "./crossingList.js";
import { getChipIdentifier, isChipCrossing } from './chipCrossing.ts';
import { getTransmitterIdentifier, isTransmitterCrossing } from './transmitter.ts';
import { getTransponderIdentifier, isTransponderCrossing } from './transponder.ts';
import { isFlagRecord, isStartRecord } from "./flag.js";

import { AutomaticTimingIdentifiactionCrossing } from "../model/timingdevice.js";
import type { ChipCrossingData } from "../model/chipcrossing.js";
import type { PlateCrossingData } from "../model/platecrossing.js";
import type { StartRecord } from "../model/flag.js";
import { TransmitterCrossingData } from "../model/transmitter.js";
import { TransponderCrossingData } from "../model/transponder.js";
import { isPlateCrossing } from "./plateCrossing.js";

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

export const getAutomaticIdentifier = (record: TimeRecord): number | undefined => {
  if (isChipCrossing(record)) {
    const crossing = record as ChipCrossingData;
    const chip = getChipIdentifier(crossing);
    return chip;
  } else if (isTransmitterCrossing(record)) {
    const crossing = record as TransmitterCrossingData;
    const tx = getTransmitterIdentifier(crossing);
    return tx;
  } else if (isTransponderCrossing(record)) {
    const crossing = record as TransponderCrossingData;
    const tx = getTransponderIdentifier(crossing);
    return tx;
  }
  return undefined;
};

export const getTimeRecordIdentifier = (record: TimeRecord, excludeTime: boolean = false): string => {
  const timeString = formatTime(record.time);
  let id = `&${record.id}`;
  if (isChipCrossing(record)) {
    const crossing = record as ChipCrossingData;
    const chip = getChipIdentifier(crossing);
    id = `Tx${chip}`;
  } else if (isTransmitterCrossing(record)) {
    const crossing = record as TransmitterCrossingData;
    const tx = getTransmitterIdentifier(crossing);
    id = `Tx${tx}`;
  } else if (isTransponderCrossing(record)) {
    const crossing = record as TransponderCrossingData;
    const tx = getTransponderIdentifier(crossing);
    id = `Tx${tx}`;
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

export const isDeviceCrossing = (crossing: TimeRecord): crossing is (ChipCrossingData|TransponderCrossingData|TransmitterCrossingData) =>
  isTransmitterCrossing(crossing) || isTransponderCrossing(crossing) || isChipCrossing(crossing);

export const isCrossingRecord = (crossing: TimeRecord): crossing is (AutomaticTimingIdentifiactionCrossing|PlateCrossingData) => {
  if (isFlagRecord(crossing)) {
    return false;
  }
  if (isStartRecord(crossing)) {
    return false;
  }
  return isDeviceCrossing(crossing) || isPlateCrossing(crossing);
};

export const isIdentifiedCrossing = (crossing: TimeRecord): crossing is ParticipantPassingRecord => {
  return isCrossingRecord(crossing) && !!crossing.participantId;
};

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

export const addError = <TR extends TimeRecord>(record: TR, error: string|Error): Validated<TR> => {
  const validated: Validated<TR> = record as Validated<TR>;
  if (!validated.validationErrors) {
    validated.validationErrors = [];
  }
  validated.isValid = false;
  validated.validationErrors.push(error);
  return validated;
};

export const elapsedTimeSort = (a: ParticipantPassingRecord, b: ParticipantPassingRecord): number => {
  if (a.elapsedTime === undefined || a.elapsedTime === null) {
    return 1; // Treat undefined or null as greater than any valid elapsed time
  }
  if (b.elapsedTime === undefined || b.elapsedTime === null) {
    return -1; // Treat undefined or null as less than any valid elapsed time
  }
  return a.elapsedTime - b.elapsedTime;
};
