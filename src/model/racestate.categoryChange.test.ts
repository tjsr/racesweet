import type { EventCategory } from './eventcategory.js';
import type { EventParticipant } from './eventparticipant.js';
import type { FlagRecord } from './flag.js';
import { isPassingExcluded, isPassingValid, type ParticipantPassingRecord } from './timerecord.js';
import { createCategoryId, createEventParticipantId, createTimeRecordId, createTimeRecordSourceId } from './ids.js';
import { RECORD_TX_CROSSING } from './timerecord.js';
import { Session } from './racestate.js';
import { createGreenFlagEvent } from '../controllers/flag.js';
import { useStderrGuard } from '../testing/stderrGuard.js';

const createCategory = (id: string, name: string): EventCategory => {
  return { id, name };
};

const createParticipant = (
  id: string,
  categoryId: string,
  chipCode: number
): EventParticipant => {
  return {
    categoryId,
    currentResult: undefined,
    entrantId: id,
    firstname: `Rider ${chipCode}`,
    id,
    identifiers: [{ fromTime: undefined, toTime: undefined, txNo: chipCode }] as unknown as EventParticipant['identifiers'],
    lastRecordTime: null,
    resultDuration: null,
    surname: `Surname ${chipCode}`,
  };
};

const createChipCrossing = (
  id: string,
  chipCode: number,
  sequence: number,
  time: Date
): ParticipantPassingRecord => {
  return {
    chipCode,
    id,
    recordType: RECORD_TX_CROSSING,
    sequence,
    source: 'test-source',
    time,
  } as ParticipantPassingRecord;
};

const createSessionWithProcessedLaps = async (): Promise<{
  categoryAId: string;
  categoryBId: string;
  crossingIds: string[];
  participant1Id: string;
  participant2Id: string;
  session: Session;
}> => {
  const categoryAId = '1';
  const categoryBId = '2';

  const categories: EventCategory[] = [
    createCategory(categoryAId, 'A'),
    createCategory(categoryBId, 'B'),
  ];

  const participant1Id = '101';
  const participant2Id = '202';
  const participants: EventParticipant[] = [
    createParticipant(participant1Id, categoryAId, 100101),
    createParticipant(participant2Id, categoryAId, 100202),
  ];

  const start = new Date('2026-05-29T10:00:00.000Z');
  const categoryAStart = createGreenFlagEvent({
    categoryIds: [categoryAId],
    flagValue: 'course',
    id: '1001',
    sequence: 1,
    source: 'test-source',
    time: start,
  });
  const categoryBStart = createGreenFlagEvent({
    categoryIds: [categoryBId],
    flagValue: 'course',
    id: '1002',
    sequence: 2,
    source: 'test-source',
    time: start,
  });

  const crossingIds = ['2001', '2002', '2003', '2004'];
  const crossings: ParticipantPassingRecord[] = [
    createChipCrossing(crossingIds[0], 100101, 3, new Date('2026-05-29T10:06:00.000Z')),
    createChipCrossing(crossingIds[1], 100202, 4, new Date('2026-05-29T10:07:00.000Z')),
    createChipCrossing(crossingIds[2], 100101, 5, new Date('2026-05-29T10:12:00.000Z')),
    createChipCrossing(crossingIds[3], 100202, 6, new Date('2026-05-29T10:13:00.000Z')),
  ];

  const session = new Session({
    categories,
    participants: [],
    records: [],
    teams: [],
  });

  await session.beginBulkProcess();
  session.addParticipants(participants);
  await session.addRecords([categoryAStart, categoryBStart, ...crossings]);
  await session.endBulkProcess();

  return {
    categoryAId,
    categoryBId,
    crossingIds,
    participant1Id,
    participant2Id,
    session,
  };
};

