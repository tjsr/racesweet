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

const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;

const createCurlCommand = (url: string, headers: Headers): string => {
  const commandParts = [
    'curl',
    '--include',
    '--location',
    '--request',
    'GET',
  ];
  const curlHeaders = new Headers(headers);
  const documentCookie = typeof document === 'undefined' ? undefined : document.cookie.trim();
  if (!curlHeaders.has('Cookie') && documentCookie) {
    curlHeaders.set('Cookie', documentCookie);
  }

  Array.from(curlHeaders.entries())
    .sort(([leftName], [rightName]) => leftName.localeCompare(rightName))
    .forEach(([name, value]) => {
      commandParts.push('--header', shellQuote(`${name}: ${value}`));
    });

  commandParts.push(shellQuote(url));
  return commandParts.join(' ');
};

const createGenerateExcelError = (message: string, url: string, headers: Headers, cause?: unknown): Error => {
  const causeMessage = cause instanceof Error ? cause.message : cause ? String(cause) : undefined;
  const details = [
    message,
    causeMessage ? `Cause: ${causeMessage}` : undefined,
    `Replicate request with: ${createCurlCommand(url, headers)}`,
  ].filter((line): line is string => Boolean(line));

  return cause instanceof ApicalDataException
    ? new ApicalDataException(details.join('\n'))
    : new Error(details.join('\n'));
};

const readDocumentCookie = (): string | undefined => {
  if (typeof document === 'undefined') {
    return undefined;
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

  try {
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

      console.warn(`Apical Excel export response from url ${url} did not include readable cookie data (hasConvertedSetCookie=${hasConvertedSetCookie}, headers=${headerKeys}). Continuing without an explicit Cookie header; Electron may still send session cookies through credentialed fetch.`);
    }

    // const setCookieHeaders = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.();
    // let setCookieHeader = Array.isArray(setCookieHeaders) ? setCookieHeaders.join('; ') : setCookieHeaders;

    // console.log(`Cookie: ${response.headers.get('cookie')}.  SetCookie: ${response.headers.get('set-cookie')}.`);
    // if (!setCookieHeader) {
    //   setCookieHeader =  response.headers.get('Set-Cookie') || (response.headers as any).get('cookie');
    // }


    return {
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      FileGuid: jsonData.FileGuid,
      FileName: jsonData.FileName,
    };
  } catch (error: unknown) {
    throw createGenerateExcelError('Failed to generate Apical Excel export data.', url, headers, error);
  }
};
