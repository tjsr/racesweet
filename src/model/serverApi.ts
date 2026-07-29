import type { EventCatalogState } from '../catalog/eventCatalog.js';
import type { SystemConfiguration } from '../app/systemConfig.js';

export type UserRole = 'admin' | 'operator' | 'viewer';

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
  username: string;
}

export type ServerRevision = number;

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface DomainEventEnvelope<TPayload extends JsonValue = JsonValue> {
  aggregate: 'catalog' | 'race-admin' | 'server' | 'source' | 'system-config' | 'timing';
  commandId?: string;
  id: string;
  occurredAt: string;
  payload: TPayload;
  revision: ServerRevision;
  type: string;
}

export interface RuntimeCapabilities {
  canOpenLocalFiles: boolean;
  canSelectDirectories: boolean;
  canSelectFiles: boolean;
  runtime: 'electron' | 'web';
}

export interface SafeSystemConfiguration {
  dataSources: Array<{
    enabled: boolean;
    id: string;
    name: string;
    type: string;
  }>;
  eventSourceAssignments: Record<string, string[]>;
  sessionSourceAssignments: SystemConfiguration['sessionSourceAssignments'];
}

export interface ApplicationBootstrap {
  catalog: EventCatalogState;
  permissions: string[];
  revision: ServerRevision;
  runtimeCapabilities: RuntimeCapabilities;
  systemConfiguration: SafeSystemConfiguration;
  timing: {
    activeEventId?: string;
    activeSessionId?: string;
    records: JsonValue[];
  };
  user: AuthenticatedUser;
}

export interface AuthenticationStatus {
  setupRequired: boolean;
  user?: AuthenticatedUser;
}

export interface LoginRequest {
  password: string;
  username: string;
}

export interface SetupRequest extends LoginRequest {
  displayName?: string;
}

export interface SelectedApplicationFile {
  bytes: Uint8Array;
  mediaType: string;
  name: string;
  relativePath: string;
  size: number;
}

export interface UploadedApplicationFile {
  id: string;
  mediaType: string;
  name: string;
  relativePath: string;
  size: number;
}

export interface ApiProblem {
  error: string;
  status: number;
}

export interface RaceSweetApiClient {
  bootstrap(runtime: RuntimeCapabilities['runtime']): Promise<ApplicationBootstrap>;
  login(request: LoginRequest): Promise<AuthenticatedUser>;
  logout(): Promise<void>;
  setup(request: SetupRequest): Promise<AuthenticatedUser>;
  status(): Promise<AuthenticationStatus>;
  subscribe(
    onEvent: (event: DomainEventEnvelope) => void,
    onResyncRequired: () => void,
  ): () => void;
}
