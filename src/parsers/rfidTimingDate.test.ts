// import { describe, expect, it } from 'vitest';

import { DateParseError } from './errors.js';
import { tryParseDateTime } from './rfidTimingDate.js';

describe('tryParseDateTime', () => {
  const refDate = new Date('2023-01-01T00:00:00.000Z'); // Reference date for timezone

  const testCases = [
    { expected: new Date('2023-12-31T23:59:59.999Z'), format: 'dd/MM/yyyy', input: '31/12/2023 23:59:59.999' },
    { expected: new Date('2023-12-31T23:59:59.999Z'), format: 'MM/dd/yyyy', input: '12/31/2023 23:59:59.999' },
    { expected: new Date('2023-12-31T23:59:59.999Z'), format: 'yyyy/MM/dd', input: '2023/12/31 23:59:59.999' },
    { expected: new Date('2023-12-31T23:59:59.999Z'), format: 'dd-MM-yyyy', input: '31-12-2023 23:59:59.999' },
    { expected: new Date('2023-12-31T23:59:59.999Z'), format: 'MM-dd-yyyy', input: '12-31-2023 23:59:59.999' },
    { expected: new Date('2023-12-31T23:59:59.999Z'), format: 'yyyy-MM-dd', input: '2023-12-31 23:59:59.999' },
    { expected: null, format: '', input: '' }, // Empty format case
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
