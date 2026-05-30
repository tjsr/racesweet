import {
  createDefaultEventCatalogLedger,
  type EventCatalogLedger,
} from './eventCatalog.js';

export interface EventCatalogPersistence {
  load(): Promise<EventCatalogLedger>;
  save(ledger: EventCatalogLedger): Promise<void>;
}

export class ElectronJsonEventCatalogPersistence implements EventCatalogPersistence {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
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
    } catch (_error: unknown) {
      return createDefaultEventCatalogLedger();
    }
  }

  public async save(ledger: EventCatalogLedger): Promise<void> {
    await window.api.writeFileContent(this.filePath, JSON.stringify(ledger, null, 2));
  }
}
