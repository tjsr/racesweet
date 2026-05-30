import {
  createDefaultSystemConfiguration,
  type SystemConfiguration,
} from './systemConfig.js';

export interface SystemConfigPersistence {
  load(): Promise<SystemConfiguration>;
  save(config: SystemConfiguration): Promise<void>;
}

export class ElectronJsonSystemConfigPersistence implements SystemConfigPersistence {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  public async load(): Promise<SystemConfiguration> {
    try {
      const content = await window.api.requestFileContent<string>(this.filePath, 'utf8');
      const parsed = JSON.parse(content) as Partial<SystemConfiguration>;

      return {
        ...createDefaultSystemConfiguration(),
        ...parsed,
        dataSources: parsed.dataSources || [],
        eventSourceAssignments: parsed.eventSourceAssignments || {},
        schemaVersion: 1,
        sessionSourceAssignments: parsed.sessionSourceAssignments || {},
      };
    } catch (_error: unknown) {
      return createDefaultSystemConfiguration();
    }
  }

  public async save(config: SystemConfiguration): Promise<void> {
    await window.api.writeFileContent(this.filePath, JSON.stringify(config, null, 2));
  }
}
