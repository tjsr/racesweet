import { InvalidDateTimeStringError } from "./errors.ts";
import { hasDateComponent } from "./datetime.ts";
import { parseDateString } from "./datestring.ts";
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

  let isoDate = new Date(input);
  if (!isNaN(isoDate.getTime())) {
    console.log('Returning acceptable ISO time.', input, isoDate);
    return {
      date: isoDate.toISOString().split('T')[0],
      isoDate: timeToLocal(isoDate),
      time: isoDate.toISOString().split('T')[1],
    };
  }

  const dateTimeParts = input.includes('T') ? input.split('T') : input.split(' ');

  if (input.includes('T')) {
    console.warn('Input contains T but was not parsed as an ISO8601 DateTime.');
  } else if (!input.includes(' ')) {
    throw new InvalidDateTimeStringError(`Invalid date/time format - missing space or T separator: '${input}'`);
  }

  const timeIndex = dateTimeParts[1].includes(':') ? 1 : 0;
  const dateIndex = dateTimeParts[1].includes(':') ? 0 : 1;

  let timePart = dateTimeParts[timeIndex];
  const datePart = parseDateString(dateTimeParts[dateIndex]).toISOString().split('T')[0];

  if (!timeStringHasTimezone(timePart) && tzhint) {
    timePart = timePart + tzhint;
  }
  const isoDateString = datePart + 'T' + timePart;
  isoDate = new Date(isoDateString);
  return {
    date: datePart,
    isoDate: isoDate,
    time: timePart,
  };
};
