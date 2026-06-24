import path from 'node:path';
import { v5 as uuidv5, validate as validateUuid } from 'uuid';
import type * as XlsxNamespace from 'xlsx';
import { readApicalExcelBuffer } from '../controllers/apical/apicalSpreadsheetProcessor.js';
import { generateExcelData } from '../controllers/apical/generateExcel.js';
import { ApicalDataException } from '../errors/apicalDataException.js';
import { ApicalRequestFailedError } from '../errors/ApicalRequestFailedError.js';
import type { ApicalLapByCategory } from '../model/apical.js';
import { createSessionId } from '../model/ids.js';
import { EventId, SessionId } from '../model/raceevent.js';
import type { RaceState } from '../model/racestate.js';
import { convertDataToRaceState } from '../parsers/apical.js';
import { getErrorMessage } from '../utils.js';
import { createApicalExcelDownloadHeaders, getApicalExcelDownloadUrl, readApicalExcelPayloadBuffer } from '../utils/apical/excelDownload.js';
import { fetchExternalHttp, isSensitiveHeader } from '../utils/externalHttp.js';
import { RendererApiUnavailableError, getRendererApi } from './rendererApi.js';
import { remapStackTrace } from './stackTrace.js';
import { DEFAULT_LOCAL_STORAGE_DIRECTORY_PATH, normalizeSystemDirectoryPath, type ApicalListedEvent, type DataSourceConfig } from './systemConfig.js';
import { getSystemTimeZone } from './utils/timeutils.js';
const APICAL_EVENT_ID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const APICAL_EXCEL_CACHE_DIRECTORY_NAME = 'apical-excel-cache';

type XlsxModule = typeof XlsxNamespace;

let xlsxModulePromise: Promise<XlsxModule> | undefined;

export interface PulledApicalRaceState {
  apicalEventId: number;
  apicalDataFilePath: string;
  eventDate?: string;
  eventId: EventId;
  eventName: string;
  raceState: Partial<RaceState>;
  retrievedAt: string;
  sessionId: string;
  timeZone: string;
}

interface ApicalRaceStateOptions {
  apicalExcelCacheDirectoryPath?: string;
  cachedSpreadsheetOnly?: boolean;
  localStorageDirectoryPath?: string;
  preferCachedSpreadsheet?: boolean;
  timeZone?: string;
}

interface ApicalExportToExcelResponse {
  Cookie?: string;
  FileGuid: string;
  FileName: string;
}

export interface ApicalSpreadsheetLapsRow {
  CategoryName: string;
  CumulativeLapTimeSpan: string | number;
  FullName: string;
  LapNumber: number;
  LapTimeSpan: string | number;
  Position: number;
  RaceNumber: number | string;
  TeamNameDisplay: string;
  TimeOfDay: string | number;
  TotalTimeSpan?: string | number;
}

const resolveXlsxModule = (module: Partial<XlsxModule> & { default?: unknown }): XlsxModule => {
  const defaultModule = module.default as Partial<XlsxModule> | undefined;
  const candidate = typeof module.read === 'function' ? module : defaultModule;

  if (!candidate || typeof candidate.read !== 'function' || typeof candidate.utils?.sheet_to_json !== 'function') {
    throw new Error('XLSX module was not loaded correctly. Check the Electron/Webpack xlsx import configuration.');
  }

  return candidate as XlsxModule;
};

export const loadXlsx = async (): Promise<XlsxModule> => {
  xlsxModulePromise ||= import('xlsx').then((module) => resolveXlsxModule(module as Partial<XlsxModule> & { default?: unknown }));
  return xlsxModulePromise;
};

export const getConfiguredApicalEventId = (source: DataSourceConfig): number | undefined => {
  return source.apiConfig?.selectedEventIds[0] || source.apiConfig?.apicalEventId;
};

export const createApicalCatalogEventId = (apicalEventId: number): EventId => {
  return uuidv5(`apical-event-${apicalEventId}`, APICAL_EVENT_ID_NAMESPACE) as EventId;
};

export const createApicalCatalogSessionId = (apicalEventId: number): SessionId => createSessionId(`session-apical-${apicalEventId}`);

export const getCachedApicalExcelFilePath = (
  apicalEventId: number,
  localStorageDirectoryPath: string = DEFAULT_LOCAL_STORAGE_DIRECTORY_PATH
): string => {
  return path.resolve(normalizeSystemDirectoryPath(localStorageDirectoryPath), APICAL_EXCEL_CACHE_DIRECTORY_NAME, `apical-event-${apicalEventId}.xlsx`);
};

