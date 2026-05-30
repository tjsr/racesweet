import {
  createDefaultSystemConfiguration,
  type SystemConfiguration,
} from './systemConfig.js';

export interface SystemConfigPersistence {
  load(): Promise<SystemConfiguration>;
  save(config: SystemConfiguration): Promise<void>;
}

const isFileNotFoundError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('ENOENT') || message.includes('no such file');
};

export class ElectronJsonSystemConfigPersistence implements SystemConfigPersistence {
  private readonly filePath: string;
  private readonly onError: ((error: unknown) => void) | undefined;

  public constructor(filePath: string, onError?: (error: unknown) => void) {
    this.filePath = filePath;
    this.onError = onError;
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
    } catch (error: unknown) {
      if (isFileNotFoundError(error)) {
        console.info(`System config file not found at ${this.filePath}, using defaults.`);
      } else {
        console.error(`Failed to load system config from ${this.filePath}:`, error);
        this.onError?.(error);
      }
      return createDefaultSystemConfiguration();
    }
  }

  public async save(config: SystemConfiguration): Promise<void> {
    await window.api.writeFileContent(this.filePath, JSON.stringify(config, null, 2));
  }
}
