import { session } from 'electron';

import type { ExternalHttpProxyRequest, ExternalHttpProxyResponse } from './window.js';

const readSetCookieHeaders = (headers: Headers): string[] => {
  const getSetCookie = (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === 'function') {
    return getSetCookie.call(headers).filter((value) => value.trim().length > 0);
  }

  const raw = (headers as unknown as { raw?: () => Record<string, string[]> }).raw;
  const rawSetCookie = typeof raw === 'function' ? raw.call(headers)['set-cookie'] : undefined;
  if (rawSetCookie) {
    return rawSetCookie.filter((value) => value.trim().length > 0);
  }

  const setCookie = headers.get('set-cookie');
  return setCookie && setCookie.trim().length > 0 ? [setCookie] : [];
};

export const toExternalHttpHeaderRecord = (headers: Headers): Record<string, string> => {
  const headerRecord = Array.from(headers.entries()).reduce<Record<string, string>>((accumulator, [name, value]) => {
    accumulator[name] = value;
    return accumulator;
  }, {});

  const setCookieHeaders = readSetCookieHeaders(headers);
  if (setCookieHeaders.length > 0) {
    headerRecord['set-cookie'] = setCookieHeaders.join('; ');
  }

  return headerRecord;
};

const readElectronCookieHeader = async (url: string): Promise<string | undefined> => {
  const getCookies = session.defaultSession.cookies?.get;
  if (typeof getCookies !== 'function') {
    throw new Error('Electron session cookie store is unavailable while trying to read cookies for external HTTP response');
  }

  let cookies: Electron.Cookie[];
  try {
    cookies = await getCookies.call(session.defaultSession.cookies, { url });
  } catch (error: unknown) {
    throw new Error(`Failed to read Electron session cookies for external HTTP response: ${error instanceof Error ? error.message : String(error)}`);
  }

  const cookieHeader = cookies
    .filter((cookie) => cookie.name.trim().length > 0)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');

  return cookieHeader.length > 0 ? cookieHeader : undefined;
};

export const fetchExternalHttpProxy = async (request: ExternalHttpProxyRequest): Promise<ExternalHttpProxyResponse> => {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(request.url);
  } catch {
    throw new Error(`Invalid external request URL: ${request.url}`);
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(`Unsupported external request protocol: ${parsedUrl.protocol}`);
  }

  const timeoutMs = request.timeoutMs && request.timeoutMs > 0 ? request.timeoutMs : 30000;
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const response = await session.defaultSession.fetch(request.url, {
      body: request.bodyBase64 ? Buffer.from(request.bodyBase64, 'base64') : undefined,
      credentials: request.credentials,
      headers: request.headers,
      method: request.method || 'GET',
      signal: abortController.signal,
    });
    const bodyBuffer = Buffer.from(await response.arrayBuffer());
    const headers = toExternalHttpHeaderRecord(response.headers);
    if (!headers['set-cookie'] && !headers.cookie) {
      const cookieHeader = await readElectronCookieHeader(response.url || request.url);
      if (cookieHeader) {
        headers.cookie = cookieHeader;
      }
    }

    return {
      bodyBase64: bodyBuffer.toString('base64'),
      headers,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      url: response.url,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
};