const getListedApicalEvent = (source: DataSourceConfig, apicalEventId: number): ApicalListedEvent | undefined => {
  return source.listedEvents?.find((eventItem) => eventItem.id === apicalEventId);
};

const getAuthHeader = (source: DataSourceConfig): { name: string; value: string } | undefined => {
  const apiConfig = source.apiConfig;
  if (!apiConfig) {
    return undefined;
  }

  const name = apiConfig.authHeaderName.trim();
  const value = apiConfig.authHeaderValue.trim();
  if (name.length === 0 || value.length === 0) {
    return undefined;
  }

  return { name, value };
};

const readSetCookie = (response: Response): string | undefined => {
  return response.headers.get('set-cookie') || undefined;
};

export const createAuthenticatedHeaders = (source: DataSourceConfig, cookie?: string): Headers => {
  const headers = new Headers();
  const authHeader = getAuthHeader(source);
  if (authHeader) {
    headers.set(authHeader.name, authHeader.value);
  }
  if (cookie) {
    headers.set('Cookie', cookie);
  }
  headers.set('Accept', 'application/json');

  return headers;
};

const readResponseBody = async (response: Response): Promise<string | undefined> => {
  try {
    const body = await response.text();
    const trimmedBody = body.trim();
    if (trimmedBody.length === 0) {
      return undefined;
    }

    return trimmedBody.length > 1000 ? `${trimmedBody.slice(0, 1000)}...` : trimmedBody;
  } catch (error: unknown) {
    return `Could not read response body: ${getErrorMessage(error)}`;
  }
};

const formatHeaders = (
  heading: string,
  headersInit: HeadersInit | undefined,
  includeSensitiveHeaders: boolean = false,
  note?: string
): string => {
  if (!headersInit) {
    return `${heading} (none)`;
  }

  try {
    const headers = new Headers(headersInit);
    const headerLines = Array.from(headers.entries())
      .sort(([headerNameA], [headerNameB]) => headerNameA.localeCompare(headerNameB))
      .map(([name, value]) => {
        const displayValue = !includeSensitiveHeaders && isSensitiveHeader(name) ? `[redacted, ${value.length} chars; present]` : value;
        return `  ${name}: ${displayValue}`;
      });

    return headerLines.length > 0
      ? [heading, note ? `  (${note})` : undefined, ...headerLines].filter((line): line is string => Boolean(line)).join('\n')
      : `${heading} (none)`;
  } catch (error: unknown) {
    return `${heading} could not format headers: ${getErrorMessage(error)}`;
  }
};

export const formatRequestHeaders = (
  headersInit: RequestInit['headers'],
  includeSensitiveHeaders: boolean = false
): string => formatHeaders(
  'Request headers:',
  headersInit,
  includeSensitiveHeaders,
  includeSensitiveHeaders ? 'client-provided fetch headers; sensitive values included for debug output' : 'client-provided fetch headers; sensitive values redacted'
);

export const formatResponseHeaders = (
  response: Response,
  includeSensitiveHeaders: boolean = false
): string => formatHeaders(
  'Response headers:',
  response.headers,
  includeSensitiveHeaders,
  includeSensitiveHeaders ? 'sensitive values included for debug output' : 'sensitive values redacted'
);

const formatResponseStatusAndHeaders = (response: Response): string => [
  `Response status: ${response.status} ${response.statusText || '(no status text)'}`,
  formatResponseHeaders(response),
].join('\n');

const formatRequestOptions = (init: RequestInit, timeoutMs: number): string => [
  'Request options:',
  `  method: ${init.method || 'GET'}`,
  `  mode: ${init.mode || '(default)'}`,
  `  credentials: ${init.credentials || '(default)'}`,
  `  cache: ${init.cache || '(default)'}`,
  `  redirect: ${init.redirect || '(default)'}`,
  `  timeoutMs: ${timeoutMs}`,
].join('\n');

const getErrorProperty = (error: unknown, propertyName: string): unknown => {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  return (error as Record<string, unknown>)[propertyName];
};

