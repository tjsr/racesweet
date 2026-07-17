import path from 'node:path';
import { EventId, SessionId } from '../model/raceevent';
import { getCtcFinishLineNumbers, hasCtcLapCompletionSelection, type CtcTrackConfig } from '../model/ctcTrackConfig';
import type { MrScatsDataFileSummary } from '../parsers/mrScats/fileInventory';

export type DataSourceType =
  | 'timing-rfid-decoder'
  | 'timing-mylaps-decoder'
  | 'timing-dorian-data1-supernode'
  | 'file-rfid-timing-csv'
  | 'file-dorian-ctc-srt'
  | 'file-mr-scats-data'
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

export type DataImportMode = 'import' | 'update';

export interface LocalFileSourceConfig {
  ctcTrackConfig?: CtcTrackConfig;
  filePath?: string;
  importPlaceholderEntrantsForUnknownTransmitters?: boolean;
  importMode?: DataImportMode;
  trackConfigFilePath?: string;
}

export interface MrScatsSourceConfig {
  dataLocationPath?: string;
  files: MrScatsDataFileSummary[];
  ignoreLineOneNo1CrossingsWhenDbfPresent?: boolean;
  sourceKind?: 'archive' | 'directory';
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
  finishLineNumbers?: number[];
  id: string;
  listedEvents?: ApicalListedEvent[];
  masterEntrantConfig?: MasterEntrantSourceConfig;
  mrScatsConfig?: MrScatsSourceConfig;
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

export interface FastestTimeIndicatorColors {
  entrantFasterTime: string;
  entrantFastestTime: string;
  sessionFastestTime: string;
}

export type TimingContextSelectionMode = 'active' | 'session';

export interface TimingContextSelectionConfig {
  eventId?: EventId;
  selectionMode: TimingContextSelectionMode;
  sessionId?: SessionId;
}

export interface SystemConfiguration {
  apicalListedEvents?: ApicalListedEvent[];
  dataSources: DataSourceConfig[];
  eventOptions: Record<string, EventOptionsConfig>;
  eventSourceAssignments: Record<string, string[]>;
  fastestTimeIndicatorColors: FastestTimeIndicatorColors;
  localStorageDirectoryPath: string;
  schemaVersion: 1;
  sessionSourceAssignments: Record<string, SessionSourceAssignment>;
  timingContextSelection: TimingContextSelectionConfig;
}

export const DEFAULT_LOCAL_STORAGE_DIRECTORY_PATH = path.resolve('src/generated');
export const DEFAULT_FASTEST_TIME_INDICATOR_COLORS: FastestTimeIndicatorColors = {
  entrantFasterTime: '#f2c94c',
  entrantFastestTime: '#21a366',
  sessionFastestTime: '#8a2be2',
};
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
  fastestTimeIndicatorColors: DEFAULT_FASTEST_TIME_INDICATOR_COLORS,
  localStorageDirectoryPath: DEFAULT_LOCAL_STORAGE_DIRECTORY_PATH,
  schemaVersion: 1,
  sessionSourceAssignments: {},
  timingContextSelection: {
    selectionMode: 'active',
  },
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

const normalizeFinishLineNumbers = (finishLineNumbers: number[] | undefined): number[] | undefined => {
  if (!finishLineNumbers) {
    return undefined;
  }

  const uniqueNumbers = Array.from(new Set(
    finishLineNumbers
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
  ));
  return uniqueNumbers.length > 0 ? uniqueNumbers : undefined;
};

const normalizeMrScatsSourceConfig = (config: MrScatsSourceConfig | undefined): MrScatsSourceConfig | undefined => {
  if (!config) {
    return undefined;
  }

  return {
    ...config,
    dataLocationPath: normalizeOptionalSystemFilePath(config.dataLocationPath),
    files: config.files || [],
    ignoreLineOneNo1CrossingsWhenDbfPresent: config.ignoreLineOneNo1CrossingsWhenDbfPresent !== false,
  };
};

const normalizeApicalListedEvents = (listedEvents: ApicalListedEvent[] | undefined): ApicalListedEvent[] => {
  return (listedEvents || []).map((event) => ({ ...event }));
};

const normalizeTimingContextSelection = (
  selection: Partial<TimingContextSelectionConfig> | undefined
): TimingContextSelectionConfig => {
  if (selection?.selectionMode === 'session') {
    return {
      eventId: selection.eventId,
      selectionMode: 'session',
      sessionId: selection.sessionId,
    };
  }

  return {
    selectionMode: 'active',
  };
};

export const normalizeDataSourceConfig = (source: DataSourceConfig, apicalListedEvents: ApicalListedEvent[] = []): DataSourceConfig => {
  if (source.type === 'file-mr-scats-data') {
    return {
      ...source,
      finishLineNumbers: normalizeFinishLineNumbers(source.finishLineNumbers) || [1],
      mrScatsConfig: normalizeMrScatsSourceConfig(source.mrScatsConfig) || { files: [] },
    };
  }

  if (source.type === 'file-dorian-ctc-srt') {
    const configuredFinishLines = normalizeFinishLineNumbers(source.finishLineNumbers) || [];
    const ctcFinishLines = getCtcFinishLineNumbers(source.fileConfig?.ctcTrackConfig) || [];
    const finishLineNumbers = hasCtcLapCompletionSelection(source.fileConfig?.ctcTrackConfig)
      ? ctcFinishLines
      : Array.from(new Set([...configuredFinishLines, ...ctcFinishLines])).sort((left, right) => left - right);
    return {
      ...source,
      fileConfig: {
        ctcTrackConfig: source.fileConfig?.ctcTrackConfig,
        filePath: normalizeOptionalSystemFilePath(source.fileConfig?.filePath),
        importPlaceholderEntrantsForUnknownTransmitters: source.fileConfig?.importPlaceholderEntrantsForUnknownTransmitters === true,
        importMode: source.fileConfig?.importMode === 'update' ? 'update' : 'import',
        trackConfigFilePath: normalizeOptionalSystemFilePath(source.fileConfig?.trackConfigFilePath),
      },
      finishLineNumbers,
    };
  }

  if (source.type === 'timing-dorian-data1-supernode') {
    return {
      ...source,
      finishLineNumbers: normalizeFinishLineNumbers(source.finishLineNumbers) || [1],
    };
  }

  if (!isApicalDataSource(source) || !source.apiConfig) {
    return {
      ...source,
      finishLineNumbers: normalizeFinishLineNumbers(source.finishLineNumbers),
    };
  }

  const selectedEventIds = source.apiConfig.selectedEventIds?.length > 0
    ? source.apiConfig.selectedEventIds
    : source.apiConfig.apicalEventId
      ? [source.apiConfig.apicalEventId]
      : [];

  return {
    ...source,
    apicalDataFilePath: normalizeOptionalSystemFilePath(source.apicalDataFilePath),
    finishLineNumbers: normalizeFinishLineNumbers(source.finishLineNumbers),
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
    fastestTimeIndicatorColors: {
      ...DEFAULT_FASTEST_TIME_INDICATOR_COLORS,
      ...(config.fastestTimeIndicatorColors || {}),
    },
    localStorageDirectoryPath: normalizeLocalStorageDirectoryPath(config.localStorageDirectoryPath, config.apicalExcelCacheDirectoryPath),
    schemaVersion: 1,
    sessionSourceAssignments: config.sessionSourceAssignments || {},
    timingContextSelection: normalizeTimingContextSelection(config.timingContextSelection),
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
  case 'file-dorian-ctc-srt':
    return 'Dorian CTC SRT / ERF File';
  case 'file-mr-scats-data':
    return 'MR-SCATS Data';
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

export const getFinishLineNumbersForSession = (
  config: SystemConfiguration,
  eventId: EventId,
  sessionId: SessionId
): number[] | undefined => {
  const sourceIds = getSessionAssignedSourceIds(config, eventId, sessionId);
  const source = config.dataSources.find((candidate) => candidate.enabled && sourceIds.includes(candidate.id) && (
    (candidate.finishLineNumbers || []).length > 0 || candidate.type === 'file-dorian-ctc-srt'
  ));
  if (!source) {
    return undefined;
  }
  const configuredFinishLines = source.finishLineNumbers || [];
  const ctcFinishLines = source.type === 'file-dorian-ctc-srt'
    ? getCtcFinishLineNumbers(source.fileConfig?.ctcTrackConfig) || []
    : [];
  const finishLineNumbers = source.type === 'file-dorian-ctc-srt' && hasCtcLapCompletionSelection(source.fileConfig?.ctcTrackConfig)
    ? ctcFinishLines
    : Array.from(new Set([...configuredFinishLines, ...ctcFinishLines]));
  return finishLineNumbers.length > 0 ? finishLineNumbers : undefined;
};

export const getMasterEntrantProfilesForEvent = (config: SystemConfiguration, eventId: EventId): MasterEntrantProfile[] => {
  const sourceIds = getEventAssignedSourceIds(config, eventId);

  return config.dataSources
    .filter((source) => source.enabled && sourceIds.includes(source.id) && source.type === 'master-entrant-profiles')
    .flatMap((source) => source.masterEntrantConfig?.profiles || []);
};
