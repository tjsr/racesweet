import { ApicalDataException } from "../../errors/apicalDataException.js";
import { isGuid, trimSlash } from "../../utils.js";
import { ApicalExportToExcelResponse } from "../../utils/apical/excelGenerate.js";
import { fetchExternalHttp } from "../../utils/externalHttp.js";

// This is for exporting the excel data, not authenticating. 
// const authUrl = `${trimSlash(apiConfig.baseUrl)}/RaceResult/Event/ExportToExcel?eventId=${authEventId}&_=${Date.now()}`;

const getApicalExcelExportUrl = (baseUrl: string, apicalEventId: number, timestamp: number = Date.now()): string => `${trimSlash(baseUrl)}/RaceResult/Event/ExportToExcel?eventId=${apicalEventId}&_=${timestamp}`;

interface GenerateExcelDataOptions {
  baseUrl?: string;
  headers?: HeadersInit;
  timestamp?: number;
}

const readDocumentCookie = (): string | undefined => {
  if (typeof document === 'undefined') {
    throw new Error('Cannot read document cookie: document is undefined');
  }

  const cookie = document.cookie.trim();
  return cookie.length > 0 ? cookie : undefined;
};

const readResponseCookie = (response: Response): string | undefined => {
  return response.headers.get('set-cookie') || response.headers.get('cookie') || readDocumentCookie();
};

const normalizeGenerateExcelDataOptions = (timestampOrOptions: number | GenerateExcelDataOptions): GenerateExcelDataOptions => {
  return typeof timestampOrOptions === 'number'
    ? { timestamp: timestampOrOptions }
    : timestampOrOptions;
};

export const generateExcelData = async (eventId: number, timestampOrOptions: number | GenerateExcelDataOptions = {}): Promise<ApicalExportToExcelResponse> => {
  const options = normalizeGenerateExcelDataOptions(timestampOrOptions);
  const baseUrl = options.baseUrl || 'https://apicalracetiming.com.au';
  const timestamp = options.timestamp ?? Date.now();
  const headers = new Headers(options.headers);
  headers.set('X-Requested-With', 'XMLHttpRequest');
  headers.set('Access-Control-Allow-Credentials', 'true');
  const url = getApicalExcelExportUrl(baseUrl, eventId, timestamp);

  const response = await fetchExternalHttp(url, {
    credentials: 'include',
    headers,
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`Failed to generate Excel data: ${response.statusText}`);
  }

  const jsonData = await response.json() as Partial<ApicalExportToExcelResponse>;
  if (!jsonData.FileGuid || !isGuid(jsonData.FileGuid) || !jsonData.FileName) {
    throw new ApicalDataException([
      'Apical Excel export response payload was invalid',
      `${JSON.stringify(jsonData)}`,
    ].join('\n'));
  }

  const cookieHeader = readResponseCookie(response);

  if (!cookieHeader) {
    const normalizedHeaderKeys = Array.from(response.headers.keys()).map((key) => key.toLowerCase());
    const headerKeys = normalizedHeaderKeys.join(', ');
    const hasConvertedSetCookie = normalizedHeaderKeys.includes('set-cookie');

    throw new ApicalDataException(`Missing set-cookie header in Excel export response from url ${url} (hasConvertedSetCookie=${hasConvertedSetCookie}, headers=${headerKeys})`);
  }

  // const setCookieHeaders = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.();
  // let setCookieHeader = Array.isArray(setCookieHeaders) ? setCookieHeaders.join('; ') : setCookieHeaders;
  
  // console.log(`Cookie: ${response.headers.get('cookie')}.  SetCookie: ${response.headers.get('set-cookie')}.`);
  // if (!setCookieHeader) {
  //   setCookieHeader =  response.headers.get('Set-Cookie') || (response.headers as any).get('cookie');
  // }


  return {
    Cookie: cookieHeader,
    FileGuid: jsonData.FileGuid,
    FileName: jsonData.FileName,
  };
};
