import { rewriteImportedObjectIds } from '../model/ids.js';
import {
  type EventCatalogLedger,
  createDefaultEventCatalogLedger,
} from './eventCatalog.js';
import { RendererApiUnavailableError, getRendererApi } from './rendererApi.js';

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

export class ElectronJsonEventCatalogPersistence implements EventCatalogPersistence {
  private readonly filePath: string;
  private readonly onError: ((error: unknown) => void) | undefined;

  public constructor(filePath: string, onError?: (error: unknown) => void) {
    this.filePath = filePath;
    this.onError = onError;
  }

  public async load(): Promise<EventCatalogLedger> {
    try {
      const api = getRendererApi(['requestFileContent']);
      const content = await api.requestFileContent<string>(this.filePath, 'utf8');
      const parsed = JSON.parse(content) as Partial<EventCatalogLedger>;
      const mappedParsedData = rewriteImportedObjectIds(parsed).value;

      return {
        ...createDefaultEventCatalogLedger(),
        ...mappedParsedData,
        mutations: mappedParsedData.mutations || [],
        schemaVersion: 1,
      };
    } catch (error: unknown) {
      if (error instanceof RendererApiUnavailableError) {
        throw error;
      }
      if (isFileNotFoundError(error)) {
        console.info(`Event catalog file not found at ${this.filePath}, using defaults.`);
      } else if (isPermissionDeniedError(error)) {
        const warning = createPermissionWarning(this.filePath, 'read');
        reportRecoverableWarning(this.onError, warning);
      } else {
        reportRecoverableError(this.onError, `Failed to load event catalog from ${this.filePath}:`, error);
      }
      return createDefaultEventCatalogLedger();
    }
  }

  public async save(ledger: EventCatalogLedger): Promise<void> {
    try {
      const api = getRendererApi(['writeFileContent']);
      await api.writeFileContent(this.filePath, JSON.stringify(ledger, null, 2));
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
