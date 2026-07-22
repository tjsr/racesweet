import { TimeRecord } from "../model/timerecord.js";
import { TransponderCrossingData } from "../model/transponder.js";
import { getIdentifier as getGenericIdentifier } from "./tx.js";

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
