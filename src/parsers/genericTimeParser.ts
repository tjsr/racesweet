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

export const durationStringToMilliseconds = (duration: string): number => {
  const parts = duration.split(':');
  if (parts.length !== 3) {
    throw new Error(`Invalid duration format: ${duration}`);
  }

  try {
    const secondsParts = parts[2].split('.');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const ms = duration.match(/^\d+$/) ? parseInt(secondsParts[1].substring(0, 3)) : 0; // Take only the first three digits for milliseconds
    const seconds = parseInt(secondsParts[0]);
    
    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds) || isNaN(ms)) {
      throw new Error(`Invalid duration values: ${duration}`);
    }
    
    return ((hours * 3600 + minutes * 60 + seconds) * 1000) + ms; // Convert to milliseconds
  } catch (error) {
    console.error(`Error parsing duration string "${duration}": ${error instanceof Error ? error.message : String(error)}`, error);
    throw error;
  }
};
