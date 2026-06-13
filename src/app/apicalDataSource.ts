import { ApicalDataException } from '../errors/apicalDataException.js';
import type { ApicalLapByCategory } from '../model/apical.js';
import { EventId } from '../model/raceevent.js';
import type { RaceState } from '../model/racestate.js';
import { convertDataToRaceState } from '../parsers/apical.js';
import { fetchExternalHttp } from '../utils/externalHttp.js';
import { remapStackTrace } from './stackTrace.js';
import type { ApicalListedEvent, DataSourceConfig } from './systemConfig.js';
import { v5 as uuidv5 } from 'uuid';
import type * as XlsxNamespace from 'xlsx';

const APICAL_EVENT_ID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type XlsxModule = typeof XlsxNamespace;

let xlsxModulePromise: Promise<XlsxModule> | undefined;

export interface PulledApicalRaceState {
  apicalEventId: number;
  eventDate?: string;
  eventId: EventId;
  eventName: string;
  raceState: Partial<RaceState>;
  retrievedAt: string;
  sessionId: string;
}

interface ApicalExportToExcelResponse {
  Cookie?: string;
  FileGuid: string;
  FileName: string;
}

export interface ApicalSpreadsheetLapsRow {
  CategoryName: string;
  CumulativeLapTimeSpan: string;
  FullName: string;
  LapNumber: number;
  LapTimeSpan: string;
  Position: number;
  RaceNumber: number | string;
  TeamNameDisplay: string;
  TotalTimeSpan?: string;
}

const getErrorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

const trimSlash = (value: string): string => value.replace(/\/$/, '');

const isGuid = (value: string): boolean => GUID_REGEX.test(value);

const resolveXlsxModule = (module: Partial<XlsxModule> & { default?: unknown }): XlsxModule => {
  const defaultModule = module.default as Partial<XlsxModule> | undefined;
  const candidate = typeof module.read === 'function' ? module : defaultModule;

  if (!candidate || typeof candidate.read !== 'function' || typeof candidate.utils?.sheet_to_json !== 'function') {
    throw new Error('XLSX module was not loaded correctly. Check the Electron/Webpack xlsx import configuration.');
  }

  return candidate as XlsxModule;
};

const loadXlsx = async (): Promise<XlsxModule> => {
  xlsxModulePromise ||= import('xlsx').then((module) => resolveXlsxModule(module as Partial<XlsxModule> & { default?: unknown }));
  return xlsxModulePromise;
};

export const getConfiguredApicalEventId = (source: DataSourceConfig): number | undefined => {
  return source.apiConfig?.selectedEventIds[0] || source.apiConfig?.apicalEventId;
};

export const createApicalCatalogEventId = (apicalEventId: number): EventId => {
  return uuidv5(`apical-event-${apicalEventId}`, APICAL_EVENT_ID_NAMESPACE) as EventId;
};

export const createApicalCatalogSessionId = (apicalEventId: number): string => `session-apical-${apicalEventId}`;

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
  try {
    return response.headers.get('set-cookie') || undefined;
  } catch (_error: unknown) {
    return undefined;
  }
};

