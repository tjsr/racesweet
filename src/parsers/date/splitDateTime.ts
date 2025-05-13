import { InvalidDateTimeStringError } from "./errors.ts";
import { TZDate } from "@date-fns/tz";
import { formatRFC3339 } from "date-fns";
import { hasDateComponent } from "./datetime.ts";
import { parseDateString } from "./datestring.ts";
import { timeToLocal } from "./dateutils.ts";

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
  if (!isNaN(isoDate.getTime())) {
    console.log('Returning acceptable ISO time.', input, isoDate);
    const rfcDateString = formatRFC3339(isoDate, { fractionDigits: 3 });
    return {
      date: rfcDateString.split('T')[0],
      isoDate: timeToLocal(isoDate),
      time: rfcDateString.split('T')[1],
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
  const parsedDateString = parseDateString(dateTimeParts[dateIndex]);
  const datePart = formatRFC3339(parsedDateString, { fractionDigits: 3 }).split('T')[0];

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
