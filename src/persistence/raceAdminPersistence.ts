import type { EventCategoryId } from '../model/eventcategory.js';
import type { EventEntrantId } from '../model/entrant.js';
import type { SessionId } from '../model/raceevent.js';
import type { EventTimeRecord } from '../model/timerecord.js';
import type { TimeRecordId } from '../model/timerecord.js';
import { RendererApiUnavailableError, getRendererApi } from '../app/rendererApi.js';

export interface FlagCategoryChange {
  action: 'assign' | 'remove';
  categoryId: EventCategoryId;
  flagId: TimeRecordId;
}

export interface AddedSessionRecord {
  record: EventTimeRecord;
  sessionId: SessionId;
}

export interface UpdatedSessionRecord {
  record: EventTimeRecord;
  sessionId: SessionId;
}

export interface AdministrativeChanges {
  addedRecords: AddedSessionRecord[];
  entrantCategories: Record<EventEntrantId, EventCategoryId>;
  excludedCrossings: Record<string, boolean>;
  flagCategoryChanges: FlagCategoryChange[];
  flagDeleted: Record<TimeRecordId, boolean>;
  schemaVersion: 1;
  updatedRecords: UpdatedSessionRecord[];
}

export interface RaceAdminPersistence {
  load(): Promise<AdministrativeChanges>;
  save(changes: AdministrativeChanges): Promise<void>;
}

export const createDefaultAdministrativeChanges = (): AdministrativeChanges => ({
  addedRecords: [],
  entrantCategories: {},
  excludedCrossings: {},
  flagCategoryChanges: [],
  flagDeleted: {},
  schemaVersion: 1,
  updatedRecords: [],
});

const reviveAddedSessionRecord = (entry: AddedSessionRecord): AddedSessionRecord => {
  const recordTime = entry.record?.time;
  return {
    ...entry,
    record: {
      ...entry.record,
      time: typeof recordTime === 'string' ? new Date(recordTime) : recordTime,
    },
  };
};

const reviveUpdatedSessionRecord = (entry: UpdatedSessionRecord): UpdatedSessionRecord => {
  const recordTime = entry.record?.time;
  return {
    ...entry,
    record: {
      ...entry.record,
      time: typeof recordTime === 'string' ? new Date(recordTime) : recordTime,
    },
  };
};

const isFileNotFoundError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('ENOENT') || message.includes('no such file');
};

const isPermissionDeniedError = (error: unknown): boolean => {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return message.includes('eacces') ||
    message.includes('eperm') ||
    message.includes('access is denied') ||
    message.includes('permission denied');
};

const createPermissionWarning = (filePath: string, action: 'read' | 'write'): string => {
  const verb = action === 'read' ? 'read from' : 'write to';
  return `RaceSweet cannot ${verb} ${filePath} because Windows denied file access. Close any app locking that file/folder and ensure your user account has read/write permission.`;
};

const reportRecoverableError = (
  onError: ((error: unknown) => void) | undefined,
  message: string,
  error: unknown
): void => {
  if (onError) {
    onError(error);
    return;
  }
  console.error(message, error);
};

const reportRecoverableWarning = (
  onError: ((error: unknown) => void) | undefined,
  warning: string
): void => {
  if (onError) {
    onError(warning);
    return;
  }
  console.warn(warning);
};

export class ElectronJsonRaceAdminPersistence implements RaceAdminPersistence {
  private readonly filePath: string;
  private readonly onError: ((error: unknown) => void) | undefined;

  public constructor(filePath: string, onError?: (error: unknown) => void) {
    this.filePath = filePath;
    this.onError = onError;
  }

  public async load(): Promise<AdministrativeChanges> {
    try {
      const api = getRendererApi(['requestFileContent']);
      const content = await api.requestFileContent<string>(this.filePath, 'utf8');
      const parsed = JSON.parse(content) as Partial<AdministrativeChanges>;

      return {
        ...createDefaultAdministrativeChanges(),
        ...parsed,
        addedRecords: (parsed.addedRecords || []).map(reviveAddedSessionRecord),
        entrantCategories: parsed.entrantCategories || {},
        excludedCrossings: parsed.excludedCrossings || {},
        flagCategoryChanges: parsed.flagCategoryChanges || [],
        flagDeleted: parsed.flagDeleted || {},
        schemaVersion: 1,
        updatedRecords: (parsed.updatedRecords || []).map(reviveUpdatedSessionRecord),
      };
    } catch (error: unknown) {
      if (error instanceof RendererApiUnavailableError) {
        throw error;
      }
      if (isFileNotFoundError(error)) {
        console.info(`Admin overrides file not found at ${this.filePath}, using defaults.`);
      } else if (isPermissionDeniedError(error)) {
        const warning = createPermissionWarning(this.filePath, 'read');
        reportRecoverableWarning(this.onError, warning);
      } else {
        reportRecoverableError(this.onError, `Failed to load admin overrides from ${this.filePath}:`, error);
      }
      return createDefaultAdministrativeChanges();
    }
  }

  public async save(changes: AdministrativeChanges): Promise<void> {
    try {
      const api = getRendererApi(['writeFileContent']);
      await api.writeFileContent(this.filePath, JSON.stringify(changes, null, 2));
    } catch (error: unknown) {
      if (isPermissionDeniedError(error)) {
        const warning = createPermissionWarning(this.filePath, 'write');
        reportRecoverableWarning(this.onError, warning);
        return;
      }
      throw error;
    }
  }
}
