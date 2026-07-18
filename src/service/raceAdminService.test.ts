import {
  type AdministrativeChanges,
  type RaceAdminPersistence,
  createDefaultAdministrativeChanges,
} from '../persistence/raceAdminPersistence.js';
import type { EventCategoryId } from '../model/eventcategory.js';
import type { EventEntrantId } from '../model/entrant.js';
import type { SessionId } from '../model/raceevent.js';
import type { EventTimeRecord, TimeRecordId } from '../model/timerecord.js';
import { RaceAdminService } from '../service/raceAdminService.js';

const createSessionDouble = () => {
  const addedRecords: EventTimeRecord[] = [];
  const bulkEvents: string[] = [];
  const excluded: Record<string, boolean> = {};
  const entrantCategories: Record<string, string> = {};
  const flagCategoryAssignments: Array<{ categoryId: string; flagId: string }> = [];
  const flagCategoryRemovals: Array<{ categoryId: string; flagId: string }> = [];
  const flagDeleted: Record<string, boolean> = {};
  const updatedRecords: EventTimeRecord[] = [];

  const session = {
    assignFlagCategory: (flagId: TimeRecordId, categoryId: EventCategoryId): void => {
      flagCategoryAssignments.push({ categoryId, flagId });
    },
    addRecords: async (records: EventTimeRecord[]): Promise<void> => {
      addedRecords.push(...records);
    },
    beginBulkProcess: async (): Promise<boolean> => {
      bulkEvents.push('begin');
      return true;
    },
    endBulkProcess: async (): Promise<void> => {
      bulkEvents.push('end');
    },
    excludeCrossing: (crossingId: string, exclude: boolean): void => {
      excluded[crossingId] = exclude;
    },
    markFlagDeleted: (flagId: TimeRecordId, deleted: boolean): void => {
      flagDeleted[flagId] = deleted;
    },
    removeFlagCategory: (flagId: TimeRecordId, categoryId: EventCategoryId): void => {
      flagCategoryRemovals.push({ categoryId, flagId });
    },
    updateRecord: (record: EventTimeRecord): void => {
      updatedRecords.push(record);
    },
    updateEntrantCategory: (entrantId: EventEntrantId, categoryId: EventCategoryId): void => {
      entrantCategories[entrantId] = categoryId;
    },
  };

  return { addedRecords, bulkEvents, entrantCategories, excluded, flagCategoryAssignments, flagCategoryRemovals, flagDeleted, session, updatedRecords };
};

class MemoryPersistence implements RaceAdminPersistence {
  private changes: AdministrativeChanges;

  public constructor(initial?: AdministrativeChanges) {
    this.changes = initial || createDefaultAdministrativeChanges();
  }

  public async load(): Promise<AdministrativeChanges> {
    return this.changes;
  }

  public async save(changes: AdministrativeChanges): Promise<void> {
    this.changes = changes;
  }

  public get snapshot(): AdministrativeChanges {
    return this.changes;
  }
}

