import type { EventCategoryId } from '../model/eventcategory.js';
import type { EventEntrantId } from '../model/entrant.js';

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

export class ElectronJsonRaceAdminPersistence implements RaceAdminPersistence {
  private readonly filePath: string;
  private readonly onError: ((error: unknown) => void) | undefined;

  public constructor(filePath: string, onError?: (error: unknown) => void) {
    this.filePath = filePath;
    this.onError = onError;
  }

  public async load(): Promise<AdministrativeChanges> {
    try {
      const content = await window.api.requestFileContent<string>(this.filePath, 'utf8');
      const parsed = JSON.parse(content) as Partial<AdministrativeChanges>;

      return {
        ...createDefaultAdministrativeChanges(),
        ...parsed,
        entrantCategories: parsed.entrantCategories || {},
        excludedCrossings: parsed.excludedCrossings || {},
        schemaVersion: 1,
      };
    } catch (error: unknown) {
      if (isFileNotFoundError(error)) {
        console.info(`Admin overrides file not found at ${this.filePath}, using defaults.`);
      } else {
        console.error(`Failed to load admin overrides from ${this.filePath}:`, error);
        this.onError?.(error);
      }
      return createDefaultAdministrativeChanges();
    }
  }

  public async save(changes: AdministrativeChanges): Promise<void> {
    await window.api.writeFileContent(this.filePath, JSON.stringify(changes, null, 2));
  }
}
