import { TimeRecord } from "../model/timerecord.ts";
import { TransmitterCrossingData } from "../model/transmitter.ts";
import { getIdentifier as getGenericIdentifier } from "./tx.ts";

export const getTransmitterIdentifier = (
  crossing: TransmitterCrossingData
): number => getGenericIdentifier(crossing, 'txNumber');

export const getIdentifier = getTransmitterIdentifier;

export const isTransmitterCrossing = (record: TimeRecord): record is TransmitterCrossingData => {
  return Object.prototype.hasOwnProperty.call(record, 'txNumber');
};
