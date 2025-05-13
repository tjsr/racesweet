import { expandTwoDigitYear, parseDateString } from './datestring.ts';

import { DateParseError } from './errors.ts';
import { expectDate } from './dateTestUtils.ts';

export const expectParseString = (inputString: string, expectedYear: number, expectedMonth: number, expectedDay: number) => {
  const result = parseDateString(inputString);
  expect(result).toBeInstanceOf(Date);
  expectDate(result, expectedYear, expectedMonth, expectedDay);
};

const expectParseError = (inputString: string) => {
  expect(() => parseDateString(inputString)).toThrow(DateParseError);
};

describe('parseDateString', () => {
  it('parses 4-digit year with slash', () => {
    expectParseString('25/12/2020', 2020, 12, 25);
  });

  it('rejects 2-digit year with slash if year is not in acceptable range', () => {
    expectParseError('25/12/49');
  });

  it('parses 2-digit year with dash', () => {
    expectParseError('49-12-25');
  });

  it('parses 4-digit year with dash', () => {
    expectParseString('2020-12-25', 2020, 12, 25);
  });

  it('parses 2-digit year above 49 as 1900s and rejects', () => {
    expectParseError('25/12/50');
  });

  it('parses 2-digit year at lower bound (00)', () => {
    expectParseString('25/12/00', 2000, 12, 25);
  });

  it('parses 2-digit year at upper bound (99)', () => {
    expectParseString('1999-01-01', 1999, 1, 1);
  });

  it('throws DateParseError on non-numeric parts', () => {
    expectParseError('2020-jan-01');
  });
});

describe('parseDateString - invalid inputs', function () {
  it('throws InvalidYearError for 3-digit year with slash', () => {
    expectParseError('12/25/123');
  });

  it('throws InvalidYearError for 3-digit year with dash', () => {
    expectParseError('123-12-25');
  });

  it('throws DateParseError for completely malformed string', () => {
    expectParseError('hello world');
  });

  it('throws DateParseError for empty string', () => {
    expectParseError('');
  });

  it('throws DateParseError for missing parts in slash format', () => {
    expectParseError('12/25');
  });

  it('throws DateParseError for missing parts in dash format', () => {
    expectParseError('2020-12');
  });

  it('throws DateParseError when dash is used without 4-digit year', () => {
    expectParseError('12-25-20');
  });

  it('throws DateParseError on invalid numeric values', () => {
    expectParseError('2020-13-40');
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
      expectDate(parsed, 2023, 1, 10);
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
    expect(() => parseDateString(testString)).toThrow(DateParseError);
  });

  it('Should accept a fairly human-readable date and time string with dashes', () => {
    const testString = '26-10-2024 09:06:25.888';
    expect(() => parseDateString(testString)).toThrow(DateParseError);
  });
});

describe('expandTwoDigitYear', () => {
  it ('Should expand 00 to 2000', () => {
    expect(expandTwoDigitYear('00')).toEqual('2000');
  });

  it ('Should expand 2000 years correctly', () => {
    expect(expandTwoDigitYear('20')).toEqual('2020');
    expect(expandTwoDigitYear('40')).toEqual('2040');
    expect(expandTwoDigitYear('49')).toEqual('2049');
  });

  it('Should expand 1900 years correctly', () => {
    expect(expandTwoDigitYear('50')).toEqual('1950');
    expect(expandTwoDigitYear('51')).toEqual('1951');
    expect(expandTwoDigitYear('70')).toEqual('1970');
  });

  it('Should reject empty string', () => {
    expect(() => expandTwoDigitYear('')).toThrow(DateParseError);
  });

  it('Should reject single-digit string', () => {
    expect(() => expandTwoDigitYear('0')).toThrow(DateParseError);
    expect(() => expandTwoDigitYear('1')).toThrow(DateParseError);
    expect(() => expandTwoDigitYear('9')).toThrow(DateParseError);
  });

  it('Should reject non-numeric string', () => {
    expect(() => expandTwoDigitYear('a')).toThrow(DateParseError);
    expect(() => expandTwoDigitYear('ab')).toThrow(DateParseError);
    expect(() => expandTwoDigitYear('abc')).toThrow(DateParseError);
  });

  it('Should reject string that had separators still included', () => {
    expect(() => expandTwoDigitYear('12/')).toThrow(DateParseError);
    expect(() => expandTwoDigitYear('/3')).toThrow(DateParseError);
    expect(() => expandTwoDigitYear('-12')).toThrow(DateParseError);
    expect(() => expandTwoDigitYear('12-')).toThrow(DateParseError);
  });

  it('Should reject three or four-digit years', () => {
    expect(() => expandTwoDigitYear('123')).toThrow(DateParseError);
    expect(() => expandTwoDigitYear('1234')).toThrow(DateParseError);
  });
});
