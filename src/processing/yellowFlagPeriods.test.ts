import { describe, expect, it } from 'vitest';
import { calculateYellowFlagPeriods } from './yellowFlagPeriods.js';
import type { FlagRecord } from '../model/flag.js';
import { createTimeRecordId, createTimeRecordSourceId } from '../model/ids.js';
import { EVENT_FLAG_DISPLAYED } from '../model/timerecord.js';

const source = createTimeRecordSourceId('yellow-period-test');
const at = (seconds: number): Date => new Date(`2026-06-12T10:00:${String(seconds).padStart(2, '0')}.000Z`);

describe('calculateYellowFlagPeriods', () => {
  it('pairs yellow flags with a green removal and reports leader laps and duration', () => {
    const periods = calculateYellowFlagPeriods(
      [
        { flagType: 'yellow', flagValue: 'caution', id: createTimeRecordId('yellow'), recordType: EVENT_FLAG_DISPLAYED, sequence: 1, source, time: at(10) } as FlagRecord,
        { flagType: 'green', flagValue: 'course', id: createTimeRecordId('green'), indicatesRaceStart: false, recordType: EVENT_FLAG_DISPLAYED, sequence: 2, source, time: at(25) } as FlagRecord,
      ],
      [{ name: 'Rick MEARS', laps: [{ id: 'lap-1', lapNo: 2, isValid: true, recordType: 16, sequence: 1, source, time: at(8) }] }],
    );

    expect(periods).toHaveLength(1);
    expect(periods[0]).toMatchObject({ fromLap: 2, duration: 15_000, leaderAtFlag: 'Rick MEARS', untilLap: 2 });
    expect(periods[0].fromTime).toEqual(at(10));
    expect(periods[0].untilTime).toEqual(at(25));
  });

  it('recognises a retracted yellow record as the removal and filters by category', () => {
    const periods = calculateYellowFlagPeriods(
      [
        { categoryIds: ['other-category'], flagType: 'yellow', flagValue: 'caution', id: createTimeRecordId('other-yellow'), recordType: EVENT_FLAG_DISPLAYED, sequence: 1, source, time: at(1) } as FlagRecord,
        { categoryIds: ['category-a'], flagType: 'yellow', flagValue: 'caution', id: createTimeRecordId('yellow-a'), recordType: EVENT_FLAG_DISPLAYED, sequence: 2, source, time: at(2) } as FlagRecord,
        { categoryIds: ['category-a'], flagType: 'yellow', flagValue: 'caution', id: createTimeRecordId('yellow-a-removal'), recordType: EVENT_FLAG_DISPLAYED | 8, sequence: 3, source, time: at(5) } as FlagRecord,
      ],
      [],
      'category-a',
    );

    expect(periods).toHaveLength(1);
    expect(periods[0].duration).toBe(3_000);
  });
});
