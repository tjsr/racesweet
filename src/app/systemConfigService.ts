import { EventId, SessionId } from '../model/raceevent.js';
import { TimeRecordSourceId } from '../model/types.js';
import {
    APICAL_DEFAULT_SOURCE_NAME,
    type DataSourceConfig,
    type DataSourceType,
    type SessionSourceAssignment,
    type SystemConfiguration,
    createDefaultSystemConfiguration,
    getDataSourceTypeLabel,
    normalizeOptionalSystemFilePath,
    normalizeSystemConfiguration,
    normalizeSystemDirectoryPath,
    shouldRenameApicalSourceForFetchedEvent,
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

  if (type === 'api-apical-data-file' || type === 'api-apical-excel-file') {
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
      name: APICAL_DEFAULT_SOURCE_NAME,
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

const isApicalDataSource = (source: Pick<DataSourceConfig, 'type'>): boolean => {
  return source.type === 'api-apical-data-file' || source.type === 'api-apical-excel-file';
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
    return new SystemConfigService(persistence, normalizeSystemConfiguration(config), options);
  }

  public get state(): SystemConfiguration {
    return this.config;
  }

  public async createSource(type: DataSourceType): Promise<SystemConfiguration> {
    const source = createDefaultSource(type);
    this.config = {
      ...this.config,
      dataSources: [
        ...this.config.dataSources,
        isApicalDataSource(source) && (this.config.apicalListedEvents || []).length > 0
          ? {
              ...source,
              listedEvents: (this.config.apicalListedEvents || []).map((event) => ({ ...event })),
            }
          : source,
      ],
    };
    await this.persist();
    return this.config;
  }

  public async updateSource(sourceId: TimeRecordSourceId, changes: Partial<DataSourceConfig>): Promise<SystemConfiguration> {
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

  public async deleteSource(sourceId: TimeRecordSourceId): Promise<SystemConfiguration> {
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

  public async assignSourcesToEvent(eventId: EventId, sourceIds: TimeRecordSourceId[]): Promise<SystemConfiguration> {
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

  public async assignSourcesToSession(sessionId: SessionId, assignment: SessionSourceAssignment): Promise<SystemConfiguration> {
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

  public async updateEventOptions(eventId: EventId, changes: SystemConfiguration['eventOptions'][string]): Promise<SystemConfiguration> {
    this.config = {
      ...this.config,
      eventOptions: {
        ...this.config.eventOptions,
        [eventId]: {
          ...(this.config.eventOptions[eventId] || {}),
          ...changes,
        },
      },
    };
    await this.persist();
    return this.config;
  }

  public async updateLocalStorageDirectoryPath(directoryPath: string): Promise<SystemConfiguration> {
    this.config = {
      ...this.config,
      localStorageDirectoryPath: normalizeSystemDirectoryPath(directoryPath),
    };
    await this.persist();
    return this.config;
  }

  public async persistListedApicalEvents(sourceId: TimeRecordSourceId, listedEvents: DataSourceConfig['listedEvents']): Promise<SystemConfiguration> {
    const source = this.config.dataSources.find((item) => item.id === sourceId);
    if (!source || !isApicalDataSource(source) || !source.apiConfig) {
      return this.updateSource(sourceId, { listedEvents });
    }

    const listedEventIds = new Set((listedEvents || []).map((eventItem) => eventItem.id));
    const selectedEventIds = (source.apiConfig.selectedEventIds || []).filter((eventId) => listedEventIds.has(eventId));
    this.config = {
      ...this.config,
      apicalListedEvents: (listedEvents || []).map((eventItem) => ({ ...eventItem })),
      dataSources: this.config.dataSources.map((item) => {
        if (!isApicalDataSource(item)) {
          return item;
        }

        const nextApiConfig = item.id === sourceId && item.apiConfig
          ? {
              ...item.apiConfig,
              apicalEventId: selectedEventIds[0],
              selectedEventIds,
            }
          : item.apiConfig;

        return {
          ...item,
          apiConfig: nextApiConfig,
          listedEvents: (listedEvents || []).map((eventItem) => ({ ...eventItem })),
        };
      }),
    };

    await this.persist();
    return this.config;
  }

  public async persistApicalDataFetch(
    sourceId: TimeRecordSourceId,
    eventId: EventId,
    sessionId: SessionId,
    retrievedAt: string,
    apicalDataFilePath?: string,
    eventName?: string
  ): Promise<SystemConfiguration> {
    const assignedEventSources = this.config.eventSourceAssignments[eventId] || [];
    const normalizedApicalDataFilePath = normalizeOptionalSystemFilePath(apicalDataFilePath);
    this.config = {
      ...this.config,
      dataSources: this.config.dataSources.map((source) => {
        if (source.id !== sourceId) {
          return source;
        }

        return {
          ...source,
          apicalDataFilePath: normalizedApicalDataFilePath,
          dataLastRetrieved: retrievedAt,
          name: eventName && shouldRenameApicalSourceForFetchedEvent(source.name) ? eventName : source.name,
        };
      }),
      eventSourceAssignments: {
        ...this.config.eventSourceAssignments,
        [eventId]: Array.from(new Set([...assignedEventSources, sourceId])),
      },
      sessionSourceAssignments: {
        ...this.config.sessionSourceAssignments,
        [sessionId]: {
          mode: 'specific',
          sourceIds: [sourceId],
        },
      },
    };
    await this.persist();
    return this.config;
  }

  public async persistApicalDataFilePaths(sourceFilePaths: Record<string, string | undefined>): Promise<SystemConfiguration> {
    let changed = false;
    this.config = {
      ...this.config,
      dataSources: this.config.dataSources.map((source) => {
        const apicalDataFilePath = normalizeOptionalSystemFilePath(sourceFilePaths[source.id]);
        if (!apicalDataFilePath || source.apicalDataFilePath === apicalDataFilePath) {
          return source;
        }

        changed = true;
        return {
          ...source,
          apicalDataFilePath,
        };
      }),
    };

    if (!changed) {
      return this.config;
    }

    await this.persist();
    return this.config;
  }

  private async persist(): Promise<void> {
    const sanitized = normalizeSystemConfiguration({
      ...createDefaultSystemConfiguration(),
      ...this.config,
    });
    this.config = sanitized;
    await this.persistence.save(sanitized);
    if (this.options.onPersistedConfig) {
      await this.options.onPersistedConfig(sanitized);
    }
  }
}
