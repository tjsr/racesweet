import {
  type AdministrativeChanges,
  type AddedSessionRecord,
  type RaceAdminPersistence,
  type UpdatedSessionRecord,
  createDefaultAdministrativeChanges,
} from './raceAdminPersistence.js';
import type { RaceStateLookup, Session } from '../model/racestate.js';
import type { EventCategoryId } from '../model/eventcategory.js';
import type { EventEntrantId } from '../model/entrant.js';
import type { SessionId } from '../model/raceevent.js';
import type { EventTimeRecord, TimeRecordId } from '../model/timerecord.js';

export class RaceAdminService {
  private changes: AdministrativeChanges;
  private readonly persistence: RaceAdminPersistence;
  private readonly sessionId: SessionId | undefined;
  private readonly session: Session & RaceStateLookup;

  private constructor(
    session: Session & RaceStateLookup,
    persistence: RaceAdminPersistence,
    changes: AdministrativeChanges,
    sessionId?: SessionId
  ) {
    this.changes = changes;
    this.persistence = persistence;
    this.sessionId = sessionId;
    this.session = session;
  }

  public static async create(
    sessionLoader: () => Promise<Session & RaceStateLookup>,
    persistence: RaceAdminPersistence,
    sessionId?: SessionId
  ): Promise<RaceAdminService> {
    const session = await sessionLoader();
    const changes = await persistence.load();
    const service = new RaceAdminService(session, persistence, changes, sessionId);
    service.applyChanges();
    return service;
  }

  public get raceState(): Session & RaceStateLookup {
    return this.session;
  }

  public async excludeCrossing(crossingId: string, exclude: boolean): Promise<void> {
    this.excludeCrossingInSession(this.session, crossingId, exclude);
    this.changes = {
      ...this.changes,
      excludedCrossings: {
        ...this.changes.excludedCrossings,
        [crossingId]: exclude,
      },
    };
    await this.persistence.save(this.changes);
  }

  public async excludeCrossingForSession(session: Session & RaceStateLookup, crossingId: string, exclude: boolean): Promise<void> {
    this.excludeCrossingInSession(session, crossingId, exclude);
    this.changes = {
      ...this.changes,
      excludedCrossings: {
        ...this.changes.excludedCrossings,
        [crossingId]: exclude,
      },
    };
    await this.persistence.save(this.changes);
  }

  public async assignFlagCategoryForSession(session: Session & RaceStateLookup, flagId: TimeRecordId, categoryId: EventCategoryId): Promise<void> {
    this.assignFlagCategoryInSession(session, flagId, categoryId);
    this.changes = {
      ...this.changes,
      flagCategoryChanges: [
        ...this.changes.flagCategoryChanges,
        { action: 'assign', categoryId, flagId },
      ],
    };
    await this.persistence.save(this.changes);
  }

  public applyChangesToSession(session: Session & RaceStateLookup): void {
    this.applyChanges(session);
  }

  public applyChangesToSessionById(session: Session & RaceStateLookup, sessionId: SessionId | undefined): void {
    this.applyChanges(session, sessionId);
  }

  public async addRecordForSession(
    session: Session & RaceStateLookup,
    sessionId: SessionId,
    record: EventTimeRecord
  ): Promise<void> {
    await this.addRecordInSession(session, record);
    this.changes = {
      ...this.changes,
      addedRecords: [
        ...this.changes.addedRecords,
        { record, sessionId },
      ],
    };
    await this.persistence.save(this.changes);
  }

  public async updateRecordForSession(
    session: Session & RaceStateLookup,
    sessionId: SessionId,
    record: EventTimeRecord
  ): Promise<void> {
    this.updateRecordInSession(session, record);
    this.changes = {
      ...this.changes,
      updatedRecords: [
        ...this.changes.updatedRecords.filter((entry) => entry.record.id !== record.id),
        { record, sessionId },
      ],
    };
    await this.persistence.save(this.changes);
  }

  public async markFlagDeletedForSession(session: Session & RaceStateLookup, flagId: TimeRecordId, deleted: boolean): Promise<void> {
    this.markFlagDeletedInSession(session, flagId, deleted);
    this.changes = {
      ...this.changes,
      flagDeleted: {
        ...this.changes.flagDeleted,
        [flagId]: deleted,
      },
    };
    await this.persistence.save(this.changes);
  }

  public async removeFlagCategoryForSession(session: Session & RaceStateLookup, flagId: TimeRecordId, categoryId: EventCategoryId): Promise<void> {
    this.removeFlagCategoryInSession(session, flagId, categoryId);
    this.changes = {
      ...this.changes,
      flagCategoryChanges: [
        ...this.changes.flagCategoryChanges,
        { action: 'remove', categoryId, flagId },
      ],
    };
    await this.persistence.save(this.changes);
  }