const formatUnknownErrorDetails = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return `Error: ${String(error)}`;
  }

  const details = [
    `Error name: ${error.name}`,
    `Error message: ${error.message}`,
  ];
  const errorCode = getErrorProperty(error, 'code');
  const errorErrno = getErrorProperty(error, 'errno');
  const errorType = getErrorProperty(error, 'type');

  if (errorCode !== undefined) {
    details.push(`Error code: ${String(errorCode)}`);
  }
  if (errorErrno !== undefined) {
    details.push(`Error errno: ${String(errorErrno)}`);
  }
  if (errorType !== undefined) {
    details.push(`Error type: ${String(errorType)}`);
  }
  if (error.cause !== undefined) {
    details.push(`Error cause: ${formatUnknownErrorDetails(error.cause)}`);
  }
  if (error.stack) {
    details.push(`Stack:\n${remapStackTrace(error.stack)}`);
  }

  return details.join('\n');
};

const describeRequestFailure = (phase: string, url: string, init: RequestInit, timeoutMs: number, error: unknown, includeSensitiveHeaders: boolean = false): string => [
  `Apical ${phase} request failed.`,
  `URL: ${url}`,
  formatRequestOptions(init, timeoutMs),
  formatRequestHeaders(init.headers, includeSensitiveHeaders),
  'Response: no HTTP response was received before fetch failed.',
  formatUnknownErrorDetails(error),
].join('\n');

export const fetchApicalResponse = async (
  phase: string,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  logSensitiveHeaders: boolean = false
): Promise<Response> => {
  let response: Response;
  console.debug(`Apical ${phase} request starting: ${url}\n${formatRequestOptions(init, timeoutMs)}\n${formatRequestHeaders(init.headers)}`);
  try {
    console.debug([
      `Fetching Apical ${phase} request from url ${url}.`,
      formatRequestOptions(init, timeoutMs),
      formatRequestHeaders(init.headers, true),
    ].join('\n'));
    response = await fetchExternalHttp(url, {
      body: init.body,
      credentials: init.credentials,
      headers: init.headers,
      method: init.method,
      timeoutMs,
    });
  } catch (error: unknown) {
    const message = describeRequestFailure(phase, url, init, timeoutMs, error);
    console.error(message);
    const err: ApicalRequestFailedError = new ApicalRequestFailedError(phase, url, init, timeoutMs);
    err.message = message;
    err.cause = error;
    throw err;
  }

  console.debug([
    `Received Apical ${phase} response from url ${url}.`,
    `HTTP status: ${response.status} ${response.statusText || '(no status text)'}`,
    formatRequestHeaders(response.headers, true),
    formatResponseHeaders(response, true),
  ].join('\n'));

  if (!response.ok) {
    const body = await readResponseBody(response);
    const message = [
      `Apical ${phase} request returned HTTP ${response.status} ${response.statusText || '(no status text)'}.`,
      `URL: ${url}`,
      `HTTP status: ${response.status} ${response.statusText || '(no status text)'}`,
      formatRequestHeaders(init.headers, logSensitiveHeaders),
      formatResponseHeaders(response, logSensitiveHeaders),
      body ? `Response body: ${body}` : 'Response body: (empty)',
    ].join('\n');
    console.error(message);
    const err: ApicalRequestFailedError = new ApicalRequestFailedError(phase, url, init, timeoutMs);
    err.message = message;
    err.body = body;
    err.status = response.status;
    throw err;
  }

  return response;
};

// export const authenticateSession = async (source: DataSourceConfig): Promise<string | undefined> => {
//   const apiConfig = source.apiConfig;
//   if (!apiConfig) {
//     return undefined;
//   }

//   const authHeader = getAuthHeader(source);
//   if (!authHeader) {
//     return undefined;
//   }

//   const authEventId = getConfiguredApicalEventId(source);
//   if (!authEventId) {
//     return undefined;
//   }

  
//   const headers = createAuthenticatedHeaders(source);
//   headers.set('X-Requested-With', 'XMLHttpRequest');

//   // const response = await fetchApicalResponse(
//   //   'authentication',
//   //   authUrl,
//   //   {
//   //     headers,
//   //     method: 'GET',
//   //   },
//   //   apiConfig.httpTimeoutSeconds * 1000
//   // );

//   const cookie = readSetCookie(response);
//   if (!cookie) {
//     throw new ApicalDataException(`Authentication request to ${authUrl} did not return a set-cookie header. Check that the auth header is correct and has sufficient permissions to access the event data.`);
//   }
//   return cookie;
// };

// const generateApicalExcelExport = async (source: DataSourceConfig, apicalEventId: number): Promise<ApicalExportToExcelResponse> => {
//   if (!source.apiConfig) {
//     throw new Error('Apical API config is missing');
//   }

