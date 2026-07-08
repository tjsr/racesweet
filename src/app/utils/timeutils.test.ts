import { afterEach, describe, expect, it, vi } from 'vitest';
import { millisecondsToTime, tableTimeStringInTimeZone } from './timeutils.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('millisecondsToTime', () => {
  it('omits the hours portion for durations under one hour', () => {
    expect(millisecondsToTime(90_250)).toBe('1:30.250');
    expect(millisecondsToTime(3_599_999)).toBe('59:59.999');
  });

  it('includes the hours portion for durations of one hour or more', () => {
    expect(millisecondsToTime(3_600_000)).toBe('01:00:00.000');
    expect(millisecondsToTime(3_690_250)).toBe('01:01:30.250');
  });
});

describe('tableTimeStringInTimeZone', () => {
  it('logs the invalid date value when formatting fails', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const invalidDate = new Date('not-a-date');

    expect(() => tableTimeStringInTimeZone(invalidDate, 'Australia/Sydney')).toThrow(RangeError);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('toString="Invalid Date", getTime=NaN'));
  });
});
