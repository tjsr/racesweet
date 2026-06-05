import {
  type AdministrativeChanges,
  type RaceAdminPersistence,
  createDefaultAdministrativeChanges,
} from './raceAdminPersistence.js';
import type { EventCategoryId } from '../model/eventcategory.js';
import type { EventEntrantId } from '../model/entrant.js';
import { RaceAdminService } from './raceAdminService.js';

const createSessionDouble = () => {
  const excluded: Record<string, boolean> = {};
  const entrantCategories: Record<string, string> = {};

  const session = {
    excludeCrossing: (crossingId: string, exclude: boolean): void => {
      excluded[crossingId] = exclude;
    },
    updateEntrantCategory: (entrantId: EventEntrantId, categoryId: EventCategoryId): void => {
      entrantCategories[entrantId] = categoryId;
    },
  };

  return { entrantCategories, excluded, session };
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
      schemaVersion: 1,
    });

    await RaceAdminService.create(async () => sessionDouble.session as never, persistence);

    expect(sessionDouble.excluded.crossing1).toBe(true);
    expect(sessionDouble.entrantCategories.team1).toBe('cat-b');
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

  it('applies and persists changes against a displayed session state', async () => {
    const activeSessionDouble = createSessionDouble();
    const displayedSessionDouble = createSessionDouble();
    const persistence = new MemoryPersistence({
      entrantCategories: { team1: 'cat-b' },
      excludedCrossings: { crossing1: true },
      schemaVersion: 1,
    });

    const service = await RaceAdminService.create(async () => activeSessionDouble.session as never, persistence);
    service.applyChangesToSession(displayedSessionDouble.session as never);
    await service.excludeCrossingForSession(displayedSessionDouble.session as never, 'crossing2', true);
    await service.updateEntrantCategoryForSession(displayedSessionDouble.session as never, 'team2', 'cat-c');

    expect(displayedSessionDouble.excluded.crossing1).toBe(true);
    expect(displayedSessionDouble.excluded.crossing2).toBe(true);
    expect(displayedSessionDouble.entrantCategories.team1).toBe('cat-b');
    expect(displayedSessionDouble.entrantCategories.team2).toBe('cat-c');
    expect(activeSessionDouble.excluded.crossing2).toBeUndefined();
    expect(activeSessionDouble.entrantCategories.team2).toBeUndefined();
    expect(persistence.snapshot.excludedCrossings.crossing2).toBe(true);
    expect(persistence.snapshot.entrantCategories.team2).toBe('cat-c');
  });
});
