import type { EventCategory } from '../model/eventcategory.js';
import type { EventParticipant } from '../model/eventparticipant.js';
import type { FlagRecord } from '../model/flag.js';
import { isPassingExcluded, isPassingValid, type ParticipantPassingRecord } from '../model/timerecord.js';
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

  it('calculates crossings after a high-sequence green flag by time of day', () => {
    const participants = new Map<string, EventParticipant>([
      ['p1', participant('p1', '101', 'team-a')],
    ]);

    const records = [
      createGreenFlagEvent({
        categoryIds: [category.id],
        flagValue: 'course',
        id: 'flag-100',
        recordType: 4,
        sequence: 100,
        source: 'test',
        time: new Date('2026-05-30T10:00:00.000Z'),
      }),
      passing('c1', 'p1', 'team-a', 1, '2026-05-30T10:06:00.000Z'),
      passing('c2', 'p1', 'team-a', 2, '2026-05-30T10:12:00.000Z'),
    ];

    const processed = processAllParticipantLaps(records, participants, 300000, true);
    const riderPassings = processed.get('p1') || [];

    expect(riderPassings).toMatchObject([
      { elapsedTime: 360000, lapNo: 1, lapTime: 360000 },
      { elapsedTime: 720000, lapNo: 2, lapTime: 360000 },
    ]);
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

  it('skips manually excluded crossings without removing them from participant lap history', () => {
    const participants = new Map<string, EventParticipant>([
      ['p1', participant('p1', '101', 'team-a')],
    ]);
    const manuallyExcludedPassing = passing('c2', 'p1', 'team-a', 3, '2026-05-30T10:12:00.000Z');
    manuallyExcludedPassing.isExcluded = true;
    manuallyExcludedPassing.isManuallyExcluded = true;

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
      manuallyExcludedPassing,
      passing('c3', 'p1', 'team-a', 4, '2026-05-30T10:18:00.000Z'),
    ];

    const processed = processAllParticipantLaps(records, participants, 300000, true);
    const riderPassings = processed.get('p1') || [];

    expect(riderPassings.map((record) => record.id)).toEqual(['c1', 'c2', 'c3']);
    expect(riderPassings[0]).toMatchObject({ lapNo: 1 });
    expect(isPassingExcluded(riderPassings[0]!)).toBe(false);
    expect(isPassingValid(riderPassings[0]!)).toBe(true);
    expect(riderPassings[1]).toMatchObject({ isExcluded: true, isManuallyExcluded: true, lapNo: undefined });
    expect(riderPassings[1]).not.toHaveProperty('isValid');
    expect(isPassingExcluded(riderPassings[1]!)).toBe(true);
    expect(isPassingValid(riderPassings[1]!)).toBe(false);
    expect(riderPassings[2]).toMatchObject({
      lapNo: 2,
      lapTime: 720000,
      startingLapRecordId: 'c1',
    });
    expect(isPassingExcluded(riderPassings[2]!)).toBe(false);
    expect(isPassingValid(riderPassings[2]!)).toBe(true);
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

    expect(riderPassings[0]).not.toHaveProperty('isValid');
    expect(riderPassings[0]).not.toHaveProperty('isExcluded');
    expect(isPassingValid(riderPassings[0]!)).toBe(false);
    expect(isPassingExcluded(riderPassings[0]!)).toBe(true);
    expect(riderPassings[0].lapNo).toBeUndefined();
    expect(isPassingValid(riderPassings[1]!)).toBe(true);
    expect(riderPassings[1].lapNo).toBe(1);
  });

  it('leaves lap metrics undefined when there are no flag records in the collection', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const participants = new Map<string, EventParticipant>([
      ['p1', participant('p1', '101', 'team-a')],
    ]);
    const crossing = passing('c1', 'p1', 'team-a', 1, '2026-05-30T10:06:00.000Z');

    const processed = processAllParticipantLaps([crossing], participants, 300000, true);
    const riderPassings = processed.get('p1') || [];

    expect(riderPassings).toHaveLength(1);
    expect(riderPassings[0]).toMatchObject({
      elapsedTime: undefined,
      lapNo: undefined,
      lapTime: undefined,
      participantStartRecordId: undefined,
      startingLapRecordId: undefined,
    });
    expect(riderPassings[0]).not.toHaveProperty('isExcluded');
    expect(riderPassings[0]).not.toHaveProperty('isValid');
    expect(isPassingExcluded(riderPassings[0]!)).toBe(true);
    expect(isPassingValid(riderPassings[0]!)).toBe(false);
    warnSpy.mockRestore();
  });

  it('skips deleted category green flags when calculating laps', () => {
    const participants = new Map<string, EventParticipant>([
      ['p1', participant('p1', '101', 'team-a')],
    ]);

    const records = [
      createGreenFlagEvent({
        categoryIds: [category.id],
        deleted: true,
        flagValue: 'course',
        id: 'flag-deleted',
        recordType: 4,
        sequence: 1,
        source: 'test',
        time: new Date('2026-05-30T10:00:00.000Z'),
      }),
      createGreenFlagEvent({
        categoryIds: [category.id],
        flagValue: 'course',
        id: 'flag-active',
        recordType: 4,
        sequence: 2,
        source: 'test',
        time: new Date('2026-05-30T10:10:00.000Z'),
      }),
      passing('c1', 'p1', 'team-a', 3, '2026-05-30T10:06:00.000Z'),
      passing('c2', 'p1', 'team-a', 4, '2026-05-30T10:16:00.000Z'),
    ];

    const processed = processAllParticipantLaps(records, participants, 300000, true);
    const riderPassings = processed.get('p1') || [];

    expect(riderPassings[0]).not.toHaveProperty('isValid');
    expect(riderPassings[0]).not.toHaveProperty('isExcluded');
    expect(isPassingValid(riderPassings[0]!)).toBe(false);
    expect(isPassingExcluded(riderPassings[0]!)).toBe(true);
    expect(riderPassings[0].lapNo).toBeUndefined();
    expect(isPassingValid(riderPassings[1]!)).toBe(true);
    expect(riderPassings[1].lapNo).toBe(1);
  });

  it('leaves crossings uncounted when the only start flag for the category is deleted', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const participants = new Map<string, EventParticipant>([
      ['p1', participant('p1', '101', 'team-a')],
    ]);
    const crossing = passing('c1', 'p1', 'team-a', 2, '2026-05-30T10:06:00.000Z');
    const records = [
      createGreenFlagEvent({
        categoryIds: [category.id],
        deleted: true,
        flagValue: 'course',
        id: 'flag-deleted-only',
        recordType: 4,
        sequence: 1,
        source: 'test',
        time: new Date('2026-05-30T10:00:00.000Z'),
      }),
      crossing,
    ];

    const processed = processAllParticipantLaps(records, participants, 300000, true);

    expect(processed.has('p1')).toBe(true);
    expect(crossing.elapsedTime).toBeUndefined();
    expect(crossing).not.toHaveProperty('isExcluded');
    expect(crossing).not.toHaveProperty('isValid');
    expect(isPassingExcluded(crossing)).toBe(true);
    expect(isPassingValid(crossing)).toBe(false);
    expect(crossing.lapNo).toBeUndefined();
    expect(crossing.lapTime).toBeUndefined();
    expect(crossing.participantStartRecordId).toBeUndefined();
    warnSpy.mockRestore();
  });

  it('uses the earliest applicable category green flag by time when multiple start flags reference the category', () => {
    const participants = new Map<string, EventParticipant>([
      ['p1', participant('p1', '101', 'team-a')],
    ]);

    const records = [
      createGreenFlagEvent({
        categoryIds: [category.id],
        flagValue: 'course',
        id: 'flag-early',
        recordType: 4,
        sequence: 1,
        source: 'test',
        time: new Date('2026-05-30T10:00:00.000Z'),
      }),
      createGreenFlagEvent({
        categoryIds: [category.id],
        flagValue: 'course',
        id: 'flag-late',
        recordType: 4,
        sequence: 2,
        source: 'test',
        time: new Date('2026-05-30T10:10:00.000Z'),
      }),
      passing('c1', 'p1', 'team-a', 3, '2026-05-30T10:06:00.000Z'),
      passing('c2', 'p1', 'team-a', 4, '2026-05-30T10:16:00.000Z'),
    ];

    const processed = processAllParticipantLaps(records, participants, 300000, true);
    const riderPassings = processed.get('p1') || [];

    expect(isPassingValid(riderPassings[0]!)).toBe(true);
    expect(riderPassings[0].elapsedTime).toBe(360000);
    expect(riderPassings[0].participantStartRecordId).toBe('flag-early');
    expect(isPassingValid(riderPassings[1]!)).toBe(true);
    expect(riderPassings[1].elapsedTime).toBe(960000);
    expect(riderPassings[1].participantStartRecordId).toBe('flag-early');
  });

  it('applies unscoped start and finish flags to every participant category', () => {
    const participants = new Map<string, EventParticipant>([
      ['p1', participant('p1', '101', 'team-a')],
    ]);
    const chequered: FlagRecord = {
      categoryIds: [],
      flagType: 'chequered',
      flagValue: 'course',
      id: 'flag-unscoped-finish',
      recordType: 4,
      sequence: 3,
      source: 'test',
      time: new Date('2026-05-30T10:11:00.000Z'),
    };
    const records = [
      createGreenFlagEvent({
        categoryIds: [],
        flagValue: 'course',
        id: 'flag-unscoped-start',
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

    expect(riderPassings.map((record) => ({
      id: record.id,
      lapNo: record.lapNo,
      participantStartRecordId: record.participantStartRecordId,
      valid: isPassingValid(record),
    }))).toEqual([
      { id: 'c1', lapNo: 1, participantStartRecordId: 'flag-unscoped-start', valid: true },
      { id: 'c2', lapNo: 2, participantStartRecordId: 'flag-unscoped-start', valid: true },
      { id: 'c3', lapNo: 2, participantStartRecordId: 'flag-unscoped-start', valid: false },
    ]);
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
    expect(isPassingValid(riderPassings[0]!)).toBe(true);
    expect(riderPassings[0].lapNo).toBe(1);
    expect(isPassingValid(riderPassings[1]!)).toBe(true);
    expect(riderPassings[1].lapNo).toBe(2);
    expect(isPassingValid(riderPassings[2]!)).toBe(false);
    expect(isPassingExcluded(riderPassings[2]!)).toBe(true);
  });

  it('treats configured line 3 passings as finish-line crossings for pit-finish sessions', () => {
    const participants = new Map<string, EventParticipant>([
      ['p1', participant('p1', '101', 'team-a')],
    ]);

    const firstFinish = passing('c1', 'p1', 'team-a', 2, '2026-05-30T10:06:00.000Z');
    firstFinish.lineNumber = 3;
    const secondFinish = passing('c2', 'p1', 'team-a', 3, '2026-05-30T10:12:00.000Z');
    secondFinish.lineNumber = 3;

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
      firstFinish,
      secondFinish,
    ];

    const processed = processAllParticipantLaps(records, participants, 300000, true, 'race', [3]);
    const riderPassings = processed.get('p1') || [];

    expect(riderPassings.map((record) => ({
      id: record.id,
      isValid: isPassingValid(record),
      lapNo: record.lapNo,
      lapTime: record.lapTime,
    }))).toEqual([
      {
        id: 'c1',
        isValid: true,
        lapNo: 1,
        lapTime: 360000,
      },
      {
        id: 'c2',
        isValid: true,
        lapNo: 2,
        lapTime: 360000,
      },
    ]);
  });
});
