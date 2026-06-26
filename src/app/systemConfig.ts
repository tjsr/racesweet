import path from 'node:path';
import { EventId, SessionId } from '../model/raceevent';

export type DataSourceType =
  | 'timing-rfid-decoder'
  | 'timing-mylaps-decoder'
  | 'timing-dorian-data1-supernode'
  | 'file-rfid-timing-csv'
  | 'file-apical-data-file'
  | 'file-racesweet-ledger'
  | 'api-aws-sqs'
  | 'api-http-request'
  | 'api-apical-excel-file'
  | 'api-apical-data-file'
  | 'master-entrant-profiles';

export interface MasterEntrantProfile {
  categoryId?: string;
  dateOfBirth?: string;
  entrantId?: string;
  firstName?: string;
  gender?: string;
  lastName?: string;
  participantId?: string;
}

export interface MasterEntrantSourceConfig {
  profiles: MasterEntrantProfile[];
}

export interface LocalFileSourceConfig {
  filePath?: string;
}

export interface ApicalListedEvent {
  companyName?: string;
  eventDate?: string;
  id: number;
  name: string;
}

export const APICAL_DEFAULT_SOURCE_NAME = 'Apical Data file endpoint';

export const shouldRenameApicalSourceForFetchedEvent = (sourceName: string | null | undefined): boolean => {
  const trimmedSourceName = sourceName?.trim();
  return !trimmedSourceName || trimmedSourceName === APICAL_DEFAULT_SOURCE_NAME;
};

export interface ApicalApiSourceConfig {
  apicalEventId?: number;
  authHeaderName: string;
  authHeaderValue: string;
  baseUrl: string;
  companyId: number;
  httpTimeoutSeconds: number;
  live: boolean;
  pollIntervalSeconds: number;
  selectedEventIds: number[];
}

export interface DataSourceConfig {
  apiConfig?: ApicalApiSourceConfig;
  apicalDataFilePath?: string;
  dataLastRetrieved?: string;
  enabled: boolean;
  fileConfig?: LocalFileSourceConfig;
  id: string;
  listedEvents?: ApicalListedEvent[];
  masterEntrantConfig?: MasterEntrantSourceConfig;
  name: string;
  type: DataSourceType;
}

export interface SessionSourceAssignment {
  mode: 'default' | 'specific';
  sourceIds: string[];
}

export type EventTimeDisplayZoneMode = 'event' | 'system' | 'gmt';

export interface EventOptionsConfig {
  timeDisplayZoneMode?: EventTimeDisplayZoneMode;
}

export interface SystemConfiguration {
  apicalListedEvents?: ApicalListedEvent[];
  dataSources: DataSourceConfig[];
  eventOptions: Record<string, EventOptionsConfig>;
  eventSourceAssignments: Record<string, string[]>;
  localStorageDirectoryPath: string;
  schemaVersion: 1;
  sessionSourceAssignments: Record<string, SessionSourceAssignment>;
}

export const DEFAULT_LOCAL_STORAGE_DIRECTORY_PATH = path.resolve('src/generated');
const APICAL_EXCEL_CACHE_DIRECTORY_NAME = 'apical-excel-cache';

export const normalizeSystemDirectoryPath = (directoryPath: string | undefined): string => {
  const trimmedPath = directoryPath?.trim();
  return path.resolve(trimmedPath && trimmedPath.length > 0 ? trimmedPath : DEFAULT_LOCAL_STORAGE_DIRECTORY_PATH);
};

export const normalizeOptionalSystemFilePath = (filePath: string | undefined): string | undefined => {
  const trimmedPath = filePath?.trim();
  return trimmedPath && trimmedPath.length > 0 ? path.resolve(trimmedPath) : undefined;
};

export const createDefaultSystemConfiguration = (): SystemConfiguration => ({
  apicalListedEvents: [],
  dataSources: [],
  eventOptions: {},
  eventSourceAssignments: {},
  localStorageDirectoryPath: DEFAULT_LOCAL_STORAGE_DIRECTORY_PATH,
  schemaVersion: 1,
  sessionSourceAssignments: {},
});

const normalizeLocalStorageDirectoryPath = (
  directoryPath: string | undefined,
  legacyApicalExcelCacheDirectoryPath: string | undefined
): string => {
  if (directoryPath !== undefined) {
    return normalizeSystemDirectoryPath(directoryPath);
  }

  const normalizedLegacyPath = normalizeSystemDirectoryPath(legacyApicalExcelCacheDirectoryPath);
  return path.basename(normalizedLegacyPath) === APICAL_EXCEL_CACHE_DIRECTORY_NAME
    ? path.dirname(normalizedLegacyPath)
    : normalizedLegacyPath;
};

const isApicalDataSource = (source: Pick<DataSourceConfig, 'type'>): boolean => {
  return source.type === 'api-apical-data-file' || source.type === 'api-apical-excel-file';
};

