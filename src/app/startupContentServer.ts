export const DEFAULT_CONTENT_SERVER_ATTEMPT_TIMEOUT_MS = 5_000;
export const DEFAULT_CONTENT_SERVER_READY_TIMEOUT_MS = 30_000;
export const DEFAULT_CONTENT_SERVER_RETRY_DELAY_MS = 250;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type ContentLoadFailureListener = (
  event: unknown,
  errorCode: number,
  errorDescription: string,
  validatedURL: string,
  isMainFrame?: boolean
) => void;
type ContentLoadSuccessListener = () => void;

export interface ContentLoadWebContents {
  readonly once: {
    (eventName: 'did-fail-load', listener: ContentLoadFailureListener): void;
    (eventName: 'did-finish-load', listener: ContentLoadSuccessListener): void;
  };
  readonly removeListener: {
    (eventName: 'did-fail-load', listener: ContentLoadFailureListener): void;
    (eventName: 'did-finish-load', listener: ContentLoadSuccessListener): void;
  };
}

export interface ContentLoadWindow {
  readonly loadURL: (contentUrl: string) => Promise<void>;
  readonly webContents: ContentLoadWebContents;
}

export interface WaitForContentServerOptions {
  readonly attemptTimeoutMs?: number;
  readonly fetchContent?: FetchLike;
  readonly retryDelayMs?: number;
  readonly setTimeoutCallback?: typeof setTimeout;
  readonly timeoutMs?: number;
}

export interface WaitForWindowContentOptions {
  readonly attemptTimeoutMs?: number;
  readonly retryDelayMs?: number;
  readonly setTimeoutCallback?: typeof setTimeout;
  readonly timeoutMs?: number;
}

const sleep = (delayMs: number, setTimeoutCallback: typeof setTimeout): Promise<void> =>
  new Promise((resolve) => {
    setTimeoutCallback(resolve, delayMs);
  });

const isHttpUrl = (rawUrl: string): boolean => {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const createStartupErrorMessage = (
  contentUrl: string,
  timeoutMs: number,
  attempts: number,
  lastError?: unknown
): string => {
  const lastErrorMessage = lastError instanceof Error ? lastError.message : String(lastError ?? 'none');

  return [
    `RaceSweet could not connect to the content server at ${contentUrl}.`,
    `Waited ${timeoutMs}ms and made ${attempts} attempt${attempts === 1 ? '' : 's'}.`,
    'The Electron Forge webpack dev server may not have started, may still be compiling, or may have failed before serving the renderer.',
    `Last startup error: ${lastErrorMessage}`,
  ].join(' ');
};

const createWindowLoadErrorMessage = (
  contentUrl: string,
  timeoutMs: number,
  attempts: number,
  lastError?: unknown
): string => {
  const lastErrorMessage = lastError instanceof Error ? lastError.message : String(lastError ?? 'none');

  return [
    `RaceSweet could not load the app content from ${contentUrl}.`,
    `Waited ${timeoutMs}ms and made ${attempts} load attempt${attempts === 1 ? '' : 's'}.`,
    'The renderer content server did not become available to Electron before startup timed out.',
    `Last navigation error: ${lastErrorMessage}`,
  ].join(' ');
};

const loadWindowContentOnce = (
  window: ContentLoadWindow,
  contentUrl: string,
  attemptTimeoutMs: number,
  setTimeoutCallback: typeof setTimeout
): Promise<void> =>
  new Promise((resolve, reject) => {
    let settled = false;

    const settle = (callback: () => void): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      window.webContents.removeListener('did-fail-load', onFail);
      window.webContents.removeListener('did-finish-load', onFinish);
      callback();
    };
    const onFail: ContentLoadFailureListener = (
      _event,
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame
    ) => {
      if (isMainFrame === false) {
        return;
      }

      settle(() => {
        reject(new Error(`${errorDescription} (${errorCode}) while loading ${validatedURL || contentUrl}`));
      });
    };
    const onFinish = (): void => {
      settle(resolve);
    };
    const timeout = setTimeoutCallback(() => {
      settle(() => {
        reject(new Error(`Timed out waiting for Electron to load ${contentUrl}`));
      });
    }, attemptTimeoutMs);

    window.webContents.once('did-fail-load', onFail);
    window.webContents.once('did-finish-load', onFinish);
    window.loadURL(contentUrl).catch((error: Error) => {
      settle(() => {
        reject(error);
      });
    });
  });

export const waitForContentServer = async (
  contentUrl: string,
  options: WaitForContentServerOptions = {}
): Promise<void> => {
  if (!isHttpUrl(contentUrl)) {
    return;
  }

  const fetchContent = options.fetchContent ?? fetch;
  const attemptTimeoutMs = options.attemptTimeoutMs ?? DEFAULT_CONTENT_SERVER_ATTEMPT_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_CONTENT_SERVER_RETRY_DELAY_MS;
  const setTimeoutCallback = options.setTimeoutCallback ?? setTimeout;
  const timeoutMs = options.timeoutMs ?? DEFAULT_CONTENT_SERVER_READY_TIMEOUT_MS;
  const startedAt = Date.now();
  let attempts = 0;
  let lastError: unknown;

  while (Date.now() - startedAt <= timeoutMs) {
    attempts += 1;
    const controller = new AbortController();
    const timeout = setTimeoutCallback(() => {
      controller.abort();
    }, attemptTimeoutMs);

    try {
      const response = await fetchContent(contentUrl, { cache: 'no-store', signal: controller.signal });
      if (response.ok) {
        return;
      }
      lastError = new Error(`HTTP ${response.status} ${response.statusText}`.trim());
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }

    await sleep(retryDelayMs, setTimeoutCallback);
  }

  throw new Error(createStartupErrorMessage(contentUrl, timeoutMs, attempts, lastError));
};

export const waitForWindowContentLoad = async (
  window: ContentLoadWindow,
  contentUrl: string,
  options: WaitForWindowContentOptions = {}
): Promise<void> => {
  const attemptTimeoutMs = options.attemptTimeoutMs ?? DEFAULT_CONTENT_SERVER_ATTEMPT_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_CONTENT_SERVER_RETRY_DELAY_MS;
  const setTimeoutCallback = options.setTimeoutCallback ?? setTimeout;
  const timeoutMs = options.timeoutMs ?? DEFAULT_CONTENT_SERVER_READY_TIMEOUT_MS;
  const startedAt = Date.now();
  let attempts = 0;
  let lastError: unknown;

  while (Date.now() - startedAt <= timeoutMs) {
    attempts += 1;

    try {
      await loadWindowContentOnce(window, contentUrl, attemptTimeoutMs, setTimeoutCallback);
      return;
    } catch (error) {
      lastError = error;
    }

    await sleep(retryDelayMs, setTimeoutCallback);
  }

  throw new Error(createWindowLoadErrorMessage(contentUrl, timeoutMs, attempts, lastError));
};
