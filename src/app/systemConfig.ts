export type DataSourceType =
  | 'timing-rfid-decoder'
  | 'timing-mylaps-decoder'
  | 'timing-dorian-data1-supernode'
  | 'file-rfid-timing-csv'
  | 'file-apical-data-file'
  | 'file-racesweet-ledger'
  | 'api-aws-sqs'
  | 'api-http-request'
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

export interface SystemConfiguration {
  dataSources: DataSourceConfig[];
  eventSourceAssignments: Record<string, string[]>;
  schemaVersion: 1;
  sessionSourceAssignments: Record<string, SessionSourceAssignment>;
}

export const createDefaultSystemConfiguration = (): SystemConfiguration => ({
  dataSources: [],
  eventSourceAssignments: {},
  schemaVersion: 1,
  sessionSourceAssignments: {},
});

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
  case 'api-apical-data-file':
    return 'Apical Data file';
  case 'master-entrant-profiles':
    return 'Master Entrant Profiles';
  default:
    return type;
  }
};

export const getEventAssignedSourceIds = (config: SystemConfiguration, eventId: string): string[] => {
  return config.eventSourceAssignments[eventId] || [];
};

export const getSessionAssignedSourceIds = (config: SystemConfiguration, eventId: string, sessionId: string): string[] => {
  const sessionAssignment = config.sessionSourceAssignments[sessionId];
  if (!sessionAssignment || sessionAssignment.mode === 'default') {
    return getEventAssignedSourceIds(config, eventId);
  }

  return sessionAssignment.sourceIds;
};

export const getMasterEntrantProfilesForEvent = (config: SystemConfiguration, eventId: string): MasterEntrantProfile[] => {
  const sourceIds = getEventAssignedSourceIds(config, eventId);

  return config.dataSources
    .filter((source) => source.enabled && sourceIds.includes(source.id) && source.type === 'master-entrant-profiles')
    .flatMap((source) => source.masterEntrantConfig?.profiles || []);
};