const normalizeApicalListedEvents = (listedEvents: ApicalListedEvent[] | undefined): ApicalListedEvent[] => {
  return (listedEvents || []).map((event) => ({ ...event }));
};

export const normalizeDataSourceConfig = (source: DataSourceConfig, apicalListedEvents: ApicalListedEvent[] = []): DataSourceConfig => {
  if (!isApicalDataSource(source) || !source.apiConfig) {
    return source;
  }

  const selectedEventIds = source.apiConfig.selectedEventIds?.length > 0
    ? source.apiConfig.selectedEventIds
    : source.apiConfig.apicalEventId
      ? [source.apiConfig.apicalEventId]
      : [];

  return {
    ...source,
    apicalDataFilePath: normalizeOptionalSystemFilePath(source.apicalDataFilePath),
    ...(source.listedEvents && source.listedEvents.length > 0
      ? { listedEvents: normalizeApicalListedEvents(source.listedEvents) }
      : apicalListedEvents.length > 0
        ? { listedEvents: normalizeApicalListedEvents(apicalListedEvents) }
        : {}),
    apiConfig: {
      ...source.apiConfig,
      apicalEventId: selectedEventIds[0],
      selectedEventIds,
    },
  };
};

export const normalizeSystemConfiguration = (
  config: Partial<SystemConfiguration> & { apicalExcelCacheDirectoryPath?: string }
): SystemConfiguration => {
  const {
    apicalExcelCacheDirectoryPath: _legacyApicalExcelCacheDirectoryPath,
    ...currentConfig
  } = config;
  const normalizedApicalListedEvents = normalizeApicalListedEvents(config.apicalListedEvents);
  const normalizedDataSources = (config.dataSources || []).map((source) => normalizeDataSourceConfig(source, normalizedApicalListedEvents));
  const derivedApicalListedEvents = normalizedApicalListedEvents.length > 0
    ? normalizedApicalListedEvents
    : normalizedDataSources.find((source) => isApicalDataSource(source) && (source.listedEvents || []).length > 0)?.listedEvents || [];

  return {
    ...createDefaultSystemConfiguration(),
    ...currentConfig,
    apicalListedEvents: derivedApicalListedEvents,
    dataSources: normalizedDataSources.map((source) => (
      isApicalDataSource(source) && derivedApicalListedEvents.length > 0 && (!source.listedEvents || source.listedEvents.length === 0)
        ? { ...source, listedEvents: derivedApicalListedEvents }
        : source
    )),
    eventOptions: config.eventOptions || {},
    eventSourceAssignments: config.eventSourceAssignments || {},
    localStorageDirectoryPath: normalizeLocalStorageDirectoryPath(config.localStorageDirectoryPath, config.apicalExcelCacheDirectoryPath),
    schemaVersion: 1,
    sessionSourceAssignments: config.sessionSourceAssignments || {},
  };
};

export const getDataSourceTypeLabel = (type: DataSourceType): string => {
  switch (type) {
  case 'timing-rfid-decoder':
    return 'RFID Timing Decoder';
  case 'timing-mylaps-decoder':
    return 'MyLaps Decoder';
  case 'timing-dorian-data1-supernode':
    return 'Dorian DATA-1 Supernode';
  case 'file-rfid-timing-csv':
    return 'RFID Timing CSV';
  case 'file-apical-data-file':
    return 'Apical data file';
  case 'file-racesweet-ledger':
    return 'RaceSweet Ledger';
  case 'api-aws-sqs':
    return 'AWS SQS';
  case 'api-http-request':
    return 'HTTP Request';
  case 'api-apical-excel-file':
    return 'Apical Excel data';
  case 'master-entrant-profiles':
    return 'Master Entrant Profiles';
  default:
    return type;
  }
};

export const getEventAssignedSourceIds = (config: SystemConfiguration, eventId: EventId): string[] => {
  return config.eventSourceAssignments[eventId] || [];
};

export const getSessionAssignedSourceIds = (config: SystemConfiguration, eventId: EventId, sessionId: SessionId): string[] => {
  const sessionAssignment = config.sessionSourceAssignments[sessionId];
  if (!sessionAssignment || sessionAssignment.mode === 'default') {
    return getEventAssignedSourceIds(config, eventId);
  }

  return sessionAssignment.sourceIds;
};

export const getMasterEntrantProfilesForEvent = (config: SystemConfiguration, eventId: EventId): MasterEntrantProfile[] => {
  const sourceIds = getEventAssignedSourceIds(config, eventId);

  return config.dataSources
    .filter((source) => source.enabled && sourceIds.includes(source.id) && source.type === 'master-entrant-profiles')
    .flatMap((source) => source.masterEntrantConfig?.profiles || []);
};
