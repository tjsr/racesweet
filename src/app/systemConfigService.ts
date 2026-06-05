import {
  type DataSourceConfig,
  type DataSourceType,
  type SessionSourceAssignment,
  type SystemConfiguration,
  createDefaultSystemConfiguration,
  getDataSourceTypeLabel,
} from './systemConfig.js';
import type { SystemConfigPersistence } from './systemConfigPersistence.js';

interface SystemConfigServiceOptions {
  onPersistedConfig?: (config: SystemConfiguration) => Promise<void>;
}

const createSourceId = (): string => `source-${Date.now()}-${Math.round(Math.random() * 100000)}`;

const createDefaultSource = (type: DataSourceType): DataSourceConfig => {
  const base: DataSourceConfig = {
    enabled: true,
    id: createSourceId(),
    name: getDataSourceTypeLabel(type),
    type,
  };

  if (type === 'api-apical-data-file') {
    return {
      ...base,
      apiConfig: {
        authHeaderName: 'Authorization',
        authHeaderValue: '',
        baseUrl: 'https://apicalracetiming.com.au',
        companyId: 2,
        httpTimeoutSeconds: 30,
        live: false,
        pollIntervalSeconds: 30,
        selectedEventIds: [],
      },
      listedEvents: [],
      name: 'Apical Data file endpoint',
    };
  }

  if (type === 'master-entrant-profiles') {
    return {
      ...base,
      masterEntrantConfig: {
        profiles: [],
      },
      name: 'Master Entrant Profiles',
    };
  }

  if (type === 'file-rfid-timing-csv') {
    return {
      ...base,
      fileConfig: {},
      name: 'RFID Timing CSV',
    };
  }

  return base;
};

export class SystemConfigService {
  private config: SystemConfiguration;
  private readonly options: SystemConfigServiceOptions;
  private readonly persistence: SystemConfigPersistence;

  private constructor(persistence: SystemConfigPersistence, config: SystemConfiguration, options: SystemConfigServiceOptions = {}) {
    this.config = config;
    this.options = options;
    this.persistence = persistence;
  }

  public static async create(persistence: SystemConfigPersistence, options: SystemConfigServiceOptions = {}): Promise<SystemConfigService> {
    const config = await persistence.load();
    return new SystemConfigService(persistence, config, options);
  }

  public get state(): SystemConfiguration {
    return this.config;
  }

  public async createSource(type: DataSourceType): Promise<SystemConfiguration> {
    this.config = {
      ...this.config,
      dataSources: [...this.config.dataSources, createDefaultSource(type)],
    };
    await this.persist();
    return this.config;
  }

  public async updateSource(sourceId: string, changes: Partial<DataSourceConfig>): Promise<SystemConfiguration> {
    this.config = {
      ...this.config,
      dataSources: this.config.dataSources.map((source) => {
        if (source.id !== sourceId) {
          return source;
        }

        return {
          ...source,
          ...changes,
        };
      }),
    };
    await this.persist();
    return this.config;
  }

  public async deleteSource(sourceId: string): Promise<SystemConfiguration> {
    this.config = {
      ...this.config,
      dataSources: this.config.dataSources.filter((source) => source.id !== sourceId),
      eventSourceAssignments: Object.fromEntries(
        Object.entries(this.config.eventSourceAssignments).map(([eventId, sourceIds]) => [
          eventId,
          sourceIds.filter((id) => id !== sourceId),
        ])
      ),
      sessionSourceAssignments: Object.fromEntries(
        Object.entries(this.config.sessionSourceAssignments).map(([sessionId, assignment]) => [
          sessionId,
          {
            ...assignment,
            sourceIds: assignment.sourceIds.filter((id) => id !== sourceId),
          },
        ])
      ),
    };
    await this.persist();
    return this.config;
  }

  public async assignSourcesToEvent(eventId: string, sourceIds: string[]): Promise<SystemConfiguration> {
    this.config = {
      ...this.config,
      eventSourceAssignments: {
        ...this.config.eventSourceAssignments,
        [eventId]: sourceIds,
      },
    };
    await this.persist();
    return this.config;
  }

  public async assignSourcesToSession(sessionId: string, assignment: SessionSourceAssignment): Promise<SystemConfiguration> {
    this.config = {
      ...this.config,
      sessionSourceAssignments: {
        ...this.config.sessionSourceAssignments,
        [sessionId]: assignment,
      },
    };
    await this.persist();
    return this.config;
  }

  public async persistListedApicalEvents(sourceId: string, listedEvents: DataSourceConfig['listedEvents']): Promise<SystemConfiguration> {
    return this.updateSource(sourceId, { listedEvents });
  }

  private async persist(): Promise<void> {
    const sanitized = {
      ...createDefaultSystemConfiguration(),
      ...this.config,
      schemaVersion: 1 as const,
    };
    this.config = sanitized;
    await this.persistence.save(sanitized);
    if (this.options.onPersistedConfig) {
      await this.options.onPersistedConfig(sanitized);
    }
  }
}
