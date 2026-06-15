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
    const response = await fetch(request.url, {
      body: request.bodyBase64 ? Buffer.from(request.bodyBase64, 'base64') : undefined,
      headers: request.headers,
      method: request.method || 'GET',
      signal: abortController.signal,
    });
    const bodyBuffer = Buffer.from(await response.arrayBuffer());

    return {
      bodyBase64: bodyBuffer.toString('base64'),
      headers: toExternalHttpHeaderRecord(response.headers),
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      url: response.url,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
};
