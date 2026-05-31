import { InvalidDateTimeStringError } from "./errors.js";
import { TZDate } from "@date-fns/tz";
import { formatRFC3339 } from "date-fns";
import { hasDateComponent } from "./datetime.js";
import { parseDateString } from "./datestring.js";
import { timeToLocal } from "./dateutils.js";

const timeStringHasTimezone = (time: string): boolean => time?.includes('Z') || time?.includes('+');

export const splitDateTime = (input: string, tzhint?: string): { isoDate?: Date; date: string; time: string; } => {
  if (!input) {
    throw new Error("Input cannot be empty");
  }
  input = input.trim();
  
  if (!hasDateComponent(input)) { // !input.includes(' ') && !input.includes('T')) {
    throw new InvalidDateTimeStringError(`Invalid date/time format - missing space or T separator: '${input}'`);
  }

  const isoDate = new TZDate(input, timeStringHasTimezone(input) ? undefined : tzhint);
  if (/^\d{4}/.test(input) && !isNaN(isoDate.getTime())) {
    const datePart = input.includes('T') ? input.split('T')[0] : input.split(' ')[0];
    const utcString = new Date(+isoDate).toISOString();
    const timePart = utcString.split('T')[1].replace(/\.000Z$/, 'Z');
    return {
      date: datePart,
      isoDate: timeToLocal(isoDate),
      time: timePart,
    };
  }

  const dateTimeParts = input.includes('T') ? input.split('T') : input.split(' ');

  if (input.includes('T')) {
    console.warn(`Input ${input} contains T but was not parsed as an ISO8601 DateTime.`);
  } else if (!input.includes(' ')) {
    throw new InvalidDateTimeStringError(`Invalid date/time format - missing space or T separator: '${input}'`);
  }

  const timeIndex = dateTimeParts[1].includes(':') ? 1 : 0;
  const dateIndex = dateTimeParts[1].includes(':') ? 0 : 1;

  const timePart = dateTimeParts[timeIndex];
  let parsedDateString: Date;
  let datePart: string;
  try {
    parsedDateString = parseDateString(dateTimeParts[dateIndex]);
    datePart = formatRFC3339(parsedDateString, { fractionDigits: 3 }).split('T')[0];
  } catch (_err) {
    // DMY parsing failed — if TZDate gave a valid result (e.g., MM/DD or MM-DD format), fall back to it
    if (!isNaN(isoDate.getTime())) {
      const utcIsoString = new Date(+isoDate).toISOString();
      const fallbackDatePart = utcIsoString.split('T')[0];
      const fallbackTimePart = utcIsoString.split('T')[1].replace(/\.000Z$/, 'Z');
      return {
        date: fallbackDatePart,
        isoDate: timeToLocal(isoDate),
        time: fallbackTimePart,
      };
    }
    throw _err;
  }

  // if (!timeStringHasTimezone(timePart) && tzhint) {
  //   timePart = timePart + tzhint;
  // }
  // const isoDateString = datePart + 'T' + timePart;
  // isoDate = new TZDate(isoDateString, tzhint);
  return {
    date: datePart,
    isoDate: parsedDateString,
    time: timePart,
  };
};
