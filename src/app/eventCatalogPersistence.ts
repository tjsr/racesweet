import {
  type EventCatalogLedger,
  createDefaultEventCatalogLedger,
} from './eventCatalog.js';

export interface EventCatalogPersistence {
  load(): Promise<EventCatalogLedger>;
  save(ledger: EventCatalogLedger): Promise<void>;
}

const isFileNotFoundError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('ENOENT') || message.includes('no such file');
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
      } else {
        console.error(`Failed to load event catalog from ${this.filePath}:`, error);
        this.onError?.(error);
      }
      return createDefaultEventCatalogLedger();
    }
  }

  public async save(ledger: EventCatalogLedger): Promise<void> {
    await window.api.writeFileContent(this.filePath, JSON.stringify(ledger, null, 2));
  }
}
