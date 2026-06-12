export interface ExternalHttpRequestOptions {
  body?: BodyInit | null;
  headers?: HeadersInit;
  method?: string;
  timeoutMs?: number;
}

interface ExternalHttpProxyRequest {
  bodyBase64?: string;
  headers?: Record<string, string>;
  method?: string;
  timeoutMs?: number;
  url: string;
}

interface ExternalHttpProxyResponse {
  bodyBase64: string;
  headers: Record<string, string>;
  status: number;
  statusText: string;
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

const getExternalHttpProxy = (): ((request: ExternalHttpProxyRequest) => Promise<ExternalHttpProxyResponse>) | undefined => {
  if (typeof globalThis.window === 'undefined') {
    return undefined;
  }

  return globalThis.window.api?.requestExternalHttp;
};

const createProxyRequest = (url: string, options: ExternalHttpRequestOptions): ExternalHttpProxyRequest => ({
  bodyBase64: toRequestBodyBase64(options.body),
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
    return fetchWithTimeout(url, options);
  }

  const proxiedResponse = await requestExternalHttp(createProxyRequest(url, options));
  const body = Buffer.from(proxiedResponse.bodyBase64, 'base64');
  return new Response(body, {
    headers: new Headers(proxiedResponse.headers),
    status: proxiedResponse.status,
    statusText: proxiedResponse.statusText,
  });
};
