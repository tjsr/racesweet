import { DateParseError } from "./errors.ts";
import { expectDate } from './dateTestUtils.ts';
import { parseDashedDateString } from "./dashedDateString.ts";
import { parseDateString } from "./datestring.ts";

const testTz: string = 'Australia/Melbourne';

describe('parseDashedDateString::parseDateString', () => {
  it('Should reject a fairly human-readable dashed date if it contains a time value with dashes', () => {
    const testString = '26-10-2024 09:06:25.888';
    expect(() => parseDateString(testString)).toThrow(DateParseError);
  });
});

describe('parseDashedDateString - edge cases', () => {
  it('Should reject invalid date formats', () => {
    const invalidDates = [
      '12/25/2020/01',
      '2020/12/25',
      '12/25/20a0',
      '12/25/20.0',
      '12/25/20,0',
      '12/25/20 0',
      '12/25/20 00',
    ];

    invalidDates.forEach((date) => {
      expect(() => parseDashedDateString(date)).toThrow(DateParseError);
    });
  });

  it('Should accept four-digit dashed year dates.', () => {
    const invalidDates = [
      '25-12-2020',
      '2020-12-25',
    ];

    invalidDates.forEach((date) => {
      const result: Date = parseDashedDateString(date, testTz);
      expect(result.toISOString()).toContain('2020-12-25');
      expectDate(result, 2020, 12, 25);
    });
  });

  it('Should reject dashed dates with no four-digit year.', () => {
    const testInput = '10-01-23';
    expect(() => parseDashedDateString(testInput, testTz)).toThrowError();
  });

  it('Should reject string with time after space', () => {
    const testString = '26-10-2024 09:06:25.888';
    expect(() => parseDashedDateString(testString, testTz)).toThrow(DateParseError);
  });

  it('Should reject string with time after T', () => {
    const testString = '26-10-2024T09:06:25.888';
    expect(() => parseDashedDateString(testString, testTz)).toThrow(DateParseError);
  });

  it('Should accept a fairly human-readable dashed date and time string with dashes', () => {
    const testString = '26-10-2024';
    const result = parseDashedDateString(testString, testTz);
    expect(result.toISOString()).toContain('2024-10-26');
  });
});

describe('parseDashedDateToDate', () => {
  it('Should reject a dashed date wtih no clear year portion', () => {
    const testString = '26-10-23';
    expect(() => parseDashedDateString(testString, testTz)).toThrow(DateParseError);
  });
});

describe('parseDashedDateString', () => {
  it('Should reject a dashed date wtih no clear year portion', () => {
    const testString = '26-10-23';
    expect(() => parseDashedDateString(testString, testTz)).toThrow(DateParseError);
  });

  it('parses 2-digit year with dash', () => {
    const testString = '49-12-25';
    expect(() => parseDashedDateString(testString, testTz)).toThrow(DateParseError);
  });
});
