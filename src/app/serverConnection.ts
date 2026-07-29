import type { EventCatalogLedger } from '../ledger/eventCatalogLedger.js';
import type { AdministrativeChanges } from '../persistence/raceAdminPersistence.js';
import type { SystemConfiguration } from './systemConfig.js';
import type { FileReadDataType } from './window.js';

const SERVER_CATALOG_PATH_SUFFIX: string = 'event-catalog.json';
const SERVER_ADMIN_PATH_SUFFIX: string = 'admin-overrides.json';
const SERVER_CONFIG_PATH_SUFFIX: string = 'system-config.json';

const isServerPersistencePath = (filePath: string, suffix: string): boolean =>
  filePath.replace(/\\/gu, '/').endsWith(suffix);

const requestJson = async <TValue>(
  requestPath: string,
  init: RequestInit = {},
): Promise<TValue> => {
  const response: Response = await fetch(requestPath, {
    ...init,
    credentials: 'include',
  });
  if (!response.ok) {
    const problem: { error?: string } = await response.json().catch(
      (): { error?: string } => ({}),
    );
    throw new Error(problem.error || `RaceSweet API returned HTTP ${response.status}.`);
  }
  return response.json() as Promise<TValue>;
};

const selectBrowserFile = async (
  options: Parameters<Window['api']['selectLocalFile']>[0],
): Promise<string | undefined> => new Promise<string | undefined>((resolve): void => {
  const input: HTMLInputElement = document.createElement('input');
  input.type = 'file';
  input.accept = (options?.filters || [])
    .flatMap((filter): string[] => filter.extensions.map((extension: string): string => `.${extension}`))
    .join(',');
  input.addEventListener('change', (): void => {
    const file: File | undefined = input.files?.[0];
    if (!file) {
      resolve(undefined);
      return;
    }
    const parameters: URLSearchParams = new URLSearchParams({
      mediaType: file.type || 'application/octet-stream',
      name: file.name,
      relativePath: file.webkitRelativePath || file.name,
    });
    fetch(`/api/v1/uploads?${parameters}`, {
      body: file,
      credentials: 'include',
      method: 'POST',
    })
      .then((response: Response): Promise<{ id: string }> => {
        if (!response.ok) {
          throw new Error(`RaceSweet upload returned HTTP ${response.status}.`);
        }
        return response.json() as Promise<{ id: string }>;
      })
      .then((upload: { id: string }): void => resolve(`racesweet-upload:${upload.id}`))
      .catch((): void => resolve(undefined));
  }, { once: true });
  input.click();
});