//   const headers = createAuthenticatedHeaders(source);
//   headers.set('X-Requested-With', 'XMLHttpRequest');
//   const url = getApicalExcelExportUrl(source.apiConfig.baseUrl, apicalEventId);
//   const response = await fetchApicalResponse(
//     'Excel export',
//     url,
//     {
//       credentials: 'include',
//       headers,
//       method: 'GET',
//       mode: 'cors',
//     },
//     source.apiConfig.httpTimeoutSeconds * 1000
//   );
//   console.debug(`Request headers for Excel export: ${formatRequestHeaders(headers, true)}`);
//   console.debug(`Response headers for Excel export: ${formatResponseHeaders(response, true)}`);

//   const payload = await response.json() as Partial<ApicalExportToExcelResponse>;
//   if (!payload.FileGuid || !isGuid(payload.FileGuid) || !payload.FileName) {
//     throw new ApicalDataException([
//       'Apical Excel export response payload was invalid',
//        `${JSON.stringify(payload)}`,
//     ].join('\n'));
//   }
//   return {
//     Cookie: readSetCookie(response),
//     FileGuid: payload.FileGuid,
//     FileName: payload.FileName,
//   };
// };

export const apicalSafeNumber = (value: number | string): string => value.toString().replace(/\D/g, '') || '0';

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  return Buffer.from(new Uint8Array(buffer)).toString('base64');
};

