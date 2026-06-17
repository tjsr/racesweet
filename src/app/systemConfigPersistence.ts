import {
  type SystemConfiguration,
  createDefaultSystemConfiguration,
  normalizeSystemConfiguration,
} from './systemConfig.js';
import { RendererApiUnavailableError, getRendererApi } from './rendererApi.js';

export interface SystemConfigPersistence {
  load(): Promise<SystemConfiguration>;
  save(config: SystemConfiguration): Promise<void>;
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

export class ElectronJsonSystemConfigPersistence implements SystemConfigPersistence {
  private readonly filePath: string;
  private readonly onError: ((error: unknown) => void) | undefined;

  public constructor(filePath: string, onError?: (error: unknown) => void) {
    this.filePath = filePath;
    this.onError = onError;
  }

  public async load(): Promise<SystemConfiguration> {
    try {
      const api = getRendererApi(['requestFileContent']);
      const content = await api.requestFileContent<string>(this.filePath, 'utf8');
      const parsed = JSON.parse(content) as Partial<SystemConfiguration>;

      return normalizeSystemConfiguration(parsed);
    } catch (error: unknown) {
      if (error instanceof RendererApiUnavailableError) {
        throw error;
      }
      if (isFileNotFoundError(error)) {
        console.info(`System config file not found at ${this.filePath}, using defaults.`);
      } else if (isPermissionDeniedError(error)) {
        const warning = createPermissionWarning(this.filePath, 'read');
        console.warn(warning);
        this.onError?.(warning);
      } else {
        console.error(`Failed to load system config from ${this.filePath}:`, error);
        this.onError?.(error);
      }
      return createDefaultSystemConfiguration();
    }
  }

  public async save(config: SystemConfiguration): Promise<void> {
    try {
      const api = getRendererApi(['writeFileContent']);
      await api.writeFileContent(this.filePath, JSON.stringify(config, null, 2));
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
