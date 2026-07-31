import { Session } from '../model/racestate.js';
import { RECORD_TX_CROSSING, type ParticipantPassingRecord, type TimeRecord } from '../model/timerecord.js';
import { compareTimes, hasTime } from './timerecord.js';

describe('timing record time validation', () => {
  it('sorts malformed timestamps after valid timestamps without throwing', () => {
    const validTime = new Date('2026-07-31T10:00:00.000Z');
    const malformedTime = '2026-07-31T10:01:00.000Z' as unknown as Date;

    expect(compareTimes(validTime, malformedTime)).toBeLessThan(0);
    expect(compareTimes(malformedTime, validTime)).toBeGreaterThan(0);
    expect(compareTimes(null, validTime)).toBeGreaterThan(0);
    expect(hasTime({ time: malformedTime } as TimeRecord)).toBe(false);
  });

  it('loads a session containing a malformed record timestamp without breaking record access', () => {
    const session = new Session({
      categories: [],
      participants: [],
      records: [
        {
          chipCode: 101,
          id: 'valid-record',
          recordType: RECORD_TX_CROSSING,
          sequence: 1,
          source: 'test-source',
          time: new Date('2026-07-31T10:00:00.000Z'),
        } as ParticipantPassingRecord,
        {
          chipCode: 103,
          id: 'null-time-record',
          recordType: RECORD_TX_CROSSING,
          sequence: 3,
          source: 'test-source',
          time: null as unknown as Date,
        } as ParticipantPassingRecord,
        {
          chipCode: 102,
          id: 'malformed-record',
          recordType: RECORD_TX_CROSSING,
          sequence: 2,
          source: 'test-source',
          time: '2026-07-31T10:01:00.000Z' as unknown as Date,
        } as ParticipantPassingRecord,
      ],
      teams: [],
    });

    expect(session.records.map((record: TimeRecord) => record.id)).toEqual(['valid-record', 'null-time-record', 'malformed-record']);
    expect(session.records[1]?.time).toBeUndefined();
    expect(session.records[2]?.time).toBeUndefined();
  });
});
