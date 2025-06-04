import type { ParsedTimeRecord, UnparsedTimeStringEvent } from "../model/timerecord.ts";

import type { PlateCrossingData } from "../model/platecrossing.ts";

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
