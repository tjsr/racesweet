import type { RaceState } from '../model/racestate.js';
import { convertDataToRaceState } from '../parsers/apical.js';
import type { ApicalLapByCategory } from '../model/apical.js';

import type { ApicalListedEvent, DataSourceConfig } from './systemConfig.js';

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

const trimSlash = (value: string): string => value.replace(/\/$/, '');

const readSetCookie = (response: Response): string | undefined => {
  try {
    return response.headers.get('set-cookie') || undefined;
  } catch (_error: unknown) {
    return undefined;
  }
};

const createAuthenticatedHeaders = (source: DataSourceConfig, cookie?: string): Headers => {
  const headers = new Headers();
  const apiConfig = source.apiConfig;
  if (!apiConfig) {
    return headers;
  }

  if (apiConfig.authHeaderName.trim().length > 0 && apiConfig.authHeaderValue.trim().length > 0) {
    headers.set(apiConfig.authHeaderName.trim(), apiConfig.authHeaderValue.trim());
  }
  if (cookie) {
    headers.set('Cookie', cookie);
  }
  headers.set('Accept', 'application/json');

  return headers;
};

const authenticateSession = async (source: DataSourceConfig): Promise<string | undefined> => {
  const apiConfig = source.apiConfig;
  if (!apiConfig) {
    return undefined;
  }

  const authUrl = `${trimSlash(apiConfig.baseUrl)}/`;
  const headers = createAuthenticatedHeaders(source);

  const response = await withTimeout(
    fetch(authUrl, {
      headers,
      method: 'GET',
    }),
    apiConfig.httpTimeoutSeconds * 1000,
  );

  if (!response.ok) {
    throw new Error(`Apical authentication failed: ${response.status} ${response.statusText}`);
  }

  return readSetCookie(response);
};

export const fetchApicalEvents = async (source: DataSourceConfig): Promise<ApicalListedEvent[]> => {
  if (source.type !== 'api-apical-data-file' || !source.apiConfig) {
    return [];
  }

  const cookie = await authenticateSession(source);
  const headers = createAuthenticatedHeaders(source, cookie);
  const url = `${trimSlash(source.apiConfig.baseUrl)}/raceresult/event/getall?companyId=${source.apiConfig.companyId}&_=${Date.now()}`;

  const response = await withTimeout(
    fetch(url, {
      headers,
      method: 'GET',
    }),
    source.apiConfig.httpTimeoutSeconds * 1000,
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch Apical events: ${response.status} ${response.statusText}`);
  }

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

  const response = await withTimeout(
    fetch(url, {
      headers,
      method: 'GET',
    }),
    source.apiConfig.httpTimeoutSeconds * 1000,
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch Apical data file: ${response.status} ${response.statusText}`);
  }

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
