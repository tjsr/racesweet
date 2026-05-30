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

export class ElectronJsonRaceAdminPersistence implements RaceAdminPersistence {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
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
    } catch (_error: unknown) {
      return createDefaultAdministrativeChanges();
    }
  }

  public async save(changes: AdministrativeChanges): Promise<void> {
    await window.api.writeFileContent(this.filePath, JSON.stringify(changes, null, 2));
  }
}