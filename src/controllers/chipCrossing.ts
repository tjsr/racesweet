import type { ParsedTimeRecord, UnparsedTimeStringEvent } from "../model/timerecord.ts";

import type { ChipCrossingData } from "../model/chipcrossing.ts";

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

