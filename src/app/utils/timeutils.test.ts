import { describe, expect, it } from 'vitest';
import { millisecondsToTime } from './timeutils.js';

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
