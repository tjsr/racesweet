import { createAuthenticatedHeaders, fetchApicalResponse, getConfiguredApicalEventId } from "../../app/apicalDataSource.ts";
import type { ApicalListedEvent, DataSourceConfig } from "../../app/systemConfig.ts";
import { trimSlash } from "../../utils.ts";

const getExcelExportUrl = (baseUrl: string, eventId: number): string => `${trimSlash(baseUrl)}/RaceResult/Event/ExportToExcel?eventId=${eventId}&_=${Date.now()}`;
const getEventListUrl = (baseUrl: string, companyId: number): string => `${trimSlash(baseUrl)}/raceresult/event/getall?companyId=${companyId}&_=${Date.now()}`;

const hasAuthHeader = (source: DataSourceConfig): boolean => {
  const apiConfig = source.apiConfig;
  return Boolean(apiConfig?.authHeaderName.trim() && apiConfig.authHeaderValue.trim());
};

const readResponseCookie = (response: Response): string | undefined => {
  return response.headers.get('set-cookie') || response.headers.get('cookie') || undefined;
};

const authenticateSession = async (source: DataSourceConfig): Promise<string | undefined> => {
  if (!source.apiConfig || !hasAuthHeader(source)) {
    return undefined;
  }

  const apicalEventId = getConfiguredApicalEventId(source);
  if (!apicalEventId) {
    return undefined;
  }

  const headers = createAuthenticatedHeaders(source);
  headers.set('X-Requested-With', 'XMLHttpRequest');
  const response = await fetchApicalResponse(
    'authentication',
    getExcelExportUrl(source.apiConfig.baseUrl, apicalEventId),
    {
      credentials: 'include',
      headers,
      method: 'GET',
      mode: 'cors',
    },
    source.apiConfig.httpTimeoutSeconds * 1000
  );

  const cookie = readResponseCookie(response);
  if (!cookie) {
    console.warn('Apical authentication response did not include readable cookie data. Continuing with credentialed Electron fetch; the event list may still succeed if the cookie is held in the Electron session.');
  }

  return cookie;
};

export const fetchApicalEvents = async (source: DataSourceConfig): Promise<ApicalListedEvent[]> => {
  if (source.type !== 'api-apical-excel-file' || !source.apiConfig) {
    return [];
  }

  const cookie = await authenticateSession(source);
  const headers = createAuthenticatedHeaders(source, cookie);

  const response = await fetchApicalResponse(
    'event list',
    getEventListUrl(source.apiConfig.baseUrl, source.apiConfig.companyId),
    {
      credentials: 'include',
      headers,
      method: 'GET',
      mode: 'cors',
    },
    source.apiConfig.httpTimeoutSeconds * 1000
  );

  const payload = await response.json() as Array<{ CompanyName?: string; EventDate?: string; Id: number; Name: string; }>;

  return payload.map((eventItem) => ({
    companyName: eventItem.CompanyName,
    eventDate: eventItem.EventDate,
    id: eventItem.Id,
    name: eventItem.Name,
  }));
};
