import type { EventCategoryId } from '../model/eventcategory.js';
import type { EventEntrantId } from '../model/entrant.js';
import type { SessionId } from '../model/raceevent.js';
import type { RaceStateLookup, Session } from '../model/racestate.js';
import type { EventTimeRecord, TimeRecordId } from '../model/timerecord.js';
import {
  type AddedSessionRecord,
  type AdministrativeChanges,
  type RaceAdminPersistence,
  type UpdatedSessionRecord,
  createDefaultAdministrativeChanges,
} from '../persistence/raceAdminPersistence.js';

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
    await service.applyChanges();
    return service;
  }

  public get raceState(): Session & RaceStateLookup {
    return this.session;
  }

  public async excludeCrossing(crossingId: TimeRecordId, exclude: boolean): Promise<void> {
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

  public async excludeCrossingForSession(session: Session & RaceStateLookup, crossingId: TimeRecordId, exclude: boolean): Promise<void> {
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

  public async applyChangesToSession(session: Session & RaceStateLookup): Promise<void> {
    await this.applyChanges(session);
  }

  public async applyChangesToSessionById(session: Session & RaceStateLookup, sessionId: SessionId | undefined): Promise<void> {
    await this.applyChanges(session, sessionId);
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

  private async applyChanges(session: Session & RaceStateLookup = this.session, sessionId: SessionId | undefined = this.sessionId): Promise<void> {
    const changes = this.changes || createDefaultAdministrativeChanges();
    const addedRecords = changes.addedRecords.filter((candidate) => this.shouldApplyRecordToSession(candidate, sessionId));
    const updatedRecords = changes.updatedRecords.filter((entry) => this.shouldApplyUpdatedRecordToSession(entry, sessionId));
    const flagDeletedChanges = Object.entries(changes.flagDeleted);
    const entrantCategoryChanges = Object.entries(changes.entrantCategories);
    const excludedCrossingChanges = Object.entries(changes.excludedCrossings);
    const hasApplicableChanges = addedRecords.length > 0 ||
      updatedRecords.length > 0 ||
      flagDeletedChanges.length > 0 ||
      changes.flagCategoryChanges.length > 0 ||
      entrantCategoryChanges.length > 0 ||
      excludedCrossingChanges.length > 0;
    if (!hasApplicableChanges) {
      return;
    }

    const bulkStarted = await session.beginBulkProcess() === true;

    try {
      for (const entry of addedRecords) {
        await this.applyStoredRecordChange(session, entry.record);
      }

      updatedRecords.forEach((entry) => {
        this.applyStoredUpdatedRecordChange(session, entry.record);
      });

      flagDeletedChanges.forEach(([flagId, deleted]) => {
        this.applyStoredFlagChange(() => this.markFlagDeletedInSession(session, flagId, deleted));
      });

      changes.flagCategoryChanges.forEach((change) => {
        if (change.action === 'assign') {
          this.applyStoredFlagChange(() => this.assignFlagCategoryInSession(session, change.flagId, change.categoryId));
        } else {
          this.applyStoredFlagChange(() => this.removeFlagCategoryInSession(session, change.flagId, change.categoryId));
        }
      });

      entrantCategoryChanges.forEach(([entrantId, categoryId]) => {
        this.updateEntrantCategoryInSession(session, entrantId, categoryId);
      });

      excludedCrossingChanges.forEach(([crossingId, exclude]) => {
        this.excludeCrossingInSession(session, crossingId, exclude);
      });
    } finally {
      if (bulkStarted) {
        await session.endBulkProcess();
      }
    }
  }

  private assignFlagCategoryInSession(session: Session & RaceStateLookup, flagId: TimeRecordId, categoryId: EventCategoryId): void {
    session.assignFlagCategory?.(flagId, categoryId);
  }

  private async applyStoredRecordChange(session: Session & RaceStateLookup, record: EventTimeRecord): Promise<void> {
    try {
      await this.addRecordInSession(session, record);
    } catch (_error: unknown) {
      // Saved admin changes are replayed across session reloads; ignore records that cannot be re-added here.
    }
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

  private excludeCrossingInSession(session: Session & RaceStateLookup, crossingId: TimeRecordId, exclude: boolean): void {
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
