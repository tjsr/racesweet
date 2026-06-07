import { EventEmitter } from 'node:events';

import {
  waitForContentServer,
  waitForWindowContentLoad,
  type ContentLoadWindow
} from './startupContentServer.js';

const immediateTimeout = ((callback: () => void): ReturnType<typeof setTimeout> => {
  callback();
  return undefined as unknown as ReturnType<typeof setTimeout>;
}) as typeof setTimeout;

const createFakeContentWindow = (
  loadURL: (contentUrl: string, emitter: EventEmitter) => Promise<void>
): ContentLoadWindow & { readonly loadAttempts: () => number } => {
  const emitter = new EventEmitter();
  let attempts = 0;

  return {
    loadAttempts: () => attempts,
    loadURL: async (contentUrl: string): Promise<void> => {
      attempts += 1;
      await loadURL(contentUrl, emitter);
    },
    webContents: {
      once: (eventName, listener): void => {
        emitter.once(eventName, listener);
      },
      removeListener: (eventName, listener): void => {
        emitter.removeListener(eventName, listener);
      },
    },
  };
};

describe('waitForContentServer', () => {
  it('returns immediately for packaged file urls', async () => {
    const fetchContent = vi.fn();

    await waitForContentServer('file:///app/index.html', { fetchContent });

    expect(fetchContent).not.toHaveBeenCalled();
  });

  it('waits until the content server returns a successful response', async () => {
    const fetchContent = vi.fn()
      .mockResolvedValueOnce(new Response('not ready', { status: 503, statusText: 'Service Unavailable' }))
      .mockResolvedValueOnce(new Response('<html></html>', { status: 200 }));

    await waitForContentServer('http://localhost:3488/main_window', {
      fetchContent,
      retryDelayMs: 1,
      setTimeoutCallback: immediateTimeout,
      timeoutMs: 1_000,
    });

    expect(fetchContent).toHaveBeenCalledTimes(2);
  });

  it('adds an abort signal to each content request', async () => {
    const fetchContent = vi.fn().mockResolvedValue(new Response('<html></html>', { status: 200 }));

    await waitForContentServer('http://localhost:3488/main_window', {
      fetchContent,
      setTimeoutCallback: immediateTimeout,
      timeoutMs: 1_000,
    });

    expect(fetchContent).toHaveBeenCalledWith(
      'http://localhost:3488/main_window',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('reports a clear startup error when the server never serves content', async () => {
    const fetchContent = vi.fn().mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:3488'));

    const wait = waitForContentServer('http://localhost:3488/main_window', {
      fetchContent,
      retryDelayMs: 1,
      setTimeoutCallback: immediateTimeout,
      timeoutMs: 1,
    });

    await expect(wait).rejects.toThrow(
      'RaceSweet could not connect to the content server at http://localhost:3488/main_window.'
    );
  });
});

describe('waitForWindowContentLoad', () => {
  it('resolves when Electron finishes loading the app content', async () => {
    const window = createFakeContentWindow(async (_contentUrl, emitter) => {
      setTimeout(() => {
        emitter.emit('did-finish-load');
      }, 0);
    });

    await waitForWindowContentLoad(window, 'http://localhost:3488', {
      attemptTimeoutMs: 1_000,
      timeoutMs: 1_000,
    });

    expect(window.loadAttempts()).toBe(1);
  });

  it('retries when Electron navigation gets ERR_CONNECTION_REFUSED', async () => {
    const window = createFakeContentWindow(async (contentUrl, emitter) => {
      setTimeout(() => {
        if (window.loadAttempts() === 1) {
          emitter.emit('did-fail-load', {}, -102, 'ERR_CONNECTION_REFUSED', contentUrl, true);
          return;
        }

        emitter.emit('did-finish-load');
      }, 0);
    });

    await waitForWindowContentLoad(window, 'http://localhost:3488', {
      attemptTimeoutMs: 1_000,
      retryDelayMs: 1,
      timeoutMs: 1_000,
    });

    expect(window.loadAttempts()).toBe(2);
  });

  it('reports Electron navigation errors clearly when content never loads', async () => {
    const window = createFakeContentWindow(async (contentUrl, emitter) => {
      setTimeout(() => {
        emitter.emit('did-fail-load', {}, -102, 'ERR_CONNECTION_REFUSED', contentUrl, true);
      }, 0);
    });

    await expect(waitForWindowContentLoad(window, 'http://localhost:3488', {
      attemptTimeoutMs: 1_000,
      retryDelayMs: 1,
      timeoutMs: 1,
    })).rejects.toThrow(
      'RaceSweet could not load the app content from http://localhost:3488.'
    );
  });
});
