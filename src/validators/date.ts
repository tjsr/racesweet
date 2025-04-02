import { isValid } from "date-fns/isValid";
import { validatePositiveNumbers } from "./numbers.js";

const isValidMonth = (monthNumber: number): boolean => monthNumber >= 1 && monthNumber <= 12;

export const validateDayMonthYear = (day: string, month: string, year: string): boolean => {
  validatePositiveNumbers(day, month, year);

  const nDay: number = parseInt(day, 10);
  const nMonth: number = parseInt(month, 10);
  const nYear: number = parseInt(year, 10);

  // Check if the month is valid
  if (!isValidMonth(nMonth)) {
    return false;
  }

  isValid(new Date(nYear, nMonth - 1, nDay));

  // Check if the day is valid
  const daysInMonth = new Date(nYear, nMonth-1, 0).getDate();
  if (nDay < 1 || nDay > daysInMonth) {
    return false;
  }
  // Check if the year is valid
  if (year.length !== 2 && year.length !== 4) {
    return false;
  }

  validatePositiveNumbers(day, month, year);
  return true;
};

