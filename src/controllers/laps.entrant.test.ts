import type { EventCategory } from '../model/eventcategory.js';
import type { EventParticipant } from '../model/eventparticipant.js';
import type { FlagRecord } from '../model/flag.js';
import type { ParticipantPassingRecord } from '../model/timerecord.js';
import { createGreenFlagEvent } from './flag.js';
import { processAllParticipantLaps } from './laps.js';

const category: EventCategory = { id: '1', name: 'A' };

const participant = (id: string, racePlate: string, entrantId: string): EventParticipant => {
  return {
    categoryId: category.id,
    currentResult: undefined,
    entrantId,
    firstname: `Rider ${id}`,
    id,
    identifiers: [{ fromTime: undefined, racePlate, toTime: undefined }] as unknown as EventParticipant['identifiers'],
    lastRecordTime: null,
    resultDuration: null,
    surname: 'Test',
  };
};

const passing = (
  id: string,
  participantId: string,
  entrantId: string,
  sequence: number,
  time: string
): ParticipantPassingRecord => {
  return {
    entrantId,
    id,
    participantId,
    recordType: 16,
    sequence,
    source: 'test',
    time: new Date(time),
  } as ParticipantPassingRecord;
};

describe('processAllParticipantLaps entrant sequencing', () => {
  it('calculates laps based on entrant sequence across riders', () => {
    const participants = new Map<string, EventParticipant>([
      ['p1', participant('p1', '101', 'team-a')],
      ['p2', participant('p2', '102', 'team-a')],
    ]);

    const records = [
      createGreenFlagEvent({
        categoryIds: [category.id],
        flagValue: 'course',
        id: 'flag-1',
        recordType: 4,
        sequence: 1,
        source: 'test',
        time: new Date('2026-05-30T10:00:00.000Z'),
      }),
      passing('c1', 'p1', 'team-a', 2, '2026-05-30T10:06:00.000Z'),
      passing('c2', 'p2', 'team-a', 3, '2026-05-30T10:12:00.000Z'),
    ];

    const processed = processAllParticipantLaps(records, participants, 300000, true);
    const riderOnePassings = processed.get('p1') || [];
    const riderTwoPassings = processed.get('p2') || [];

    expect(riderOnePassings[0].lapNo).toBe(1);
    expect(riderTwoPassings[0].lapNo).toBe(2);
    expect(riderTwoPassings[0].lapTime).toBe(360000);
  });

  it('uses the previous team crossing rather than the previous rider crossing for lap time', () => {
    const participants = new Map<string, EventParticipant>([
      ['p1', participant('p1', '101', 'team-a')],
      ['p2', participant('p2', '102', 'team-a')],
    ]);

    const records = [
      createGreenFlagEvent({
        categoryIds: [category.id],
        flagValue: 'course',
        id: 'flag-1',
        recordType: 4,
        sequence: 1,
        source: 'test',
        time: new Date('2026-05-30T10:00:00.000Z'),
      }),
      passing('c1', 'p1', 'team-a', 2, '2026-05-30T10:06:00.000Z'),
      passing('c2', 'p2', 'team-a', 3, '2026-05-30T10:12:00.000Z'),
      passing('c3', 'p1', 'team-a', 4, '2026-05-30T10:18:00.000Z'),
    ];

    const processed = processAllParticipantLaps(records, participants, 300000, true);
    const riderOnePassings = processed.get('p1') || [];
    const riderTwoPassings = processed.get('p2') || [];

    expect(riderOnePassings.map((record) => record.lapNo)).toEqual([1, 3]);
    expect(riderTwoPassings[0].lapNo).toBe(2);
    expect(riderOnePassings[1].startingLapRecordId).toBe('c2');
    expect(riderOnePassings[1].lapTime).toBe(360000);
  });

  it('does not count crossings before the category green flag time', () => {
    const participants = new Map<string, EventParticipant>([
      ['p1', participant('p1', '101', 'team-a')],
    ]);

    const records = [
      createGreenFlagEvent({
        categoryIds: [category.id],
        flagValue: 'course',
        id: 'flag-1',
        recordType: 4,
        sequence: 1,
        source: 'test',
        time: new Date('2026-05-30T10:10:00.000Z'),
      }),
      passing('c1', 'p1', 'team-a', 2, '2026-05-30T10:06:00.000Z'),
      passing('c2', 'p1', 'team-a', 3, '2026-05-30T10:16:00.000Z'),
    ];

    const processed = processAllParticipantLaps(records, participants, 300000, true);
    const riderPassings = processed.get('p1') || [];

    expect(riderPassings[0].isValid).toBe(false);
    expect(riderPassings[0].isExcluded).toBe(true);
    expect(riderPassings[0].lapNo).toBeUndefined();
    expect(riderPassings[1].isValid).toBe(true);
    expect(riderPassings[1].lapNo).toBe(1);
  });

  it('counts only the first crossing after a chequered flag for applicable categories', () => {
    const participants = new Map<string, EventParticipant>([
      ['p1', participant('p1', '101', 'team-a')],
    ]);

    const chequered: FlagRecord = {
      categoryIds: [category.id],
      flagType: 'chequered',
      flagValue: 'course',
      id: 'flag-finish',
      recordType: 4,
      sequence: 3,
      source: 'test',
      time: new Date('2026-05-30T10:11:00.000Z'),
    };

    const records = [
      createGreenFlagEvent({
        categoryIds: [category.id],
        flagValue: 'course',
        id: 'flag-start',
        recordType: 4,
        sequence: 1,
        source: 'test',
        time: new Date('2026-05-30T10:00:00.000Z'),
      }),
      passing('c1', 'p1', 'team-a', 2, '2026-05-30T10:06:00.000Z'),
      chequered as unknown as ParticipantPassingRecord,
      passing('c2', 'p1', 'team-a', 4, '2026-05-30T10:12:00.000Z'),
      passing('c3', 'p1', 'team-a', 5, '2026-05-30T10:18:00.000Z'),
    ];

    const processed = processAllParticipantLaps(records, participants, 300000, true);
    const riderPassings = processed.get('p1') || [];

    expect(riderPassings.map((record) => record.id)).toEqual(['c1', 'c2', 'c3']);
    expect(riderPassings[0].isValid).toBe(true);
    expect(riderPassings[0].lapNo).toBe(1);
    expect(riderPassings[1].isValid).toBe(true);
    expect(riderPassings[1].lapNo).toBe(2);
    expect(riderPassings[2].isValid).toBe(false);
    expect(riderPassings[2].isExcluded).toBe(true);
  });
});
