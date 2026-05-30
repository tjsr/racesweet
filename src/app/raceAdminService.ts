import type { EventCategoryId } from '../model/eventcategory.js';
import type { EventEntrantId } from '../model/entrant.js';
import type { RaceStateLookup, Session } from '../model/racestate.js';

import {
  createDefaultAdministrativeChanges,
  type AdministrativeChanges,
  type RaceAdminPersistence,
} from './raceAdminPersistence.js';

export class RaceAdminService {
  private changes: AdministrativeChanges;
  private readonly persistence: RaceAdminPersistence;
  private readonly session: Session & RaceStateLookup;

  private constructor(session: Session & RaceStateLookup, persistence: RaceAdminPersistence, changes: AdministrativeChanges) {
    this.changes = changes;
    this.persistence = persistence;
    this.session = session;
  }

  public static async create(
    sessionLoader: () => Promise<Session & RaceStateLookup>,
    persistence: RaceAdminPersistence,
  ): Promise<RaceAdminService> {
    const session = await sessionLoader();
    const changes = await persistence.load();
    const service = new RaceAdminService(session, persistence, changes);
    service.applyChanges();
    return service;
  }

  public get raceState(): Session & RaceStateLookup {
    return this.session;
  }

  public async excludeCrossing(crossingId: string, exclude: boolean): Promise<void> {
    this.session.excludeCrossing(crossingId, exclude);
    this.changes = {
      ...this.changes,
      excludedCrossings: {
        ...this.changes.excludedCrossings,
        [crossingId]: exclude,
      },
    };
    await this.persistence.save(this.changes);
  }

  public async updateEntrantCategory(entrantId: EventEntrantId, categoryId: EventCategoryId): Promise<void> {
    this.session.updateEntrantCategory(entrantId, categoryId);
    this.changes = {
      ...this.changes,
      entrantCategories: {
        ...this.changes.entrantCategories,
        [entrantId]: categoryId,
      },
    };
    await this.persistence.save(this.changes);
  }

  private applyChanges(): void {
    const changes = this.changes || createDefaultAdministrativeChanges();

    Object.entries(changes.excludedCrossings).forEach(([crossingId, exclude]) => {
      this.session.excludeCrossing(crossingId, exclude);
    });

    Object.entries(changes.entrantCategories).forEach(([entrantId, categoryId]) => {
      this.session.updateEntrantCategory(entrantId, categoryId);
    });
  }
}