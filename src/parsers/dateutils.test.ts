import { datePartsToDMY, timeToLocal, validEpoch2DigitYear, validEpoch4DigitYear } from './dateutils.js';

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
    expect(() => datePartsToDMY(parts)).not.toThrow();
  });
});
