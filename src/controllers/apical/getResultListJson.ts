import { trimSlash } from "../../utils.ts";
import { createAuthenticatedHeaders, fetchApicalResponse, getConfiguredApicalEventId } from "../../app/apicalDataSource.ts";
import type { DataSourceConfig, ApicalListedEvent } from "../../app/systemConfig.ts";

const getExcelExportUrl = (baseUrl: string, eventId: number): string => `${trimSlash(baseUrl)}/RaceResult/Event/ExportToExcel?eventId=${eventId}&_=${Date.now()}`;
const getEventListUrl = (baseUrl: string, companyId: number): string => `${trimSlash(baseUrl)}/raceresult/event/getall?companyId=${companyId}&_=${Date.now()}`;

const hasAuthHeader = (source: DataSourceConfig): boolean => {
  const apiConfig = source.apiConfig;
  return Boolean(apiConfig?.authHeaderName.trim() && apiConfig.authHeaderValue.trim());
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

  return response.headers.get('set-cookie') || undefined;
};

export const fetchApicalEvents = async (source: DataSourceConfig): Promise<ApicalListedEvent[]> => {
  if (source.type !== 'api-apical-data-file' || !source.apiConfig) {
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
