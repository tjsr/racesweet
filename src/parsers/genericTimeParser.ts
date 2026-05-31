import type { ChipCrossingData } from "../model/chipcrossing.js";
import type { TimeRecord } from "../model/timerecord.js";
import { asUnparsedChipCrossing } from "../controllers/chipCrossing.js";
import { formatRFC3339 } from "date-fns";
import { timeOrTimeToday } from "./date/dateutils.js";

export const parseUnparsedChipCrossings = (
  eventDate: Date,
  unparsedCrossings: ChipCrossingData[]
): TimeRecord[] => {
  if (!unparsedCrossings) {
    throw new Error("No unparsed crossings provided");
  }
  return unparsedCrossings.map((crossing: ChipCrossingData, index: number) => {
    let unparsed;
    try {
      unparsed = asUnparsedChipCrossing(crossing);
    } catch (error: unknown) {
      console.error(`Failed parsing crossing from ${crossing.dataLine}:`, error);
      if ((error as Error)?.message) {
        throw new Error('Failed parsing crossing data: ' + (error as Error).message);
      }
    }
    if (unparsed) {
      if (!crossing.timeString) {
        throw new Error(`Crossing ${crossing.chipCode} has no timeString`);
      }
      try {
        const parsedTime = timeOrTimeToday(eventDate, crossing.timeString!);
        const _checkFormattable = formatRFC3339(parsedTime, { fractionDigits: 3 });
        const _t = parsedTime.getTime();
        return {
          ...crossing,
          time: parsedTime,
        } as TimeRecord;
      } catch (error) {
        console.error(`Failed parsing timeString ${index}="${crossing.timeString}" for crossing ${crossing.dataLine}:`, error);
        throw error;
        // return crossing;
      }
    } else {
      return crossing;
    }
  });
};

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
