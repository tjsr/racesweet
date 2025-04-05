import { validateTimeString } from './time.js';

describe('validateTimeString', () => {
  const expectAllInvalid = (timeStrings: string[]) => {
    timeStrings.forEach((time) => {
      expect(validateTimeString(time)).toBe(false);
    });
  };

  const expectAllValid = (timeStrings: string[]) => {
    timeStrings.forEach((time) => {
      expect(validateTimeString(time)).toBe(true);
    });
  };

  it('should return false for an empty string', () => {
    expect(validateTimeString('')).toBe(false);
  });

  it('should return false for a string with only spaces', () => {
    expect(validateTimeString('   ')).toBe(false);
  });

  it('should return false for a null input', () => {
    expect(validateTimeString(null as unknown as string)).toBe(false);
  });

  it('should return false for an invalid time format', () => {
    const invalidTimes = [
      '25:00:00', // Hours out of range
      '12:60:00', // Minutes out of range
      '12:00:60', // Seconds out of range
      'abc',      // Non-time string
      '12:00',    // Missing seconds
      '12:00:00:00', // Extra component
    ];

    expectAllInvalid(invalidTimes);
  });

  it('should return true for a valid time format', () => {
    const validTimes = ['00:00:00', '23:59:59', '12:34:56'];

    expectAllValid(validTimes);
  });

  it('should return false for single-digit hours, minutes, or seconds', () => {
    expect(validateTimeString('1:2:3')).toBe(false);
  });

  it('should return true for zero-padded single-digit hours, minutes, or seconds', () => {
    expect(validateTimeString('01:02:03')).toBe(true);
  });

  it('should return false for strings with extra characters', () => {
    expect(validateTimeString('12:34:56abc')).toBe(false);
    expect(validateTimeString('abc12:34:56')).toBe(false);
  });

  it('should return false for times with hours or minutes out of range', () => {
    const invalidTimes = [
      '24:00:00', // Hours out of range
      '00:60:00', // Minutes out of range
      '07:64:07', // Minutes out of range
      '7:128:15', // Minutes out of range
      '00:00:60', // Seconds out of range
      '99:99:99', // All components out of range
      '-01:00:00', // Negative hours
      '00:-01:00', // Negative minutes
      '00:00:-01', // Negative seconds
    ];

    expectAllInvalid(invalidTimes);
  });

  it('Should reject time values lacking seconds with minutes out of range', () => {
    const invalidTimes = [
      '12:00', // Missing seconds
      '12:60', // Minutes out of range
      '12:443', // Minutes out of range
      '12:00.515', // Seconds out of range
      '25:61', // Hours and minutes out of range
    ];

    expectAllInvalid(invalidTimes);
  });

  it('Should reject times with milliseconds if not enough segments are provided for hh:mm:ss', () => {
    const invalidTimes = [
      '12:00', // Missing seconds
      '12:60', // Minutes out of range
      '12:443', // Minutes out of range
      '12:00.515', // Seconds out of range
    ];

    expectAllInvalid(invalidTimes);
  });

  it('Should reject time values that have empty components', () => {
    const emptyTimeStrings = [
      '12:00:',
      ':00:00',
      '12::00',
      '12:00:',
    ];

    expectAllInvalid(emptyTimeStrings);
  });

  it('Should accept time values that have milliseconds', () => {
    const validTimes = [
      '00:00:00.000',
      '23:59:59.999',
      '12:34:56.123',
      '03:07:19.616',
      '12:34:56.789',
      '00:00:00.123'
    ];

    expectAllValid(validTimes);
  });

  it('Should reject time values where period is provided and no millisecond value', () => {
    expectAllInvalid(['11:18:09.', '11:05.']);
  });
});
