import type { ParsedTimeRecord, TimeRecord, UnparsedTimeStringEvent } from "../model/timerecord.js";

import type { PlateCrossingData } from "../model/platecrossing.js";

export const asUnparsedPlateCrossing = (crossing: PlateCrossingData): (PlateCrossingData & UnparsedTimeStringEvent) | undefined => {
  if (crossing.plateNumber && crossing.time === undefined) {
    return crossing as (PlateCrossingData & UnparsedTimeStringEvent);
  };
  return undefined;
};

export const isParsedPlateCrossing = (crossing: PlateCrossingData): crossing is PlateCrossingData & ParsedTimeRecord => {
  return crossing.plateNumber !== undefined && crossing.time !== undefined;
};

export const asParsedChipCrossing = (
  crossing: PlateCrossingData
): (PlateCrossingData & ParsedTimeRecord) | undefined => isParsedPlateCrossing(crossing) ? crossing : undefined;

export const isPlateCrossing = (crossing: TimeRecord): crossing is PlateCrossingData => {
  return Object.prototype.hasOwnProperty.call(crossing, 'plateNumber') && (crossing as PlateCrossingData).plateNumber !== undefined;
};
