import { session } from 'electron';

export interface ExternalHttpRequestOptions {
  credentials?: RequestCredentials;
  body?: BodyInit | null;
  headers?: HeadersInit;
  method?: string;
  timeoutMs?: number;
}

interface ExternalHttpProxyRequest {
  bodyBase64?: string;
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
  method?: string;
  timeoutMs?: number;
  url: string;
}

interface ExternalHttpProxyResponse {
  bodyBase64: string;
  headers: Record<string, string>;
  ok?: boolean;
  status: number;
  statusText: string;
  url?: string;
}

const toHeaderRecord = (headersInit: HeadersInit | undefined): Record<string, string> | undefined => {
  if (!headersInit) {
    return undefined;
  }

  return Array.from(new Headers(headersInit).entries()).reduce<Record<string, string>>((accumulator, [name, value]) => {
    accumulator[name] = value;
    return accumulator;
  }, {});
};

const toRequestBodyBase64 = (body: BodyInit | null | undefined): string | undefined => {
  if (!body || typeof body === 'string') {
    return body ? Buffer.from(body).toString('base64') : undefined;
  }

  if (body instanceof URLSearchParams) {
    return Buffer.from(body.toString()).toString('base64');
  }

  if (body instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(body)).toString('base64');
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body).toString('base64');
  }

  throw new Error('Unsupported request body type for external HTTP proxy request');
};

const readSetCookieHeaders = (headers: Headers): string[] => {
  const getSetCookie = (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === 'function') {
    return getSetCookie.call(headers).filter((value) => value.trim().length > 0);
  }

  const setCookie = headers.get('set-cookie');
  return setCookie && setCookie.trim().length > 0 ? [setCookie] : [];
};

const toExternalHttpHeaderRecord = (headers: Headers): Record<string, string> => {
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

const fetchWithElectronSession = async (request: ExternalHttpProxyRequest): Promise<ExternalHttpProxyResponse> => {
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
    const bodyBufferPromise: Promise<Buffer> = response.arrayBuffer().then((body: ArrayBuffer): Buffer => Buffer.from(body));
    const headers = toExternalHttpHeaderRecord(response.headers);
    const cookieHeaderPromise: Promise<string | undefined> = !headers['set-cookie'] && !headers.cookie
      ? readElectronCookieHeader(response.url || request.url)
      : Promise.resolve(undefined);
    const [bodyBuffer, cookieHeader] = await Promise.all([bodyBufferPromise, cookieHeaderPromise]);
    if (!headers['set-cookie'] && !headers.cookie) {
      if (cookieHeader) {
        headers.cookie = cookieHeader;
      } else {
        console.warn(`External HTTP response for ${response.url || request.url} did not expose set-cookie and the Electron session cookie store did not contain cookies for that URL.`);
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

const getExternalHttpProxy = (): ((request: ExternalHttpProxyRequest) => Promise<ExternalHttpProxyResponse>) | undefined => {
  if (typeof globalThis.window !== 'undefined') {
    const rendererProxy = globalThis.window.api?.requestExternalHttp;
    if (typeof rendererProxy === 'function') {
      return rendererProxy;
    }
  }

  if (typeof session?.defaultSession?.fetch === 'function') {
    return fetchWithElectronSession;
  }

  return undefined;
};

export const hasExternalHttpProxy = (): boolean => getExternalHttpProxy() !== undefined;

const createProxyRequest = (url: string, options: ExternalHttpRequestOptions): ExternalHttpProxyRequest => ({
  bodyBase64: toRequestBodyBase64(options.body),
  credentials: options.credentials,
  headers: toHeaderRecord(options.headers),
  method: options.method || 'GET',
  timeoutMs: options.timeoutMs,
  url,
});

const fetchWithTimeout = async (url: string, options: ExternalHttpRequestOptions): Promise<Response> => {
  if (!options.timeoutMs || options.timeoutMs <= 0) {
    return fetch(url, options);
  }

  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => abortController.abort(), options.timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: abortController.signal,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
};

export const fetchExternalHttp = async (url: string, options: ExternalHttpRequestOptions = {}): Promise<Response> => {
  const requestExternalHttp = getExternalHttpProxy();
  if (!requestExternalHttp) {
    console.debug('External HTTP proxy is not available, falling back to standard fetch. This may cause CORS issues if the target URL does not allow cross-origin requests.');
    return fetchWithTimeout(url, options);
  } else {
    // await window.api.requestExternalHttp("https://yourserver.com", { credentials: "include" });
// const activeCookies = await window.api.getAppCookies("https://yourserver.com");
// console.log("Verified App Cookies:", activeCookies); 

    console.debug('Using external HTTP proxy for request to', url, options.headers ? `with headers ${JSON.stringify(options.headers)}` : 'without custom headers');
  }

  const proxiedResponse = await requestExternalHttp(createProxyRequest(url, options));
  const body = Buffer.from(proxiedResponse.bodyBase64, 'base64');
  return new Response(body, {
    headers: new Headers(proxiedResponse.headers),
    status: proxiedResponse.status,
    statusText: proxiedResponse.statusText,
  });
};

export const isSensitiveHeader = (name: string): boolean => {
  const normalizedName = name.toLowerCase();
  return normalizedName === 'authorization' ||
    normalizedName === 'cookie' ||
    normalizedName === 'set-cookie' ||
    normalizedName.includes('token') ||
    normalizedName.includes('secret') ||
    normalizedName.includes('key');
};
