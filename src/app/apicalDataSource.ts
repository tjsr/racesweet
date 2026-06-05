import type { ApicalListedEvent, DataSourceConfig } from './systemConfig.js';

import type { ApicalLapByCategory } from '../model/apical.js';
import type { RaceState } from '../model/racestate.js';
import { convertDataToRaceState } from '../parsers/apical.js';

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timeoutHandle = setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeoutHandle);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timeoutHandle);
        reject(error);
      });
  });
};

const getErrorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

const trimSlash = (value: string): string => value.replace(/\/$/, '');

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

const describeRequestFailure = (phase: string, url: string, init: RequestInit, message: string): string => [
  `Apical ${phase} request failed.`,
  `URL: ${url}`,
  formatRequestHeaders(init.headers),
  message,
].join('\n');

const fetchApicalResponse = async (
  phase: string,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> => {
  let response: Response;
  try {
    response = await withTimeout(fetch(url, init), timeoutMs);
  } catch (error: unknown) {
    throw new Error(describeRequestFailure(phase, url, init, getErrorMessage(error)));
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

  const authEventId = apiConfig.apicalEventId || apiConfig.selectedEventIds[0];
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

const fetchApicalDataFilePayload = async (source: DataSourceConfig, apicalEventId: number): Promise<ApicalLapByCategory> => {
  if (!source.apiConfig) {
    throw new Error('Apical API config is missing');
  }

  const cookie = await authenticateSession(source);
  const headers = createAuthenticatedHeaders(source, cookie);
  const url = `${trimSlash(source.apiConfig.baseUrl)}/raceresult/event/datafile?eventId=${apicalEventId}&_=${Date.now()}`;

  const response = await fetchApicalResponse(
    'data file',
    url,
    {
      credentials: 'omit',
      headers,
      method: 'GET',
      mode: 'cors',
    },
    source.apiConfig.httpTimeoutSeconds * 1000
  );

  const payload = await response.json() as ApicalLapByCategory;
  if (!Array.isArray(payload)) {
    throw new Error('Apical data file payload format was invalid');
  }

  return payload;
};

export const pullApicalRaceState = async (source: DataSourceConfig, eventId: string): Promise<Partial<RaceState>> => {
  if (source.type !== 'api-apical-data-file' || !source.apiConfig) {
    throw new Error(`Unsupported source type for live pull: ${source.type}`);
  }

  const apicalEventId = source.apiConfig.apicalEventId || source.apiConfig.selectedEventIds[0];
  if (!apicalEventId) {
    throw new Error('No Apical event id is configured for this source.');
  }

  const payload = await fetchApicalDataFilePayload(source, apicalEventId);
  return convertDataToRaceState(eventId, new Date(), payload, 200000);
};
