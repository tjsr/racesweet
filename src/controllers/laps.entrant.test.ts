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
    expect(riderPassings[0]).toMatchObject({ isExcluded: false, isValid: true, lapNo: 1 });
    expect(riderPassings[1]).toMatchObject({ isExcluded: true, isManuallyExcluded: true, isValid: false, lapNo: undefined });
    expect(riderPassings[2]).toMatchObject({
      isExcluded: false,
      isValid: true,
      lapNo: 2,
      lapTime: 720000,
      startingLapRecordId: 'c1',
    });
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
      isExcluded: true,
      isValid: false,
      lapNo: undefined,
      lapTime: undefined,
      participantStartRecordId: undefined,
      startingLapRecordId: undefined,
    });
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

    expect(riderPassings[0].isValid).toBe(false);
    expect(riderPassings[0].isExcluded).toBe(true);
    expect(riderPassings[0].lapNo).toBeUndefined();
    expect(riderPassings[1].isValid).toBe(true);
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
    expect(crossing.isExcluded).toBe(true);
    expect(crossing.isValid).toBe(false);
    expect(crossing.lapNo).toBeUndefined();
    expect(crossing.lapTime).toBeUndefined();
    expect(crossing.participantStartRecordId).toBeUndefined();
    warnSpy.mockRestore();
  });

  it('uses the latest applicable category green flag when multiple start flags reference the category', () => {
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

    expect(riderPassings[0].isValid).toBe(false);
    expect(riderPassings[0].elapsedTime).toBeUndefined();
    expect(riderPassings[1].isValid).toBe(true);
    expect(riderPassings[1].elapsedTime).toBe(360000);
    expect(riderPassings[1].participantStartRecordId).toBe('flag-late');
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
