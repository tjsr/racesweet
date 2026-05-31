import { TimeRecord } from "../model/timerecord.js";
import { TransmitterCrossingData } from "../model/transmitter.js";
import { getIdentifier as getGenericIdentifier } from "./tx.js";

export const getTransmitterIdentifier = (
  crossing: TransmitterCrossingData
): number => getGenericIdentifier(crossing, 'txNumber');

export const getIdentifier = getTransmitterIdentifier;

export const isTransmitterCrossing = (record: TimeRecord): record is TransmitterCrossingData => {
  return Object.prototype.hasOwnProperty.call(record, 'txNumber');
};
