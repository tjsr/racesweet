import type { ParsedTimeEvent, TimeEvent, UnparsedTimeStringEvent } from "./timeevent.ts";

export interface ChipCrossingData extends TimeEvent {
  chipCode: number;
}

export const isUnparsedChipCrossing = (crossing: ChipCrossingData): (ChipCrossingData & UnparsedTimeStringEvent)|undefined => {
  if (crossing.chipCode && crossing.time === undefined) {
    return crossing as (ChipCrossingData & UnparsedTimeStringEvent);
  };
  // console.log(crossing);
  return undefined;
};

export const isParsedChipCrossing = (crossing: ChipCrossingData): crossing is ChipCrossingData & ParsedTimeEvent => {
  return crossing.time !== undefined;
  // if (crossing.time !== undefined) {
  //   return crossing as ChipCrossingData & ParsedTimeEvent;
  // };
  // return undefined;
};