const createAuthenticatedHeaders = (source: DataSourceConfig, cookie?: string): Headers => {
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

const isSensitiveHeader = (name: string): boolean => {
  const normalizedName = name.toLowerCase();
  return normalizedName === 'authorization' ||
    normalizedName === 'cookie' ||
    normalizedName === 'set-cookie' ||
    normalizedName.includes('token') ||
    normalizedName.includes('secret') ||
    normalizedName.includes('key');
};

const formatRequestHeaders = (headersInit: RequestInit['headers']): string => {
  if (!headersInit) {
    return 'Request headers: (none)';
  }

  try {
    const headers = new Headers(headersInit);
    const headerLines = Array.from(headers.entries())
      .sort(([headerNameA], [headerNameB]) => headerNameA.localeCompare(headerNameB))
      .map(([name, value]) => {
        const displayValue = isSensitiveHeader(name) ? `[redacted, ${value.length} chars]` : value;
        return `  ${name}: ${displayValue}`;
      });

    return headerLines.length > 0
      ? ['Request headers:', ...headerLines].join('\n')
      : 'Request headers: (none)';
  } catch (error: unknown) {
    return `Request headers: could not format headers: ${getErrorMessage(error)}`;
  }
};

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

const describeRequestFailure = (phase: string, url: string, init: RequestInit, timeoutMs: number, error: unknown): string => [
  `Apical ${phase} request failed.`,
  `URL: ${url}`,
  formatRequestOptions(init, timeoutMs),
  formatRequestHeaders(init.headers),
  formatUnknownErrorDetails(error),
].join('\n');

const fetchApicalResponse = async (
  phase: string,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> => {
  let response: Response;
  try {
    response = await fetchExternalHttp(url, {
      body: init.body,
      headers: init.headers,
      method: init.method,
      timeoutMs,
    });
  } catch (error: unknown) {
    throw new Error(describeRequestFailure(phase, url, init, timeoutMs, error), { cause: error });
  }

  if (!response.ok) {
    const body = await readResponseBody(response);
    throw new Error([
      `Apical ${phase} request returned HTTP ${response.status} ${response.statusText || '(no status text)'}.`,
      `URL: ${url}`,
      `HTTP status: ${response.status} ${response.statusText || '(no status text)'}`,
      formatRequestHeaders(init.headers),
      body ? `Response body: ${body}` : 'Response body: (empty)',
    ].join('\n'));
  }

  return response;
};

const authenticateSession = async (source: DataSourceConfig): Promise<string | undefined> => {
  const apiConfig = source.apiConfig;
  if (!apiConfig) {
    return undefined;
  }

  const authHeader = getAuthHeader(source);
  if (!authHeader) {
    return undefined;
  }

  const authEventId = getConfiguredApicalEventId(source);
  if (!authEventId) {
    return undefined;
  }

  const authUrl = `${trimSlash(apiConfig.baseUrl)}/RaceResult/Event/ExportToExcel?eventId=${authEventId}&_=${Date.now()}`;
  const headers = createAuthenticatedHeaders(source);
  headers.set('X-Requested-With', 'XMLHttpRequest');

  const response = await fetchApicalResponse(
    'authentication',
    authUrl,
    {
      headers,
      method: 'GET',
    },
    apiConfig.httpTimeoutSeconds * 1000
  );

  return readSetCookie(response);
};

export const fetchApicalEvents = async (source: DataSourceConfig): Promise<ApicalListedEvent[]> => {
  if (source.type !== 'api-apical-data-file' || !source.apiConfig) {
    return [];
  }

  const cookie = await authenticateSession(source);
  const headers = createAuthenticatedHeaders(source, cookie);
  const url = `${trimSlash(source.apiConfig.baseUrl)}/raceresult/event/getall?companyId=${source.apiConfig.companyId}&_=${Date.now()}`;

  const response = await fetchApicalResponse(
    'event list',
    url,
    {
      credentials: 'omit',
      headers,
      method: 'GET',
      mode: 'cors',
    },
    source.apiConfig.httpTimeoutSeconds * 1000
  );

  const payload = await response.json() as Array<{ CompanyName?: string; EventDate?: string; Id: number; Name: string }>;

  return payload.map((eventItem) => ({
    companyName: eventItem.CompanyName,
    eventDate: eventItem.EventDate,
    id: eventItem.Id,
    name: eventItem.Name,
  }));
};

const getApicalExcelExportUrl = (baseUrl: string, apicalEventId: number): string => `${trimSlash(baseUrl)}/RaceResult/Event/ExportToExcel?eventId=${apicalEventId}&_=${Date.now()}`;

const generateApicalExcelExport = async (source: DataSourceConfig, apicalEventId: number): Promise<ApicalExportToExcelResponse> => {
  if (!source.apiConfig) {
    throw new Error('Apical API config is missing');
  }

  const headers = createAuthenticatedHeaders(source);
  headers.set('X-Requested-With', 'XMLHttpRequest');
  const url = getApicalExcelExportUrl(source.apiConfig.baseUrl, apicalEventId);
  const response = await fetchApicalResponse(
    'Excel export',
    url,
    {
      credentials: 'omit',
      headers,
      method: 'GET',
      mode: 'cors',
    },
    source.apiConfig.httpTimeoutSeconds * 1000
  );

  const payload = await response.json() as Partial<ApicalExportToExcelResponse>;
  if (!payload.FileGuid || !isGuid(payload.FileGuid) || !payload.FileName) {
    throw new ApicalDataException(`Apical Excel export response format was invalid, payload: ${JSON.stringify(payload)}`);
  }

  return {
    Cookie: readSetCookie(response),
    FileGuid: payload.FileGuid,
    FileName: payload.FileName,
  };
};

const apicalSafeNumber = (value: number | string): string => value.toString().replace(/\D/g, '') || '0';

const getEntrantKey = (row: ApicalSpreadsheetLapsRow): string => [
  row.CategoryName,
  row.TeamNameDisplay,
  row.FullName,
  row.RaceNumber,
].join('|');

export const convertApicalSpreadsheetRowsToApicalData = (rows: ApicalSpreadsheetLapsRow[]): ApicalLapByCategory => {
  const categories = new Map<string, Map<string, ApicalSpreadsheetLapsRow[]>>();

  rows.forEach((row) => {
    const categoryName = row.CategoryName?.toString() || 'Uncategorised';
    const entrantKey = getEntrantKey(row);
    const entrants = categories.get(categoryName) || new Map<string, ApicalSpreadsheetLapsRow[]>();
    const entrantRows = entrants.get(entrantKey) || [];
    entrantRows.push(row);
    entrants.set(entrantKey, entrantRows);
    categories.set(categoryName, entrants);
  });

  return Array.from(categories.entries()).map(([CategoryName, entrants]) => ({
    CategoryName,
    ParticipantViewModels: Array.from(entrants.values()).map((entrantRows) => {
      const sortedRows = [...entrantRows].sort((a, b) => Number(a.LapNumber) - Number(b.LapNumber));
      const firstRow = sortedRows[0]!;
      const lastRow = sortedRows[sortedRows.length - 1]!;

      return {
        CategoryName,
        LapByCategoryViewModels: sortedRows.map((row) => ({
          CumulativeLapTimeSpan: row.CumulativeLapTimeSpan,
          FullName: row.FullName,
          Id: Number(`${apicalSafeNumber(row.RaceNumber)}${String(row.LapNumber).padStart(3, '0')}`),
          LapNumber: Number(row.LapNumber),
          LapTimeSpan: row.LapTimeSpan,
          RaceNumber: row.RaceNumber.toString(),
        })),
        NumberOfLaps: sortedRows.length,
        Position: Number(firstRow.Position) || 0,
        RaceNumbers: firstRow.RaceNumber.toString(),
        TeamNameDisplay: firstRow.TeamNameDisplay || firstRow.FullName,
        TotalTimeSpan: lastRow.CumulativeLapTimeSpan || firstRow.TotalTimeSpan || null,
      };
    }),
  }));
};

const readApicalExcelPayload = async (sourceUrl: string, response: Response): Promise<ApicalLapByCategory> => {
  if (!response) {
    throw new ApicalDataException(`No response received when trying to read Apical Excel payload from url ${sourceUrl}`);
  }
  const XLSX = await loadXlsx();
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0) {
    throw new ApicalDataException(`Apical Excel file downloaded from url ${sourceUrl} was empty`);
  }
  const workbook = XLSX.read(buffer, { type: 'array' });
  if (!workbook) {
    throw new ApicalDataException(`Failed to parse Apical Excel workbook from url ${sourceUrl}, no data returned.`);
  }
  if (!workbook.Sheets || Object.keys(workbook.Sheets).length === 0) {
    throw new ApicalDataException(`Apical Excel workbook from url ${sourceUrl} did not contain any sheets`);
  }
  const worksheet = workbook.Sheets.Laps || workbook.Sheets.Sheet1;
  if (!worksheet) {
    const sheetList = Object.keys(workbook.Sheets).join(', ');
    throw new ApicalDataException(`Apical Excel workbook from url ${sourceUrl} did not contain a Laps or Sheet1 worksheet, but contained sheets ${sheetList}`);
  }
  const sheetList = Object.keys(workbook.Sheets).join(', ');
  console.debug(`Apical Excel workbook from url ${sourceUrl} contains sheets: ${sheetList}, using ${worksheet === workbook.Sheets.Laps ? 'Laps' : 'Sheet1'}`);

  const rows = XLSX.utils.sheet_to_json<ApicalSpreadsheetLapsRow>(worksheet);
  if (rows.length === 0) {
    throw new ApicalDataException(`Apical Excel workbook from url ${sourceUrl} did not contain lap rows, but contained sheets ${sheetList}`);
  }

  return convertApicalSpreadsheetRowsToApicalData(rows);
};

const getApicalExcelFileUrl = (baseUrl: string, fileGuid: string, fileName: string): string => `${trimSlash(baseUrl)}/Download/DownloadExcel?fileGuid=${fileGuid}&filename=${encodeURIComponent(fileName)}`;

const fetchApicalDataFilePayload = async (source: DataSourceConfig, apicalEventId: number): Promise<ApicalLapByCategory> => {
  if (!source.apiConfig) {
    throw new Error('Apical API config is missing');
  }

  const exportResponse = await generateApicalExcelExport(source, apicalEventId);
  const headers = new Headers();
  if (exportResponse.Cookie) {
    headers.set('Cookie', exportResponse.Cookie);
  }
  headers.set('Accept', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,*/*');
  headers.set('Referrer', `${trimSlash(source.apiConfig.baseUrl)}/raceresult/event/detail?id=${apicalEventId}`);
  const url = getApicalExcelFileUrl(source.apiConfig.baseUrl, exportResponse.FileGuid, exportResponse.FileName);

  const response = await fetchApicalResponse(
    'Excel download',
    url,
    {
      credentials: 'omit',
      headers,
      method: 'GET',
      mode: 'cors',
    },
    source.apiConfig.httpTimeoutSeconds * 1000
  );

  return readApicalExcelPayload(url, response);
};

export const pullApicalRaceState = async (source: DataSourceConfig, eventId: EventId): Promise<Partial<RaceState>> => {
  if (source.type !== 'api-apical-data-file' || !source.apiConfig) {
    throw new Error(`Unsupported source type for live pull: ${source.type}`);
  }

  const apicalEventId = getConfiguredApicalEventId(source);
  if (!apicalEventId) {
    throw new Error('No Apical event id is configured for this source.');
  }

  const payload = await fetchApicalDataFilePayload(source, apicalEventId);
  const listedEvent = getListedApicalEvent(source, apicalEventId);
  return convertDataToRaceState(eventId, listedEvent?.eventDate ? new Date(listedEvent.eventDate) : new Date(), payload, 200000);
};

export const fetchApicalRaceStateNow = async (source: DataSourceConfig): Promise<PulledApicalRaceState> => {
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
    const payload = await fetchApicalDataFilePayload(source, apicalEventId);
    const retrievedAt = new Date().toISOString();

    return {
      apicalEventId,
      eventDate: listedEvent?.eventDate,
      eventId,
      eventName: listedEvent?.name || `Apical Event ${apicalEventId}`,
      raceState: convertDataToRaceState(eventId, listedEvent?.eventDate ? new Date(listedEvent.eventDate) : new Date(), payload, 200000),
      retrievedAt,
      sessionId: createApicalCatalogSessionId(apicalEventId),
    };
  } catch (error: unknown) {
    throw new Error(`Failed to fetch Apical data from url ${getApicalExcelExportUrl(source.apiConfig.baseUrl, apicalEventId)} for event id ${apicalEventId}: ${getErrorMessage(error)}`, { cause: error });
  }
};