describe('RaceAdminService', () => {
  it('applies persisted changes during creation', async () => {
    const sessionDouble = createSessionDouble();
    const persistence = new MemoryPersistence({
      entrantCategories: { team1: 'cat-b' },
      excludedCrossings: { crossing1: true },
      addedRecords: [{
        record: { id: 'record-1', recordType: 16, sequence: 1, sessionId: 'session-a', source: 'manual-source' } as EventTimeRecord,
        sessionId: 'session-a' as SessionId,
      }],
      flagCategoryChanges: [
        { action: 'assign', categoryId: 'cat-b', flagId: 'flag-1' },
        { action: 'remove', categoryId: 'cat-a', flagId: 'flag-1' },
      ],
      flagDeleted: { 'flag-1': true },
      schemaVersion: 1,
      updatedRecords: [{
        record: { id: 'record-1', recordType: 16, sequence: 1, sessionId: 'session-a', source: 'manual-source', time: new Date('2026-05-29T10:00:00.000Z') } as EventTimeRecord,
        sessionId: 'session-a' as SessionId,
      }],
    });

    await RaceAdminService.create(async () => sessionDouble.session as never, persistence, 'session-a');

    expect(sessionDouble.addedRecords).toEqual([
      expect.objectContaining({ id: 'record-1' }),
    ]);
    expect(sessionDouble.updatedRecords).toEqual([
      expect.objectContaining({ id: 'record-1' }),
    ]);
    expect(sessionDouble.excluded.crossing1).toBe(true);
    expect(sessionDouble.entrantCategories.team1).toBe('cat-b');
    expect(sessionDouble.flagDeleted['flag-1']).toBe(true);
    expect(sessionDouble.flagCategoryAssignments).toEqual([{ categoryId: 'cat-b', flagId: 'flag-1' }]);
    expect(sessionDouble.flagCategoryRemovals).toEqual([{ categoryId: 'cat-a', flagId: 'flag-1' }]);
    expect(sessionDouble.bulkEvents).toEqual(['begin', 'end']);
  });

  it('applies stored changes to a displayed session in one bulk replay', async () => {
    const activeSessionDouble = createSessionDouble();
    const displayedSessionDouble = createSessionDouble();
    const persistence = new MemoryPersistence({
      entrantCategories: { team1: 'cat-b' },
      excludedCrossings: { crossing1: true },
      addedRecords: [
        {
          record: { id: 'record-1', recordType: 16, sequence: 1, sessionId: 'session-b', source: 'manual-source' } as EventTimeRecord,
          sessionId: 'session-b' as SessionId,
        },
        {
          record: { id: 'record-2', recordType: 16, sequence: 2, sessionId: 'session-b', source: 'manual-source' } as EventTimeRecord,
          sessionId: 'session-b' as SessionId,
        },
      ],
      flagCategoryChanges: [{ action: 'assign', categoryId: 'cat-b', flagId: 'flag-1' }],
      flagDeleted: { 'flag-1': true },
      schemaVersion: 1,
      updatedRecords: [],
    });
    const service = await RaceAdminService.create(async () => activeSessionDouble.session as never, persistence, 'session-a');

    await service.applyChangesToSessionById(displayedSessionDouble.session as never, 'session-b');

    expect(displayedSessionDouble.addedRecords.map((record) => record.id)).toEqual(['record-1', 'record-2']);
    expect(displayedSessionDouble.excluded.crossing1).toBe(true);
    expect(displayedSessionDouble.flagCategoryAssignments).toEqual([{ categoryId: 'cat-b', flagId: 'flag-1' }]);
    expect(displayedSessionDouble.bulkEvents).toEqual(['begin', 'end']);
  });

  it('persists entrant category updates', async () => {
    const sessionDouble = createSessionDouble();
    const persistence = new MemoryPersistence();

    const service = await RaceAdminService.create(async () => sessionDouble.session as never, persistence);
    await service.updateEntrantCategory('team2', 'cat-c');

    expect(sessionDouble.entrantCategories.team2).toBe('cat-c');
    expect(persistence.snapshot.entrantCategories.team2).toBe('cat-c');
  });

  it('persists crossing exclusion updates', async () => {
    const sessionDouble = createSessionDouble();
    const persistence = new MemoryPersistence();

    const service = await RaceAdminService.create(async () => sessionDouble.session as never, persistence);
    await service.excludeCrossing('crossing2', true);

    expect(sessionDouble.excluded.crossing2).toBe(true);
    expect(persistence.snapshot.excludedCrossings.crossing2).toBe(true);
  });

  it('persists manual record additions for a specific session', async () => {
    const sessionDouble = createSessionDouble();
    const persistence = new MemoryPersistence();
    const service = await RaceAdminService.create(async () => sessionDouble.session as never, persistence, 'session-a');
    const record = {
      id: 'record-2',
      recordType: 16,
      sequence: 2,
      sessionId: 'session-a',
      source: 'manual-source',
    } as EventTimeRecord;

    await service.addRecordForSession(sessionDouble.session as never, 'session-a', record);

    expect(sessionDouble.addedRecords).toEqual([record]);
    expect(persistence.snapshot.addedRecords).toEqual([{ record, sessionId: 'session-a' }]);
  });

  it('persists generated missing crossings as included session records', async () => {
    const sessionDouble = createSessionDouble();
    const persistence = new MemoryPersistence();
    const service = await RaceAdminService.create(async () => sessionDouble.session as never, persistence, 'session-a');
    const record = {
      generatedReason: 'missing-crossing',
      id: 'record-generated',
      isGenerated: true,
      participantId: 'participant-1',
      recordType: 16,
      sequence: 2,
      sessionId: 'session-a',
      source: 'generated-missing-crossing',
    } as EventTimeRecord;

    await service.addRecordForSession(sessionDouble.session as never, 'session-a', record);

    expect(sessionDouble.addedRecords).toEqual([record]);
    expect(persistence.snapshot.addedRecords).toEqual([{ record, sessionId: 'session-a' }]);
    expect(record).not.toHaveProperty('isExcluded');
  });

  it('persists manual record edits for a specific session', async () => {
    const sessionDouble = createSessionDouble();
    const persistence = new MemoryPersistence();
    const service = await RaceAdminService.create(async () => sessionDouble.session as never, persistence, 'session-a');
    const record = {
      id: 'record-3',
      recordType: 16,
      sequence: 3,
      sessionId: 'session-a',
      source: 'manual-source',
    } as EventTimeRecord;

    await service.updateRecordForSession(sessionDouble.session as never, 'session-a', record);

    expect(sessionDouble.updatedRecords).toEqual([record]);
    expect(persistence.snapshot.updatedRecords).toEqual([{ record, sessionId: 'session-a' }]);
  });

  it('persists flag deletion updates', async () => {
    const sessionDouble = createSessionDouble();
    const persistence = new MemoryPersistence();

    const service = await RaceAdminService.create(async () => sessionDouble.session as never, persistence);
    await service.markFlagDeletedForSession(sessionDouble.session as never, 'flag-2', true);

    expect(sessionDouble.flagDeleted['flag-2']).toBe(true);
    expect(persistence.snapshot.flagDeleted['flag-2']).toBe(true);
  });

  it('persists flag category assignment updates', async () => {
    const sessionDouble = createSessionDouble();
    const persistence = new MemoryPersistence();

    const service = await RaceAdminService.create(async () => sessionDouble.session as never, persistence);
    await service.assignFlagCategoryForSession(sessionDouble.session as never, 'flag-3', 'cat-c');
    await service.removeFlagCategoryForSession(sessionDouble.session as never, 'flag-3', 'cat-a');

    expect(sessionDouble.flagCategoryAssignments).toEqual([{ categoryId: 'cat-c', flagId: 'flag-3' }]);
    expect(sessionDouble.flagCategoryRemovals).toEqual([{ categoryId: 'cat-a', flagId: 'flag-3' }]);
    expect(persistence.snapshot.flagCategoryChanges).toEqual([
      { action: 'assign', categoryId: 'cat-c', flagId: 'flag-3' },
      { action: 'remove', categoryId: 'cat-a', flagId: 'flag-3' },
    ]);
  });

  it('applies and persists changes against a displayed session state', async () => {
    const activeSessionDouble = createSessionDouble();
    const displayedSessionDouble = createSessionDouble();
    const persistence = new MemoryPersistence({
      entrantCategories: { team1: 'cat-b' },
      excludedCrossings: { crossing1: true },
      addedRecords: [{
        record: { id: 'record-1', recordType: 16, sequence: 1, sessionId: 'session-a', source: 'manual-source' } as EventTimeRecord,
        sessionId: 'session-a' as SessionId,
      }],
      flagCategoryChanges: [{ action: 'assign', categoryId: 'cat-b', flagId: 'flag-1' }],
      flagDeleted: { 'flag-1': true },
      schemaVersion: 1,
      updatedRecords: [{
        record: { id: 'record-1', recordType: 16, sequence: 1, sessionId: 'session-a', source: 'manual-source' } as EventTimeRecord,
        sessionId: 'session-a' as SessionId,
      }],
    });

    const service = await RaceAdminService.create(async () => activeSessionDouble.session as never, persistence, 'session-a');
    await service.applyChangesToSessionById(displayedSessionDouble.session as never, 'session-b');
    await service.excludeCrossingForSession(displayedSessionDouble.session as never, 'crossing2', true);
    await service.updateEntrantCategoryForSession(displayedSessionDouble.session as never, 'team2', 'cat-c');
    await service.markFlagDeletedForSession(displayedSessionDouble.session as never, 'flag-2', true);
    await service.assignFlagCategoryForSession(displayedSessionDouble.session as never, 'flag-2', 'cat-d');

    expect(displayedSessionDouble.excluded.crossing1).toBe(true);
    expect(displayedSessionDouble.addedRecords).toEqual([]);
    expect(displayedSessionDouble.updatedRecords).toEqual([]);
    expect(displayedSessionDouble.excluded.crossing2).toBe(true);
    expect(displayedSessionDouble.entrantCategories.team1).toBe('cat-b');
    expect(displayedSessionDouble.entrantCategories.team2).toBe('cat-c');
    expect(displayedSessionDouble.flagDeleted['flag-1']).toBe(true);
    expect(displayedSessionDouble.flagDeleted['flag-2']).toBe(true);
    expect(displayedSessionDouble.flagCategoryAssignments).toEqual([
      { categoryId: 'cat-b', flagId: 'flag-1' },
      { categoryId: 'cat-d', flagId: 'flag-2' },
    ]);
    expect(activeSessionDouble.excluded.crossing2).toBeUndefined();
    expect(activeSessionDouble.addedRecords).toEqual([
      expect.objectContaining({ id: 'record-1' }),
    ]);
    expect(activeSessionDouble.updatedRecords).toEqual([
      expect.objectContaining({ id: 'record-1' }),
    ]);
    expect(activeSessionDouble.entrantCategories.team2).toBeUndefined();
    expect(activeSessionDouble.flagDeleted['flag-2']).toBeUndefined();
    expect(persistence.snapshot.excludedCrossings.crossing2).toBe(true);
    expect(persistence.snapshot.entrantCategories.team2).toBe('cat-c');
    expect(persistence.snapshot.flagDeleted['flag-2']).toBe(true);
    expect(persistence.snapshot.flagCategoryChanges).toEqual([
      { action: 'assign', categoryId: 'cat-b', flagId: 'flag-1' },
      { action: 'assign', categoryId: 'cat-d', flagId: 'flag-2' },
    ]);
  });
});
