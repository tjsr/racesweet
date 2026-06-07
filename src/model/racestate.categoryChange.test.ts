import type { EventCategory } from './eventcategory.js';
import type { EventParticipant } from './eventparticipant.js';
import type { ParticipantPassingRecord } from './timerecord.js';
import { RECORD_TX_CROSSING } from './timerecord.js';
import { Session } from './racestate.js';
import { createGreenFlagEvent } from '../controllers/flag.js';

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

  it('demonstrates why rebuilding Session after category change breaks lap display caches', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fixture = await createSessionWithProcessedLaps();

    fixture.session.updateParticipantCategory(fixture.participant1Id, fixture.categoryBId);

    const rebuiltSession = new Session({
      categories: fixture.session.categories,
      participants: fixture.session.participants,
      records: fixture.session.records,
      teams: fixture.session.teams,
    });

    expect(rebuiltSession.getParticipantLaps(fixture.participant1Id)).toBeUndefined();
    expect(rebuiltSession.getParticipantLaps(fixture.participant2Id)).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
});
