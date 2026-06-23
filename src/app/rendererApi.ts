import type { AvailableReceiveChannels, AvailableSendChannels, ExternalHttpProxyRequest, ExternalHttpProxyResponse, FileReadDataType, FileWriteDataType, SelectLocalFileOptions } from './window.js';

type RendererApi = {
  receive: (channel: AvailableReceiveChannels | string, func: (...args: unknown[]) => unknown) => void;
  requestBuffer: (filePath: string) => Promise<Buffer>;
  requestExternalHttp: (request: ExternalHttpProxyRequest) => Promise<ExternalHttpProxyResponse>;
  requestFileContent: <DataType>(filePath: string, dataType: FileReadDataType) => Promise<DataType>;
  openLocalFile: (filePath: string) => Promise<void>;
  selectLocalFile: (options?: SelectLocalFileOptions) => Promise<string | undefined>;
  send: (channel: AvailableSendChannels, ...args: unknown[]) => void;
  writeFileContent: (filePath: string, contents: string, dataType?: FileWriteDataType) => Promise<void>;
};

const requiredRendererApiMethods = [
  'receive',
  'requestBuffer',
  'requestExternalHttp',
  'requestFileContent',
  'openLocalFile',
  'selectLocalFile',
  'send',
  'writeFileContent',
] as const satisfies ReadonlyArray<keyof RendererApi>;

export type RendererApiMethod = typeof requiredRendererApiMethods[number];

export class RendererApiUnavailableError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RendererApiUnavailableError';
  }
}

const describeMissingRendererApi = (missingMethods: string[]): string => {
  const missing = missingMethods.length > 0 ? ` Missing methods: ${missingMethods.join(', ')}.` : '';
  return `RaceSweet Electron preload API is not available or incomplete. window.api must be populated by src/app/preload.ts before renderer persistence services are created.${missing}`;
};

export const assertRendererApi: (
  api: Partial<RendererApi> | undefined,
  requiredMethods?: readonly RendererApiMethod[]
) => asserts api is RendererApi = (
  api: Partial<RendererApi> | undefined,
  requiredMethods: readonly RendererApiMethod[] = requiredRendererApiMethods
) => {
  if (!api || typeof api !== 'object') {
    throw new RendererApiUnavailableError(describeMissingRendererApi([...requiredMethods]));
  }

  const missingMethods = requiredMethods.filter((method) => typeof api[method] !== 'function');
  if (missingMethods.length > 0) {
    throw new RendererApiUnavailableError(describeMissingRendererApi(missingMethods));
  }
};

export const getRendererApi = (
  requiredMethods: readonly RendererApiMethod[] = requiredRendererApiMethods
): RendererApi => {
  if (typeof window === 'undefined') {
    throw new RendererApiUnavailableError('RaceSweet renderer API can only be used in a browser/Electron renderer context.');
  }

  const api = (window as Partial<Window>).api as Partial<RendererApi> | undefined;
  assertRendererApi(api, requiredMethods);
  return api;
};
