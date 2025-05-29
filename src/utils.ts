import type { uuid, uuid5 } from "./parsers/outreach.ts";

import { DateParseError } from "./parsers/date/errors.ts";
import type { TimeRecord } from "./model/timerecord.ts";
import { v5 } from "uuid";

export const safeIntOption = (...values: string[]): number | undefined => {
  for (const value of values) {
    if (value !== undefined) {
      const intValue: number = parseInt(value, 10);
      if (!isNaN(intValue)) {
        return intValue;
      }
    }
  }
  return undefined;
};

export const asSafeNumber = (value: string | number | undefined): number => {
  if (value === undefined) {
    return 0;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '' && !isNaN(Number(value))) {
    return Number(value);
  }
  return 0;
};


export const humanDate = (date: Date): string => {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new DateParseError('Invalid date provided', date.toString());
  }
  return `${date.getDate().toString()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
};

export const createIdHash = (source: uuid, crossing: Omit<TimeRecord, 'source'|'id'>|Omit<TimeRecord, 'id'>): uuid5 => {
  return v5(JSON.stringify({ ...crossing, source: source }), source);
};

