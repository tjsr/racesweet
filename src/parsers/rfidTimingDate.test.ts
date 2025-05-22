// import { describe, expect, it } from 'vitest';

import { parseRfidTimingDate, tryParseDateTime } from './rfidTimingDate.ts';

import { DateParseError } from './date/errors.ts';
import { TZDate } from '@date-fns/tz';

describe('tryParseDateTime', () => {
  const refDate = new TZDate('2023-01-01T00:00:00.000+1100'); // Reference date for timezone

  const testCases = [
    { expected: new Date('2023-12-31T23:59:59.999Z'), format: 'dd/MM/yyyy', input: '31/12/2023 23:59:59.999' },
    { expected: new Date('2023-12-31T23:59:59.999Z'), format: 'MM/dd/yyyy', input: '12/31/2023 23:59:59.999' },
    { expected: new Date('2023-12-31T23:59:59.999Z'), format: 'yyyy/MM/dd', input: '2023/12/31 23:59:59.999' },
    { expected: new Date('2023-12-31T23:59:59.999Z'), format: 'dd-MM-yyyy', input: '31-12-2023 23:59:59.999' },
    { expected: new Date('2023-12-31T23:59:59.999Z'), format: 'MM-dd-yyyy', input: '12-31-2023 23:59:59.999' },
    { expected: new Date('2023-12-31T23:59:59.999Z'), format: 'yyyy-MM-dd', input: '2023-12-31 23:59:59.999' },
    // { expected: null, format: '', input: '' }, // Empty format case
  ];

  testCases.forEach(({ input, format, expected }) => {
    it(`should correctly parse "${input}" with format "${format}"`, () => {
      if (expected === null) {
        expect(() => tryParseDateTime(input, refDate)).toThrow(DateParseError);
      } else {
        const result = tryParseDateTime(input, refDate);
        expect(result).toEqual(expected);
      }
    });
  });

  it('should throw DateParseError for invalid date strings', () => {
    const invalidDate = 'invalid-date-string';
    expect(() => tryParseDateTime(invalidDate, refDate)).toThrow(DateParseError);
  });
});

describe('parseRfidTimingDate', () => {
  const testCases = [
    { expected: new Date('2024-08-23T18:45:34.177Z'), input: '23-08-2024 18:45:34.177' },
    { expected: new Date('2023-08-25T19:11:06.405Z'), input: '25/08/2023 19:11:06.405' },
    { expected: new Date('2023-08-25T19:11:06.405Z'), input: '25-08-2023 19:11:06.405' },
    { expected: new Date('2023-08-25T19:11:06.405Z'), input: '2023/08/25 19:11:06.405' },
    { expected: new Date('2023-08-25T19:11:06.405Z'), input: '2023-08-25 19:11:06.405' },
  ];

  testCases.forEach(({ input, expected }) => {
    it(`should correctly parse "${input}"`, () => {
      const result = parseRfidTimingDate(input);
      const tzOffset = result.getTimezoneOffset() * 60 * 1000; // Convert to milliseconds
      expect(result.getTime()).toEqual(expected.getTime() + tzOffset);
    });
  });

  it('should throw DateParseError for invalid date strings', () => {
    const invalidDate = 'invalid-date-string';
    expect(() => parseRfidTimingDate(invalidDate)).toThrow();
  });
});
