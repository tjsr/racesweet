import type { ChipCrossingData } from "../model/chipcrossing.js";
import type { TimeRecord } from "../model/timerecord.js";
import { asUnparsedChipCrossing } from "../processing/chipCrossing.js";
import { formatRFC3339 } from "date-fns";
import { timeOrTimeToday } from "./date/dateutils.js";
import { TimeParseError } from "./date/errors.js";

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
  if (!duration || typeof duration !== 'string') {
    throw new TimeParseError('Invalid duration', duration);
  }
  const parts = duration.split(':');
  if (parts.length !== 3) {
    throw new TimeParseError('Invalid duration format', duration);
  }

  try {
    const secondsParts = parts[2].split('.');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const ms = secondsParts[1] ? parseInt(secondsParts[1].substring(0, 3).padEnd(3, '0'), 10) : 0; // Take only the first three digits for milliseconds
    const seconds = parseInt(secondsParts[0]);
    
    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds) || isNaN(ms)) {
      throw new TimeParseError('Invalid duration values', duration);
    }
    
    return ((hours * 3600 + minutes * 60 + seconds) * 1000) + ms; // Convert to milliseconds
  } catch (error) {
    console.error(`Error parsing duration string "${duration}": ${error instanceof Error ? error.message : String(error)}`, error);
    throw error;
  }
};

export const excelTimeToMilliseconds = (excelTime: number): number => {
  if (typeof excelTime !== 'number' || !Number.isFinite(excelTime)) {
    throw new TimeParseError('Invalid Excel time', String(excelTime));
  }

  return Math.round(excelTime * 24 * 60 * 60 * 1000);
};
