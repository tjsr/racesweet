import {
  createDefaultEventCatalogLedger,
  type EventCatalogLedger,
} from './eventCatalog.js';

export interface EventCatalogPersistence {
  load(): Promise<EventCatalogLedger>;
  save(ledger: EventCatalogLedger): Promise<void>;
}

const isFileNotFoundError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('ENOENT') || message.includes('no such file');
};

const isPermissionDeniedError = (error: unknown): boolean => {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return message.includes('eacces')
    || message.includes('eperm')
    || message.includes('access is denied')
    || message.includes('permission denied');
};

const createPermissionWarning = (filePath: string, action: 'read' | 'write'): string => {
  const verb = action === 'read' ? 'read from' : 'write to';
  return `RaceSweet cannot ${verb} ${filePath} because Windows denied file access. Close any app locking that file/folder and ensure your user account has read/write permission.`;
};

export class ElectronJsonEventCatalogPersistence implements EventCatalogPersistence {
  private readonly filePath: string;
  private readonly onError: ((error: unknown) => void) | undefined;

  public constructor(filePath: string, onError?: (error: unknown) => void) {
    this.filePath = filePath;
    this.onError = onError;
  }

  public async load(): Promise<EventCatalogLedger> {
    try {
      const content = await window.api.requestFileContent<string>(this.filePath, 'utf8');
      const parsed = JSON.parse(content) as Partial<EventCatalogLedger>;

      return {
        ...createDefaultEventCatalogLedger(),
        ...parsed,
        mutations: parsed.mutations || [],
        schemaVersion: 1,
      };
    } catch (error: unknown) {
      if (isFileNotFoundError(error)) {
        console.info(`Event catalog file not found at ${this.filePath}, using defaults.`);
      } else if (isPermissionDeniedError(error)) {
        const warning = createPermissionWarning(this.filePath, 'read');
        console.warn(warning);
        this.onError?.(warning);
      } else {
        console.error(`Failed to load event catalog from ${this.filePath}:`, error);
        this.onError?.(error);
      }
      return createDefaultEventCatalogLedger();
    }
  }

  public async save(ledger: EventCatalogLedger): Promise<void> {
    try {
      await window.api.writeFileContent(this.filePath, JSON.stringify(ledger, null, 2));
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
