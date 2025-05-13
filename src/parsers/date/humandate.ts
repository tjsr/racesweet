import { validateDayMonthYear } from "../../validators/date.ts";

const humanDateString = /^(?<day>\d{1,2})[-/](?<month>\d{1,2})[-/](?<year>\d{2,4})$/;
const humanDateWithYearFirst = /^(?<year>\d{4})[-/](?<month>\d{1,2})[-/](?<day>\d{1,2})$/;

export const humanDateStringToSystemDateString = (input: string): string => {
  const match = input.match(humanDateString) || input.match(humanDateWithYearFirst);
  if (!match) {
    throw new Error(`Invalid date format: ${input}`);
  }

  const { day, month, year } = match.groups as { day: string; month: string; year: string };
  
  try {
    const isValid = validateDayMonthYear(day, month, year);
    if (!isValid) {
      throw new Error(`Invalid date format: ${input}`);
    }
  } catch (error) {
    throw new Error(`While parsing date ${input} got ${error}`);
  }

  // Normalize year to four digits
  const normalizedYear = year.length === 2 ? `20${year}` : year;

  return `${normalizedYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