  public async updateEntrantCategory(entrantId: EventEntrantId, categoryId: EventCategoryId): Promise<void> {
    this.updateEntrantCategoryInSession(this.session, entrantId, categoryId);
    this.changes = {
      ...this.changes,
      entrantCategories: {
        ...this.changes.entrantCategories,
        [entrantId]: categoryId,
      },
    };
    await this.persistence.save(this.changes);
  }

  public async updateEntrantCategoryForSession(session: Session & RaceStateLookup, entrantId: EventEntrantId, categoryId: EventCategoryId): Promise<void> {
    this.updateEntrantCategoryInSession(session, entrantId, categoryId);
    this.changes = {
      ...this.changes,
      entrantCategories: {
        ...this.changes.entrantCategories,
        [entrantId]: categoryId,
      },
    };
    await this.persistence.save(this.changes);
  }

  private applyChanges(session: Session & RaceStateLookup = this.session, sessionId: SessionId | undefined = this.sessionId): void {
    const changes = this.changes || createDefaultAdministrativeChanges();

    changes.addedRecords
      .filter((entry) => this.shouldApplyRecordToSession(entry, sessionId))
      .forEach((entry) => {
        this.applyStoredRecordChange(session, entry.record);
      });

    changes.updatedRecords
      .filter((entry) => this.shouldApplyUpdatedRecordToSession(entry, sessionId))
      .forEach((entry) => {
        this.applyStoredUpdatedRecordChange(session, entry.record);
      });

    Object.entries(changes.flagDeleted).forEach(([flagId, deleted]) => {
      this.applyStoredFlagChange(() => this.markFlagDeletedInSession(session, flagId, deleted));
    });

    changes.flagCategoryChanges.forEach((change) => {
      if (change.action === 'assign') {
        this.applyStoredFlagChange(() => this.assignFlagCategoryInSession(session, change.flagId, change.categoryId));
      } else {
        this.applyStoredFlagChange(() => this.removeFlagCategoryInSession(session, change.flagId, change.categoryId));
      }
    });

    Object.entries(changes.entrantCategories).forEach(([entrantId, categoryId]) => {
      this.updateEntrantCategoryInSession(session, entrantId, categoryId);
    });

    Object.entries(changes.excludedCrossings).forEach(([crossingId, exclude]) => {
      this.excludeCrossingInSession(session, crossingId, exclude);
    });
  }

  private assignFlagCategoryInSession(session: Session & RaceStateLookup, flagId: TimeRecordId, categoryId: EventCategoryId): void {
    session.assignFlagCategory?.(flagId, categoryId);
  }

  private applyStoredRecordChange(session: Session & RaceStateLookup, record: EventTimeRecord): void {
    this.addRecordInSession(session, record).catch((_error: unknown) => {
      // Saved admin changes are replayed across session reloads; ignore records that cannot be re-added here.
    });
  }

  private applyStoredUpdatedRecordChange(session: Session & RaceStateLookup, record: EventTimeRecord): void {
    try {
      this.updateRecordInSession(session, record);
    } catch (_error: unknown) {
      // Saved admin changes are replayed across session reloads; ignore records that cannot be updated here.
    }
  }

  private applyStoredFlagChange(applyChange: () => void): void {
    try {
      applyChange();
    } catch (_error: unknown) {
      // Saved admin changes are replayed across sessions; ignore flag edits that do not apply to this session.
    }
  }

  private excludeCrossingInSession(session: Session & RaceStateLookup, crossingId: string, exclude: boolean): void {
    session.excludeCrossing(crossingId, exclude);
  }

  private markFlagDeletedInSession(session: Session & RaceStateLookup, flagId: TimeRecordId, deleted: boolean): void {
    session.markFlagDeleted?.(flagId, deleted);
  }

  private async addRecordInSession(session: Session & RaceStateLookup, record: EventTimeRecord): Promise<void> {
    await session.addRecords([record]);
  }

  private shouldApplyUpdatedRecordToSession(entry: UpdatedSessionRecord, sessionId: SessionId | undefined): boolean {
    return !!sessionId && entry.sessionId === sessionId;
  }

  private updateRecordInSession(session: Session & RaceStateLookup, record: EventTimeRecord): void {
    session.updateRecord(record);
  }

  private removeFlagCategoryInSession(session: Session & RaceStateLookup, flagId: TimeRecordId, categoryId: EventCategoryId): void {
    session.removeFlagCategory?.(flagId, categoryId);
  }

  private shouldApplyRecordToSession(entry: AddedSessionRecord, sessionId: SessionId | undefined): boolean {
    return !!sessionId && entry.sessionId === sessionId;
  }

  private updateEntrantCategoryInSession(session: Session & RaceStateLookup, entrantId: EventEntrantId, categoryId: EventCategoryId): void {
    session.updateEntrantCategory(entrantId, categoryId);
  }
}
