import { DateParseError, InvalidYearError } from './errors.ts';
import {
  containsDate,
  datePartsToDMY,
  formatDate,
  isDate,
  timeToLocal,
  validEpoch2DigitYear,
  validEpoch4DigitYear
} from './dateutils.ts';

describe('validEpoch2DigitYear', () => {
  it('Should reject out-of-range 2-digit year values', () => {
    const validYears = [38, 40, 55, 67, 69];
    validYears.forEach((year) => {
      expect(validEpoch2DigitYear(year)).toEqual(false);
    });
  });

  it('Should accept in-range 2-digit year values', () => {
    const validYears = [0, 7, 12, 22, 23, 24, 25, 17, 36, 37, 70, 71, 79, 88, 90, 91, 99];
    validYears.forEach((year) => {
      expect(validEpoch2DigitYear(year)).toEqual(true);
    });
  });
});

describe('validEpoch4DigitYear', () => {
  it('Should reject out-of-range 4-digit years', () => {
    const validYears = [1738, 2038, 2050, 1950, 1969];
    validYears.forEach((year) => {
      expect(validEpoch4DigitYear(year)).toEqual(false);
    });
  });

  it('Should accept in-range 4-digit years', () => {
    const validYears = [1970, 1979, 1999, 2000, 2007, 2012, 2022, 2023, 2024, 2037];
    validYears.forEach((year) => {
      expect(validEpoch4DigitYear(year)).toEqual(true);
    });
  });
});

describe('timeToLocal', () => {
  it('Should convert a date to local time', () => {
    const date: Date = new Date('2023-10-01T12:00:00');
    const localDate: Date = timeToLocal(date);
    expect(localDate).not.toBe(date);
    expect(localDate).toEqual(date);
    expect(localDate.getTimezoneOffset()).toEqual(date.getTimezoneOffset());
  });
});


describe('datePartsToDMY', () => {
  it('Should convert date parts to DMY format', () => {
    const parts: [string, string, string] = ['2023', '10', '01'];
    const result = datePartsToDMY(parts);
    expect(result).toEqual({ day: 1, month: 10, year: 2023 });
  });

  it('Should handle two-digit year correctly', () => {
    const parts: [string, string, string] = ['01', '10', '23'];
    const result = datePartsToDMY(parts);
    expect(result).toEqual({ day: 1, month: 10, year: 2023 });
  });

  it('Should handle invalid two-digit year', () => {
    const parts: [string, string, string] = ['01', '10', '37'];
    expect(() => datePartsToDMY(parts)).not.toThrow();

    const result = datePartsToDMY(parts);
    expect(result).toEqual({ day: 1, month: 10, year: 2037 });

    parts[2] = '38';
    expect(() => datePartsToDMY(parts)).toThrow(InvalidYearError);
  });

  it ('Should determine correct year and day portion given 2-digit year', () => {
    const parts: [string, string, string] = ['25', '10', '00'];
    const result = datePartsToDMY(parts);
    expect(result).toEqual({ day: 25, month: 10, year: 2000 });
  });

  it('Should reject invalid day if year is 2-digit', () => {
    const parts: [string, string, string] = ['49', '10', '00'];
    expect(() => datePartsToDMY(parts)).toThrow(DateParseError);
  });

  it('Should reject invalid day with valid 4-digit year', () => {
    const parts: [string, string, string] = ['49', '10', '2020'];
    expect(() => datePartsToDMY(parts)).toThrow(DateParseError);
  });
});

describe('isDate', () => {
  it('Should return true for valid date', () => {
    const testString = [
      '2023-10-01',
      '2022/10/01',
      '22/10/01'];
    testString.forEach((date) => {
      expect(isDate(date)).toBe(true);
    });
  });

  it('Should return false for invalid date', () => {
    const testString = '2023-13-01';
    expect(isDate(testString)).toBe(false);
  });
});

describe('containsDate', () => {
  it('Should return true for string with date', () => {
    const inputs: string[] = [
      '2023-10-01 12:00:00',
      '2023-10-01T12:00:00',
      '2023-10-01T12:00:00+10:00',
    ];
    inputs.forEach((testInput) => {
      expect(containsDate(testInput), `Failed for ${testInput}`).toBe(true);
    });
  });

  it('Should return true for string with just a date', () => {
    const inputs: string[] = [
      '2023-10-01',
      '2023/10/01',
      '01-10-2023',
      '01/10/2023',
    ];
    inputs.forEach((testInput) => {
      expect(containsDate(testInput)).toBe(true);
    });
  });

  it('Should return false for string without date', () => {
    const testString = '12:00:00';
    expect(containsDate(testString)).toBe(false);
  });
});

describe('formatDate', () => {
  it('Should format date from multiple input types', () => {
    const inputs: string[]  = [
      '2023-10-01',
      '2023/10/01',
      '01-10-2023',
      '01/10/2023',
      '2023-10-01T12:00:00',
      '2023-10-01 12:00:00',
      '2023-10-01T12:00:00+11:00',
      '2023-10-01 12:00:00+11:00',
      '2023-10-01T12:00:00Z',
      '2023-10-01 12:00:00Z',
      '2023-10-01T12:00:00.000Z',
      '2023-10-01 12:00:00.000Z',
      '2023-10-01T12:00:00.000+11:00',
      '2023-10-01 12:00:00.000+11:00',
    ];
    inputs.forEach((testInput) => {
      const result = formatDate(testInput);
      console.log(`Formatted date: ${result} for ${testInput}`);
      expect(result, `Got incorrect output ${result} from ${testInput}`).toEqual('2023-10-01');
    });
  });

  it('Should handle invalid date format', () => {
    const testInput = 'invalid-date';
    expect(() => formatDate(testInput)).toThrow();
  });

  it('Should handle slashed date format', () => {
    const testInput = '2023/10/01';
    const result = formatDate(testInput);
    expect(result).toEqual('2023-10-01');
  });
});
