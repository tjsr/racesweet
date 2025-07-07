import { TimeRecord } from "../model/timerecord.ts";
import { TransponderCrossingData } from "../model/transponder.ts";
import { getIdentifier as getGenericIdentifier } from "./tx.ts";

export const inferTransponderFromRaceNumber = (raceNumber: string, txRange: number): number => {
  const raceNoInt = parseInt(raceNumber, 10);
  if (isNaN(raceNoInt)) {
    throw new Error(`Race plate ${raceNumber} can not be automaitcally converted to transponder number.`);
  }
  return txRange + raceNoInt;
};

export const getTransponderIdentifier = (
  crossing: TransponderCrossingData
): number => getGenericIdentifier(crossing, 'transponderId');

export const getIdentifier = getTransponderIdentifier;

export const isTransponderCrossing = (record: TimeRecord): record is TransponderCrossingData => {
  return Object.prototype.hasOwnProperty.call(record, 'transponderId');
};
