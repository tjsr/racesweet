import { humanDateStringToSystemDateString } from './humandate.js';

describe('humandate', () => {
  it('should convert a valid date with two-digit year to system format', () => {
    expect(humanDateStringToSystemDateString('12-05-23')).toBe('2023-05-12');
    expect(humanDateStringToSystemDateString('1/1/99')).toBe('2099-01-01');
    expect(humanDateStringToSystemDateString('2023/05/12')).toBe('2023-05-12');
  });
});

describe('humanDateStringToSystemDateString', () => {
  it('should convert a valid date with two-digit year to system format', () => {
    expect(humanDateStringToSystemDateString('12-05-23')).toBe('2023-05-12');
    expect(humanDateStringToSystemDateString('1/1/99')).toBe('2099-01-01');
    expect(humanDateStringToSystemDateString('2023/05/12')).toBe('2023-05-12');
  });

  it('should convert a valid date with four-digit year to system format', () => {
    expect(humanDateStringToSystemDateString('12-05-2023')).toBe('2023-05-12');
    expect(humanDateStringToSystemDateString('1/1/1999')).toBe('1999-01-01');
  });

  it('should throw an error for invalid date formats', () => {
    expect(() => humanDateStringToSystemDateString('12-05')).toThrow('Invalid date format: 12-05');
    expect(() => humanDateStringToSystemDateString('2023/05/12')).not.toThrow('Invalid date format: 2023/05/12');
    expect(() => humanDateStringToSystemDateString('12-05-202')).toThrow('Invalid date format: 12-05-202');
    expect(() => humanDateStringToSystemDateString('abc-def-ghi')).toThrow('Invalid date format: abc-def-ghi');
  });

  it('should handle single-digit day and month correctly', () => {
    expect(humanDateStringToSystemDateString('1-1-23')).toBe('2023-01-01');
    expect(humanDateStringToSystemDateString('9/9/2023')).toBe('2023-09-09');
  });

  it('should throw an error for out-of-range dates', () => {
    expect(() => humanDateStringToSystemDateString('32-01-2023')).toThrow('Invalid date format: 32-01-2023');
    expect(() => humanDateStringToSystemDateString('12-13-2023')).toThrow('Invalid date format: 12-13-2023');
  });
});
