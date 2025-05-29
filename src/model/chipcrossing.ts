import type { ParsedTimeRecord, ParticipantPassingRecord, TimeRecord, UnparsedTimeStringEvent } from "./timerecord.ts";

export interface ChipCrossingData extends TimeRecord, ParticipantPassingRecord {
  chipCode: number;
}

export const isUnparsedChipCrossing = (crossing: ChipCrossingData): (ChipCrossingData & UnparsedTimeStringEvent)|undefined => {
  if (crossing.chipCode && crossing.time === undefined) {
    return crossing as (ChipCrossingData & UnparsedTimeStringEvent);
  };
  // console.log(crossing);
  return undefined;
};

export const isParsedChipCrossing = (crossing: ChipCrossingData): crossing is ChipCrossingData & ParsedTimeRecord => {
  return crossing.time !== undefined;
  // if (crossing.time !== undefined) {
  //   return crossing as ChipCrossingData & ParsedTimeRecord;
  // };
  // return undefined;
};