export const createServerConnectedRendererApi = (
  nativeApi?: Window['api'],
): Window['api'] => ({
  persistenceMode: 'server',
  openExternalUrl: nativeApi?.openExternalUrl || (async (url: string): Promise<void> => {
    globalThis.open(url, '_blank', 'noopener,noreferrer');
  }),
  openLocalFile: nativeApi?.openLocalFile || (async (filePath: string): Promise<void> => {
    globalThis.open(filePath, '_blank', 'noopener,noreferrer');
  }),
  receive: nativeApi?.receive || ((): void => undefined),
  requestBuffer: async (filePath: string): Promise<Buffer> => {
    if (nativeApi && !filePath.startsWith('racesweet-upload:')) {
      return nativeApi.requestBuffer(filePath);
    }
    if (!filePath.startsWith('racesweet-upload:')) {
      throw new Error('Web clients can only read files selected through the upload control.');
    }
    const uploadId: string = filePath.slice('racesweet-upload:'.length);
    const response: Response = await fetch(`/api/v1/uploads/${encodeURIComponent(uploadId)}`, {
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`RaceSweet download returned HTTP ${response.status}.`);
    }
    return new Uint8Array(await response.arrayBuffer()) as Buffer;
  },
  requestExternalHttp: nativeApi?.requestExternalHttp || (async (): Promise<never> => {
    throw new Error('External HTTP requests must be performed by the RaceSweet server in web mode.');
  }),
  requestFileContent: async <DataType>(
    filePath: string,
    _dataType: FileReadDataType,
  ): Promise<DataType> => {
    if (isServerPersistencePath(filePath, SERVER_CATALOG_PATH_SUFFIX)) {
      const result: { mutations: EventCatalogLedger['mutations'] } =
        await requestJson('/api/v1/mutations');
      return JSON.stringify({
        mutations: result.mutations,
        schemaVersion: 1,
      }) as DataType;
    }
    if (isServerPersistencePath(filePath, SERVER_CONFIG_PATH_SUFFIX)) {
      const config: SystemConfiguration =
        await requestJson<SystemConfiguration>('/api/v1/system/configuration');
      return JSON.stringify(config) as DataType;
    }
    if (isServerPersistencePath(filePath, SERVER_ADMIN_PATH_SUFFIX)) {
      const changes: AdministrativeChanges =
        await requestJson<AdministrativeChanges>('/api/v1/race-admin');
      return JSON.stringify(changes) as DataType;
    }
    if (nativeApi) {
      return nativeApi.requestFileContent<DataType>(filePath, _dataType);
    }
    throw new Error(`Web clients cannot read the server-local path ${filePath}.`);
  },
  selectLocalDirectory: nativeApi?.selectLocalDirectory || (async (): Promise<string | undefined> =>
    selectBrowserFile({
      title: 'Select files to upload',
    })),
  selectLocalFile: nativeApi?.selectLocalFile || selectBrowserFile,
  send: nativeApi?.send || ((): void => undefined),
  writeFileContent: async (
    filePath: string,
    contents: string,
  ): Promise<void> => {
    if (isServerPersistencePath(filePath, SERVER_CATALOG_PATH_SUFFIX)) {
      const ledger: Partial<EventCatalogLedger> = JSON.parse(contents) as Partial<EventCatalogLedger>;
      if (!Array.isArray(ledger.mutations)) {
        throw new Error(
          'Server-backed event catalog persistence requires a complete mutation ledger.',
        );
      }
      await requestJson('/api/v1/mutations', {
        body: JSON.stringify({ mutations: ledger.mutations }),
        headers: { 'content-type': 'application/json' },
        method: 'PUT',
      });
      return;
    }
    if (isServerPersistencePath(filePath, SERVER_CONFIG_PATH_SUFFIX)) {
      const config: SystemConfiguration = JSON.parse(contents) as SystemConfiguration;
      await requestJson('/api/v1/system/configuration', {
        body: JSON.stringify({ config }),
        headers: { 'content-type': 'application/json' },
        method: 'PUT',
      });
      return;
    }
    if (isServerPersistencePath(filePath, SERVER_ADMIN_PATH_SUFFIX)) {
      const changes: AdministrativeChanges = JSON.parse(contents) as AdministrativeChanges;
      await requestJson('/api/v1/race-admin', {
        body: JSON.stringify({ changes }),
        headers: { 'content-type': 'application/json' },
        method: 'PUT',
      });
      return;
    }
    if (nativeApi) {
      await nativeApi.writeFileContent(filePath, contents);
      return;
    }
    throw new Error(`Web clients cannot write the server-local path ${filePath}.`);
  },
});

export const installServerConnectedRendererApi = (): void => {
  if (typeof window === 'undefined') {
    return;
  }
  const nativeApi: Window['api'] | undefined = window.api;
  window.api = createServerConnectedRendererApi(nativeApi);
  window.nodeAPI = window.nodeAPI || {
    createBuffer: (data: string | Uint8Array | ArrayBuffer): Buffer => {
      if (typeof data === 'string') {
        return new TextEncoder().encode(data) as Buffer;
      }
      return data instanceof Uint8Array ? data as Buffer : new Uint8Array(data) as Buffer;
    },
  };
  window.versions = window.versions || {
    chrome: (): string => navigator.userAgent,
    electron: (): string => '',
    node: (): string => '',
  };
};
