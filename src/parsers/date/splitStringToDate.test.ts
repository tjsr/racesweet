import { DateParseError } from "./errors.ts";
import { parseSplitDateStringToDate } from "./splitStringToDate.js";

describe('parseSplitDateStringToDate', () => {
  it ('Should figure out which portion of a slashed date is the 2-digit year or day.', () => {
    const testString = '25/12/00';
    const result = parseSplitDateStringToDate(testString, '/');
    expect(result.getFullYear()).toEqual(2000);
    expect(result.getMonth()).toEqual(11);
    expect(result.getDate()).toEqual(25);
  });

  it ('Should reject an out-of-range day value given a 2-digit year.', () => {
    const testString = '49/12/00';
    expect(() => parseSplitDateStringToDate(testString, '/')).toThrowError(DateParseError);
  });
});
