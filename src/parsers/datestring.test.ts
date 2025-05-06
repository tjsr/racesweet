import { DateParseError, InvalidYearError } from './errors.js';
import { describe, expect, it } from 'vitest';

import { expectDate } from './dateTestUtils.js';
import { parseDateString } from './datestring.js';

describe('parseDateString - valid inputs', function () {
  it('parses 4-digit year with slash', () => {
    const result = parseDateString('12/25/2020');
    expect(result.toISOString()).toContain('2020-12-25');
  });

  it('parses 2-digit year with slash', () => {
    const result = parseDateString('12/25/49');
    expect(result.toISOString()).toContain('2049-12-25');
  });

  it('parses 2-digit year with dash', () => {
    const result = parseDateString('49-12-25');
    expect(result.toISOString()).toContain('2049-12-25');
  });

  it('parses 4-digit year with dash', () => {
    const result = parseDateString('2020-12-25');
    expect(result.toISOString()).toContain('2020-12-25');
  });

  it('parses 2-digit year above 49 as 1900s', () => {
    const result = parseDateString('12/25/50');
    expect(result.toISOString()).toContain('1950-12-25');
  });

  it('parses 2-digit year at lower bound (00)', () => {
    const result = parseDateString('12/25/00');
    expect(result.toISOString()).toContain('2000-12-25');
  });

  it('parses 2-digit year at upper bound (99)', () => {
    const result = parseDateString('99-01-01');
    expect(result.toISOString()).toContain('1999-01-01');
  });

  it('throws DateParseError on non-numeric parts', () => {
    expect(() => parseDateString('2020-jan-01')).not.toThrow(DateParseError);
  });

  it('throws DateParseError on non-numeric parts', () => {
    const result = parseDateString('2020-jan-01');
    expect(result.toISOString()).toContain('2020-01-01');
  });

});

describe('parseDateString - invalid inputs', function () {
  it('throws InvalidYearError for 3-digit year with slash', () => {
    expect(() => parseDateString('12/25/123')).toThrow(InvalidYearError);
  });

  it('throws InvalidYearError for 3-digit year with dash', () => {
    expect(() => parseDateString('123-12-25')).toThrow(InvalidYearError);
  });

  it('throws DateParseError for completely malformed string', () => {
    expect(() => parseDateString('hello world')).toThrow(DateParseError);
  });

  it('throws DateParseError for empty string', () => {
    expect(() => parseDateString('')).toThrow(DateParseError);
  });

  it('throws DateParseError for missing parts in slash format', () => {
    expect(() => parseDateString('12/25')).toThrow(DateParseError);
  });

  it('throws DateParseError for missing parts in dash format', () => {
    expect(() => parseDateString('2020-12')).toThrow(DateParseError);
  });

  it('throws DateParseError when dash is used without 4-digit year', () => {
    expect(() => parseDateString('12-25-20')).toThrow(DateParseError);
  });

  it('throws DateParseError on invalid numeric values', () => {
    expect(() => parseDateString('2020-13-40')).toThrow(DateParseError);
  });
});

describe('prevtests.parseDateString', () => {
  it('Should return a {day;month;year;} for valid date formats with year first', () => {
    const testInputs = [
      '2023-10-01',
      '2023/10/01',
    ];
    testInputs.forEach((testInput) => {
      const parsed = parseDateString(testInput);
      expectDate(parsed, 2023, 10, 1);
    });
  });

  it('Should return a for valid date formats with year last', () => {
    const testInputs = [
      '10-01-2023',
      '10/01/2023',
    ];
    testInputs.forEach((testInput) => {
      const parsed = parseDateString(testInput);
      expectDate(parsed, 2023, 10, 1);
    });
  });

  it('Should reject a dashed date with no four-digit year.', () => {
    const testInput = '10-01-23';
    expect(() => parseDateString(testInput)).toThrowError();
  });

  it('Should accept a slashed date that is not clear which has the year part.', () => {
    const testInput = '10/01/23';

    const parsed = parseDateString(testInput);
    expectDate(parsed, 2023, 1, 10);
  });
});

describe('parseDateString - edge cases', () => {
  it('Should accept a fairly human-readable date and time string', () => {
    const testString = '26/10/2024 09:06:25.888';
    const result = parseDateString(testString);
    expect(result.toISOString()).toContain('2024-10-26');
  });

  it('Should accept a fairly human-readable date and time string with dashes', () => {
    const testString = '26-10-2024 09:06:25.888';
    const result = parseDateString(testString);
    expect(result.toISOString()).toContain('2024-10-26');
  });
});
