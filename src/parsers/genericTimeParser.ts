import type { ChipCrossingData } from "../model/chipcrossing.ts";
import type { TimeRecord } from "../model/timerecord.ts";
import { asUnparsedChipCrossing } from "../controllers/chipCrossing.ts";
import { formatRFC3339 } from "date-fns";
import { timeOrTimeToday } from "./date/dateutils.ts";

export const parseUnparsedChipCrossings = (
  eventDate: Date,
  unparsedCrossings: ChipCrossingData[]
): TimeRecord[] => unparsedCrossings.map((crossing: ChipCrossingData) => {
  if (asUnparsedChipCrossing(crossing)) {
    if (!crossing.timeString) {
      throw new Error(`Crossing ${crossing.chipCode} has no timeString`);
    }
    const parsedTime = timeOrTimeToday(eventDate, crossing.timeString!);
    try {
      const _checkFormattable = formatRFC3339(parsedTime, { fractionDigits: 3 });
      const _t = parsedTime.getTime();
      return {
        ...crossing,
        time: parsedTime,
      } as TimeRecord;
    } catch (_error) {
      return crossing;
    }
  } else {
    return crossing;
  }
});
