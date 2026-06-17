import type { EventCategoryId } from '../model/eventcategory.js';
import type { EventEntrantId } from '../model/entrant.js';
import { RendererApiUnavailableError, getRendererApi } from './rendererApi.js';

export interface AdministrativeChanges {
  entrantCategories: Record<EventEntrantId, EventCategoryId>;
  excludedCrossings: Record<string, boolean>;
  schemaVersion: 1;
}

export interface RaceAdminPersistence {
  load(): Promise<AdministrativeChanges>;
  save(changes: AdministrativeChanges): Promise<void>;
}

export const createDefaultAdministrativeChanges = (): AdministrativeChanges => ({
  entrantCategories: {},
  excludedCrossings: {},
  schemaVersion: 1,
});

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
        entrantCategories: parsed.entrantCategories || {},
        excludedCrossings: parsed.excludedCrossings || {},
        schemaVersion: 1,
      };
    } catch (error: unknown) {
      if (error instanceof RendererApiUnavailableError) {
        throw error;
      }
      if (isFileNotFoundError(error)) {
        console.info(`Admin overrides file not found at ${this.filePath}, using defaults.`);
      } else if (isPermissionDeniedError(error)) {
        const warning = createPermissionWarning(this.filePath, 'read');
        console.warn(warning);
        this.onError?.(warning);
      } else {
        console.error(`Failed to load admin overrides from ${this.filePath}:`, error);
        this.onError?.(error);
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
        console.warn(warning);
        this.onError?.(warning);
        return;
      }
      throw error;
    }
  }
}
