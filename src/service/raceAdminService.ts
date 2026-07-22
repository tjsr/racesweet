import type { EventCategoryId } from '../model/eventcategory.js';
import type { EventEntrantId } from '../model/entrant.js';
import type { SessionId } from '../model/raceevent.js';
import type { RaceStateLookup, Session } from '../model/racestate.js';
import type { EventTimeRecord, TimeRecordId } from '../model/timerecord.js';
import { incrementLoadingMetric } from '../loadingMetrics.js';
import type { LoadingProgressCallback } from '../loadingProgress.js';
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

  public static async create(
    sessionLoader: () => Promise<Session & RaceStateLookup>,
    persistence: RaceAdminPersistence,
    sessionId?: SessionId,
    options: { onProgress?: LoadingProgressCallback } = {},
  ): Promise<RaceAdminService> {
    incrementLoadingMetric('Load race admin service');
    const session = await sessionLoader();
    const changes = await persistence.load();
    const service = new RaceAdminService(session, persistence, changes, sessionId);
    await service.applyChanges(service.session, sessionId, options.onProgress);
    return service;
  }

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
    if (session.canAssignFlagCategory?.(flagId, categoryId) === false) {
      throw new Error(`Category ${categoryId} is not available for flag ${flagId} in this session.`);
    }
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

  public async applyChangesToSession(session: Session & RaceStateLookup, onProgress?: LoadingProgressCallback): Promise<void> {
    await this.applyChanges(session, this.sessionId, onProgress);
  }

  public async applyChangesToSessionById(
    session: Session & RaceStateLookup,
    sessionId: SessionId | undefined,
    onProgress?: LoadingProgressCallback,
  ): Promise<void> {
    await this.applyChanges(session, sessionId, onProgress);
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

  private async applyChanges(
    session: Session & RaceStateLookup = this.session,
    sessionId: SessionId | undefined = this.sessionId,
    onProgress?: LoadingProgressCallback,
  ): Promise<void> {
    incrementLoadingMetric('Apply race admin changes', sessionId);
    const changes = this.changes || createDefaultAdministrativeChanges();
    const addedRecords = changes.addedRecords.filter((candidate) => this.shouldApplyRecordToSession(candidate, sessionId));
    const updatedRecords = changes.updatedRecords.filter((entry) => this.shouldApplyUpdatedRecordToSession(entry, sessionId));
    const flagDeletedChanges = Object.entries(changes.flagDeleted);
    const entrantCategoryChanges = Object.entries(changes.entrantCategories);
    const excludedCrossingChanges = Object.entries(changes.excludedCrossings);
    const total = Math.max(1, addedRecords.length + updatedRecords.length + flagDeletedChanges.length + changes.flagCategoryChanges.length + entrantCategoryChanges.length + excludedCrossingChanges.length);
    let completed = 0;
    await onProgress?.({ completed, currentTask: 'Preparing administrative changes', total });
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
        incrementLoadingMetric('Apply admin added record', entry.record.id.toString());
        await this.applyStoredRecordChange(session, entry.record);
        completed += 1;
        await onProgress?.({ completed, currentTask: `Apply added record ${entry.record.id}`, total });
      }

      for (const entry of updatedRecords) {
        incrementLoadingMetric('Apply admin updated record', entry.record.id.toString());
        this.applyStoredUpdatedRecordChange(session, entry.record);
        completed += 1;
        await onProgress?.({ completed, currentTask: `Apply updated record ${entry.record.id}`, total });
      }

      for (const [flagId, deleted] of flagDeletedChanges) {
        incrementLoadingMetric('Apply admin deleted flag', flagId);
        this.applyStoredFlagChange(() => this.markFlagDeletedInSession(session, flagId, deleted));
        completed += 1;
        await onProgress?.({ completed, currentTask: `Apply deleted flag ${flagId}`, total });
      }

      for (const change of changes.flagCategoryChanges) {
        incrementLoadingMetric('Apply admin flag category change', change.flagId.toString());
        if (change.action === 'assign') {
          this.applyStoredFlagChange(() => this.assignFlagCategoryInSession(session, change.flagId, change.categoryId));
        } else {
          this.applyStoredFlagChange(() => this.removeFlagCategoryInSession(session, change.flagId, change.categoryId));
        }
        completed += 1;
        await onProgress?.({ completed, currentTask: `Apply flag category change ${change.flagId}`, total });
      }

      for (const [entrantId, categoryId] of entrantCategoryChanges) {
        incrementLoadingMetric('Apply admin entrant category', entrantId);
        this.updateEntrantCategoryInSession(session, entrantId, categoryId);
        completed += 1;
        await onProgress?.({ completed, currentTask: `Apply entrant category ${entrantId}`, total });
      }

      for (const [crossingId, exclude] of excludedCrossingChanges) {
        incrementLoadingMetric('Apply admin excluded crossing', crossingId);
        this.excludeCrossingInSession(session, crossingId, exclude);
        completed += 1;
        await onProgress?.({ completed, currentTask: `Apply excluded crossing ${crossingId}`, total });
      }
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