const bufferLikeToArrayBuffer = (buffer: ArrayBuffer | Buffer | Uint8Array): ArrayBuffer => {
  if (buffer instanceof ArrayBuffer) {
    return buffer;
  }

  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  const copy = new Uint8Array(arrayBuffer);
  copy.set(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
  return arrayBuffer;
};

const readCachedApicalExcelPayload = async (apicalEventId: number, cacheDirectoryPath: string): Promise<ApicalLapByCategory | undefined> => {
  try {
    const api = getRendererApi(['requestBuffer']);
    const buffer = await api.requestBuffer(getCachedApicalExcelFilePath(apicalEventId, cacheDirectoryPath));
    return readApicalExcelBuffer(bufferLikeToArrayBuffer(buffer));
  } catch (error: unknown) {
    if (error instanceof RendererApiUnavailableError) {
      return undefined;
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('ENOENT') || message.includes('no such file')) {
      return undefined;
    }

    throw error;
  }
};

const cacheApicalExcelPayload = async (apicalEventId: number, buffer: ArrayBuffer, cacheDirectoryPath: string): Promise<void> => {
  try {
    const api = getRendererApi(['writeFileContent']);
    await api.writeFileContent(getCachedApicalExcelFilePath(apicalEventId, cacheDirectoryPath), arrayBufferToBase64(buffer), 'base64');
  } catch (error: unknown) {
    if (error instanceof RendererApiUnavailableError) {
      return;
    }

    throw error;
  }
};

const fetchApicalDataFilePayload = async (source: DataSourceConfig, apicalEventId: number, cacheDirectoryPath: string): Promise<ApicalLapByCategory> => {
  if (!source.apiConfig) {
    throw new Error('Apical API config is missing');
  }

  const exportHeaders = createAuthenticatedHeaders(source);
  const excelData: ApicalExportToExcelResponse = await generateExcelData(apicalEventId, {
    baseUrl: source.apiConfig.baseUrl,
    headers: exportHeaders,
  });
  // const exportResponse = await generateApicalExcelExport(source, apicalEventId);
  const headers = createApicalExcelDownloadHeaders(source.apiConfig.baseUrl, apicalEventId);
  const url = getApicalExcelDownloadUrl(source.apiConfig.baseUrl, excelData.FileGuid, excelData.FileName);
  if (excelData.Cookie) {
    headers.set('Cookie', excelData.Cookie);
  } else {
    console.warn(`Apical Excel export for event id ${apicalEventId} did not provide cookie data. Continuing with credentialed Electron fetch; the download may still succeed if the cookie is held in the Electron session.`);
  }
  if (source.apiConfig.baseUrl.includes('apicalracetiming.com.au')) {
    const authHeader = getAuthHeader(source);
    if (authHeader) {
      headers.set('Authorization', authHeader ? `${authHeader.name} ${authHeader.value}` : '');
    }
  }

  const response = await fetchApicalResponse(
    'Excel download',
    url,
    {
      credentials: 'include',
      headers,
      method: 'GET',
      mode: 'cors',
    },
    source.apiConfig.httpTimeoutSeconds * 1000
  );

  try {
    if (!response) {
      throw new ApicalDataException(`No response received when trying to read Apical Excel payload.`);
    }

    const buffer = await response.arrayBuffer();
    await cacheApicalExcelPayload(apicalEventId, buffer, cacheDirectoryPath);
    const payload = await readApicalExcelPayloadBuffer(buffer);
    return payload;
  } catch (err: unknown) {
    if (err instanceof ApicalDataException) {
      const responseDiagnostics = formatResponseStatusAndHeaders(response);
      if (err.message === 'Apical Excel file was empty') {
        throw new ApicalDataException(`Apical Excel file downloaded from url ${url} was empty\n${responseDiagnostics}`, { cause: err });
      }
      throw new ApicalDataException(`Failed to read Apical Excel payload from url ${url}: ${err.message}\n${responseDiagnostics}`, { cause: err });
    }
    throw err;
  }
};

const loadApicalDataFilePayload = async (source: DataSourceConfig, apicalEventId: number, options: ApicalRaceStateOptions = {}): Promise<ApicalLapByCategory> => {
  const localStorageDirectoryPath = normalizeSystemDirectoryPath(options.localStorageDirectoryPath || options.apicalExcelCacheDirectoryPath);
  if (options.preferCachedSpreadsheet) {
    const cachedPayload = await readCachedApicalExcelPayload(apicalEventId, localStorageDirectoryPath);
    if (cachedPayload) {
      return cachedPayload;
    }

    if (options.cachedSpreadsheetOnly) {
      const cacheFilePath = getCachedApicalExcelFilePath(apicalEventId, localStorageDirectoryPath);
      throw new ApicalDataException(`Cached Apical Excel spreadsheet was not found for event id ${apicalEventId} at ${cacheFilePath}. Fetch event data before loading this session.`);
    }
  }

  return fetchApicalDataFilePayload(source, apicalEventId, localStorageDirectoryPath);
};

export const pullApicalRaceState = async (source: DataSourceConfig, eventId: EventId, options: ApicalRaceStateOptions = {}): Promise<Partial<RaceState>> => {
  if (!validateUuid(eventId)) {
    throw new Error(`Invalid eventId provided: ${eventId}`);
  }
  if (source.type !== 'api-apical-data-file' || !source.apiConfig) {
    throw new Error(`Unsupported source type for live pull: ${source.type}`);
  }

  const apicalEventId = getConfiguredApicalEventId(source);
  if (!apicalEventId) {
    throw new Error('No Apical event id is configured for this source.');
  }

  const payload = await loadApicalDataFilePayload(source, apicalEventId, options);
  const listedEvent = getListedApicalEvent(source, apicalEventId);
  return convertDataToRaceState(eventId, listedEvent?.eventDate ? new Date(listedEvent.eventDate) : new Date(), payload, 200000, options.timeZone || getSystemTimeZone());
};

export const fetchApicalRaceStateNow = async (source: DataSourceConfig, options: ApicalRaceStateOptions = {}): Promise<PulledApicalRaceState> => {
  if (source.type !== 'api-apical-data-file' || !source.apiConfig) {
    throw new Error(`Unsupported source type for Apical data fetch: ${source.type}`);
  }

  const apicalEventId = getConfiguredApicalEventId(source);
  if (!apicalEventId) {
    throw new Error('No Apical event id is configured for this source.');
  }

  const eventId = createApicalCatalogEventId(apicalEventId);
  const listedEvent = getListedApicalEvent(source, apicalEventId);
  try {
    const payload = await loadApicalDataFilePayload(source, apicalEventId, options);
    const retrievedAt = new Date().toISOString();
    const timeZone = options.timeZone || getSystemTimeZone();

    return {
      apicalEventId,
      apicalDataFilePath: getCachedApicalExcelFilePath(apicalEventId, options.localStorageDirectoryPath || options.apicalExcelCacheDirectoryPath),
      eventDate: listedEvent?.eventDate,
      eventId,
      eventName: listedEvent?.name || `Apical Event ${apicalEventId}`,
      raceState: convertDataToRaceState(eventId, listedEvent?.eventDate ? new Date(listedEvent.eventDate) : new Date(), payload, 200000, timeZone),
      retrievedAt,
      sessionId: createApicalCatalogSessionId(apicalEventId),
      timeZone,
    };
  } catch (error: unknown) {
    throw new Error(`Failed to fetch Apical data for event id ${apicalEventId}: ${getErrorMessage(error)}`, { cause: error });
  }
};
