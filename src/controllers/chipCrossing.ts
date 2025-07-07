import type { ParsedTimeRecord, TimeRecord, UnparsedTimeStringEvent } from "../model/timerecord.ts";

import type { ChipCrossingData } from "../model/chipcrossing.ts";
import { getIdentifier as getGenericIdentifier } from "./tx.ts";

export const asUnparsedChipCrossing = (crossing: ChipCrossingData): (ChipCrossingData & UnparsedTimeStringEvent) | undefined => {
  if (crossing.chipCode && crossing.time === undefined) {
    return crossing as (ChipCrossingData & UnparsedTimeStringEvent);
  };
  // console.log(crossing);
  return undefined;
};

export const isParsedChipCrossing = (crossing: ChipCrossingData): crossing is ChipCrossingData & ParsedTimeRecord => {
  return crossing.chipCode !== undefined && crossing.time !== undefined;
  // if (crossing.time !== undefined) {
  //   return crossing as ChipCrossingData & ParsedTimeRecord;
  // };
  // return undefined;
};

export const asParsedChipCrossing = (
  crossing: ChipCrossingData
): (ChipCrossingData & ParsedTimeRecord) | undefined => isParsedChipCrossing(crossing) ? crossing : undefined;


export const getChipIdentifier = (
  crossing: ChipCrossingData
): number => getGenericIdentifier(crossing, 'chipCode');

export const getIdentifier = getChipIdentifier;

export const isChipCrossing = (record: TimeRecord): record is ChipCrossingData => {
  return Object.prototype.hasOwnProperty.call(record, 'chipCode');
};