describe('Session category change regressions', () => {
  useStderrGuard();

  it('keeps elapsed and lap times available for all riders after one rider category changes', async () => {
    const fixture = await createSessionWithProcessedLaps();

    fixture.session.updateParticipantCategory(fixture.participant1Id, fixture.categoryBId);

    const passings = fixture.session.records.filter((record) => fixture.crossingIds.includes(record.id)) as ParticipantPassingRecord[];

    passings.forEach((passing) => {
      expect(passing.elapsedTime).toBeDefined();
      expect(passing.lapTime).toBeDefined();
      expect(passing.lapNo).toBeDefined();
    });
  });

  it('keeps lap display caches when rebuilding Session after category change', async () => {
    const fixture = await createSessionWithProcessedLaps();

    fixture.session.updateParticipantCategory(fixture.participant1Id, fixture.categoryBId);

    const rebuiltSession = new Session({
      categories: fixture.session.categories,
      participants: fixture.session.participants,
      records: fixture.session.records,
      teams: fixture.session.teams,
    });

    expect(rebuiltSession.getParticipantLaps(fixture.participant1Id)?.length).toBeGreaterThan(0);
    expect(rebuiltSession.getParticipantLaps(fixture.participant2Id)?.length).toBeGreaterThan(0);
  });

  it('reprocesses laps when a flag category is assigned and removed', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const categoryAId = createCategoryId('flag-category-a');
    const categoryBId = createCategoryId('flag-category-b');
    const participantId = createEventParticipantId('flag-participant');
    const editableFlagId = createTimeRecordId('flag-editable-start');
    const crossingId = createTimeRecordId('flag-crossing');
    const source = createTimeRecordSourceId('flag-source');
    const categories: EventCategory[] = [
      createCategory(categoryAId, 'A'),
      createCategory(categoryBId, 'B'),
    ];
    const participant = createParticipant(participantId, categoryBId, 100303);
    const editableStart = createGreenFlagEvent({
      categoryIds: [categoryAId],
      flagValue: 'course',
      id: editableFlagId,
      sequence: 1,
      source,
      time: new Date('2026-05-29T10:05:00.000Z'),
    });
    const crossing = createChipCrossing(crossingId, 100303, 2, new Date('2026-05-29T10:06:00.000Z'));
    const session = new Session({
      categories,
      participants: [],
      records: [],
      teams: [],
    });

    await session.beginBulkProcess();
    session.addParticipants([participant]);
    await session.addRecords([editableStart, crossing]);
    await session.endBulkProcess();

    expect(session.getParticipantLaps(participantId)?.[0]).toMatchObject({
      elapsedTime: undefined,
      lapNo: undefined,
      lapTime: undefined,
      participantStartRecordId: undefined,
    });
    expect(isPassingExcluded(session.getParticipantLaps(participantId)?.[0]!)).toBe(true);
    expect(isPassingValid(session.getParticipantLaps(participantId)?.[0]!)).toBe(false);

    session.assignFlagCategory(editableFlagId, categoryBId);

    expect(session.getParticipantLaps(participantId)?.[0].elapsedTime).toBe(60000);

    session.removeFlagCategory(editableFlagId, categoryBId);

    expect(session.getParticipantLaps(participantId)?.[0]).toMatchObject({
      elapsedTime: undefined,
      lapNo: undefined,
      lapTime: undefined,
      participantStartRecordId: undefined,
    });
    expect(isPassingExcluded(session.getParticipantLaps(participantId)?.[0]!)).toBe(true);
    expect(isPassingValid(session.getParticipantLaps(participantId)?.[0]!)).toBe(false);

    debugSpy.mockRestore();
  });

  it('reprocesses laps when a start flag is added after crossings already exist', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const categoryId = createCategoryId('added-flag-category');
    const participantId = createEventParticipantId('added-flag-participant');
    const flagId = createTimeRecordId('added-flag-start');
    const crossingId = createTimeRecordId('added-flag-crossing');
    const source = createTimeRecordSourceId('added-flag-source');
    const participant = createParticipant(participantId, categoryId, 100606);
    const crossing = createChipCrossing(crossingId, 100606, 2, new Date('2026-05-29T10:06:00.000Z'));
    const startFlag = createGreenFlagEvent({
      categoryIds: [categoryId],
      flagValue: 'course',
      id: flagId,
      sequence: 1,
      source,
      time: new Date('2026-05-29T10:05:00.000Z'),
    });
    const session = new Session({
      categories: [createCategory(categoryId, 'A')],
      participants: [],
      records: [],
      teams: [],
    });

    await session.beginBulkProcess();
    session.addParticipants([participant]);
    await session.addRecords([crossing]);
    await session.endBulkProcess();

    expect(session.getParticipantLaps(participantId)?.[0]).toMatchObject({
      elapsedTime: undefined,
      lapNo: undefined,
      lapTime: undefined,
      participantStartRecordId: undefined,
    });
    expect(isPassingExcluded(session.getParticipantLaps(participantId)?.[0]!)).toBe(true);
    expect(isPassingValid(session.getParticipantLaps(participantId)?.[0]!)).toBe(false);

    await session.addRecords([startFlag]);

    expect(session.getParticipantLaps(participantId)?.[0]).toMatchObject({
      elapsedTime: 60000,
      lapNo: 1,
      lapTime: 60000,
      participantStartRecordId: flagId,
    });
    expect(isPassingExcluded(session.getParticipantLaps(participantId)?.[0]!)).toBe(false);
    expect(isPassingValid(session.getParticipantLaps(participantId)?.[0]!)).toBe(true);
    warnSpy.mockRestore();
  });

  it('recalculates elapsed time from the latest assigned flag after category assignment changes', async () => {
    const categoryAId = createCategoryId('latest-flag-category-a');
    const categoryBId = createCategoryId('latest-flag-category-b');
    const participantId = createEventParticipantId('latest-flag-participant');
    const earlyFlagId = createTimeRecordId('latest-flag-early-start');
    const laterFlagId = createTimeRecordId('latest-flag-later-start');
    const crossingId = createTimeRecordId('latest-flag-crossing');
    const source = createTimeRecordSourceId('latest-flag-source');
    const categories: EventCategory[] = [
      createCategory(categoryAId, 'A'),
      createCategory(categoryBId, 'B'),
    ];
    const participant = createParticipant(participantId, categoryBId, 100505);
    const earlyStart = createGreenFlagEvent({
      categoryIds: [categoryBId],
      flagValue: 'course',
      id: earlyFlagId,
      sequence: 1,
      source,
      time: new Date('2026-05-29T10:00:00.000Z'),
    });
    const laterStart = createGreenFlagEvent({
      categoryIds: [categoryAId],
      flagValue: 'course',
      id: laterFlagId,
      sequence: 2,
      source,
      time: new Date('2026-05-29T10:05:00.000Z'),
    });
    const crossing = createChipCrossing(crossingId, 100505, 3, new Date('2026-05-29T10:06:00.000Z'));
    const session = new Session({
      categories,
      participants: [],
      records: [],
      teams: [],
    });

    await session.beginBulkProcess();
    session.addParticipants([participant]);
    await session.addRecords([earlyStart, laterStart, crossing]);
    await session.endBulkProcess();

    expect(session.getParticipantLaps(participantId)?.[0].elapsedTime).toBe(360000);

    session.assignFlagCategory(laterFlagId, categoryBId);

    expect(session.getParticipantLaps(participantId)?.[0].elapsedTime).toBe(60000);
    expect(session.getParticipantLaps(participantId)?.[0].participantStartRecordId).toBe(laterFlagId);

    session.removeFlagCategory(laterFlagId, categoryBId);

    expect(session.getParticipantLaps(participantId)?.[0].elapsedTime).toBe(360000);
    expect(session.getParticipantLaps(participantId)?.[0].participantStartRecordId).toBe(earlyFlagId);
  });

  it('reprocesses laps when a flag is marked deleted and restored', async () => {
    const categoryId = createCategoryId('deleted-flag-category');
    const participantId = createEventParticipantId('deleted-flag-participant');
    const flagId = createTimeRecordId('deleted-flag-start');
    const crossingId = createTimeRecordId('deleted-flag-crossing');
    const source = createTimeRecordSourceId('deleted-flag-source');
    const participant = createParticipant(participantId, categoryId, 100404);
    const flag = createGreenFlagEvent({
      categoryIds: [categoryId],
      flagValue: 'course',
      id: flagId,
      sequence: 1,
      source,
      time: new Date('2026-05-29T10:05:00.000Z'),
    });
    const crossing = createChipCrossing(crossingId, 100404, 2, new Date('2026-05-29T10:06:00.000Z'));
    const session = new Session({
      categories: [createCategory(categoryId, 'A')],
      participants: [],
      records: [],
      teams: [],
    });

    await session.beginBulkProcess();
    session.addParticipants([participant]);
    await session.addRecords([flag, crossing]);
    await session.endBulkProcess();

    expect(session.getParticipantLaps(participantId)?.[0].elapsedTime).toBe(60000);

    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);

    session.markFlagDeleted(flagId, true);

    expect(session.getParticipantLaps(participantId)?.[0]).toMatchObject({
      elapsedTime: undefined,
      lapNo: undefined,
      lapTime: undefined,
      participantStartRecordId: undefined,
      startingLapRecordId: undefined,
    });
    expect(isPassingExcluded(session.getParticipantLaps(participantId)?.[0]!)).toBe(true);
    expect(isPassingValid(session.getParticipantLaps(participantId)?.[0]!)).toBe(false);
    expect((session.records.find((record) => record.id === flagId) as FlagRecord | undefined)?.deleted).toBe(true);

    session.markFlagDeleted(flagId, false);

    expect(session.getParticipantLaps(participantId)?.[0].elapsedTime).toBe(60000);
    expect((session.records.find((record) => record.id === flagId) as FlagRecord | undefined)?.deleted).toBe(false);

    debugSpy.mockRestore();
  });

  it('reprocesses laps when a start flag time changes', async () => {
    const categoryId = createCategoryId('retimed-flag-category');
    const participantId = createEventParticipantId('retimed-flag-participant');
    const flagId = createTimeRecordId('retimed-flag-start');
    const crossingId = createTimeRecordId('retimed-flag-crossing');
    const source = createTimeRecordSourceId('retimed-flag-source');
    const participant = createParticipant(participantId, categoryId, 100707);
    const flag = createGreenFlagEvent({
      categoryIds: [categoryId],
      flagValue: 'course',
      id: flagId,
      sequence: 1,
      source,
      time: new Date('2026-05-29T10:00:00.000Z'),
    });
    const crossing = createChipCrossing(crossingId, 100707, 2, new Date('2026-05-29T10:06:00.000Z'));
    const session = new Session({
      categories: [createCategory(categoryId, 'A')],
      participants: [],
      records: [],
      teams: [],
    });

    await session.beginBulkProcess();
    session.addParticipants([participant]);
    await session.addRecords([flag, crossing]);
    await session.endBulkProcess();

    expect(session.getParticipantLaps(participantId)?.[0].elapsedTime).toBe(360000);

    const storedFlag = session.records.find((record) => record.id === flagId) as FlagRecord | undefined;
    expect(storedFlag).toBeDefined();
    storedFlag!.time = new Date('2026-05-29T10:05:00.000Z');

    session.markFlagDeleted(flagId, false);

    expect(session.getParticipantLaps(participantId)?.[0]).toMatchObject({
      elapsedTime: 60000,
      lapNo: 1,
      lapTime: 60000,
      participantStartRecordId: flagId,
    });
    expect(isPassingExcluded(session.getParticipantLaps(participantId)?.[0]!)).toBe(false);
    expect(isPassingValid(session.getParticipantLaps(participantId)?.[0]!)).toBe(true);
  });
});
