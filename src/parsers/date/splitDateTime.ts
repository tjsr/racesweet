import { InvalidDateTimeStringError } from "./errors.js";
import { TZDate } from "@date-fns/tz";
import { formatRFC3339 } from "date-fns";
import { hasDateComponent } from "./datetime.js";
import { parseDateString } from "./datestring.js";
import { timeToLocal } from "./dateutils.js";

export const timeStringHasTimezone = (time: string): boolean =>
  time?.includes('Z') || /[+-]\d{2}:\d{2}/.test(time ?? '');

export const splitDateTime = (input: string, tzhint?: string): { isoDate?: Date; date: string; time: string; } => {
  if (!input) {
    throw new Error("Input cannot be empty");
  }
  input = input.trim();
  
  if (!hasDateComponent(input)) { // !input.includes(' ') && !input.includes('T')) {
    throw new InvalidDateTimeStringError(`Invalid date/time format - missing space or T separator: '${input}'`);
  }

  const hasInputTz = timeStringHasTimezone(input);
  const datePortionIsIso = /^\d{4}[-/T]/.test(input);

  if (datePortionIsIso || hasInputTz || tzhint !== undefined) {
    const isoDate = new TZDate(input, hasInputTz ? undefined : tzhint);
    if (!isNaN(isoDate.getTime())) {
      console.log('Returning acceptable ISO time.', input, isoDate);
      const outputInUtc = hasInputTz || tzhint !== undefined;
      const formatTarget = outputInUtc ? TZDate.tz('UTC', isoDate) : isoDate;
      const rfcDateString = formatRFC3339(formatTarget, { fractionDigits: 3 });
      let timePart = outputInUtc
        ? rfcDateString.split('T')[1]
        : rfcDateString.split('T')[1].replace(/(Z|[+-]\d{2}:\d{2})$/, '');
      // Strip spurious .000 when original input had no milliseconds
      if (!input.split(/[\sT]/)[1]?.includes('.')) {
        timePart = timePart.replace(/\.000(Z|[+-]\d{2}:\d{2})?$/, (_, tz) => tz ?? '');
      }
      return {
        date: rfcDateString.split('T')[0],
        isoDate: timeToLocal(isoDate),
        time: timePart,
      };
    }
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

  try {
    const parsedDateString = parseDateString(dateTimeParts[dateIndex]);
    const datePart = formatRFC3339(parsedDateString, { fractionDigits: 3 }).split('T')[0];
    return {
      date: datePart,
      isoDate: parsedDateString,
      time: timePart,
    };
  } catch {
    // parseDateString failed (e.g. MM-DD-YYYY format like '12/31/2023'); fall back to TZDate
    const isoDateFallback = new TZDate(input, tzhint);
    if (!isNaN(isoDateFallback.getTime())) {
      return {
        date: formatRFC3339(isoDateFallback, { fractionDigits: 3 }).split('T')[0],
        isoDate: timeToLocal(isoDateFallback),
        time: timePart,
      };
    }
    throw new InvalidDateTimeStringError(`Could not parse date/time: '${input}'`);
  }
};
