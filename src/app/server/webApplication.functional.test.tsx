// @vitest-environment jsdom

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { act } from 'react';
import { installServerConnectedRendererApi } from '../serverConnection.js';
import { startApp } from '../mount.js';
import { RaceSweetApplicationServer } from './raceSweetApplicationServer.js';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const getAvailablePort = async (): Promise<number> => {
  const reservation = createNetServer();
  await new Promise<void>((resolve): void => {
    reservation.listen(0, '127.0.0.1', resolve);
  });
  const port: number = (reservation.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject): void => {
    reservation.close((error?: Error): void => error ? reject(error) : resolve());
  });
  return port;
};

const waitForText = async (
  expectedText: string,
  timeoutMilliseconds: number = 2_000,
): Promise<void> => {
  const deadline: number = Date.now() + timeoutMilliseconds;
  while (!document.body.textContent?.includes(expectedText)) {
    if (Date.now() >= deadline) {
      throw new Error(
        `The rendered page did not contain "${expectedText}". ` +
        `Rendered text: ${document.body.textContent || '(blank)'}`,
      );
    }
    await act(async (): Promise<void> => {
      await new Promise<void>((resolve): void => {
        setTimeout(resolve, 10);
      });
    });
  }
};

describe('RaceSweet web application functional startup', () => {
  it('serves the browser entrypoint and renders the login screen', async () => {
    const dataDirectory: string = await mkdtemp(
      path.join(os.tmpdir(), 'racesweet-web-functional-test-'),
    );
    const electronAssetDirectory: string = path.join(dataDirectory, 'main_window');
    const assetDirectory: string = path.join(dataDirectory, 'web');
    await Promise.all([
      mkdir(assetDirectory, { recursive: true }),
      mkdir(electronAssetDirectory, { recursive: true }),
    ]);
    const applicationHtml: string = await readFile(
      path.resolve('src', 'app', 'web', 'index.html'),
      'utf8',
    );
    await Promise.all([
      writeFile(path.join(assetDirectory, 'index.html'), applicationHtml, 'utf8'),
      writeFile(
        path.join(assetDirectory, 'app.js'),
        'globalThis.raceSweetBrowserBundleLoaded = true;',
        'utf8',
      ),
      writeFile(
        path.join(electronAssetDirectory, 'index.html'),
        '<!doctype html><div id="app"></div><script defer src="/main_window/index.js"></script>',
        'utf8',
      ),
      writeFile(
        path.join(electronAssetDirectory, 'index.js'),
        'require("events");',
        'utf8',
      ),
    ]);
    const server: RaceSweetApplicationServer = new RaceSweetApplicationServer({
      assetSource: electronAssetDirectory,
      dataDirectory,
      externalAssetSource: assetDirectory,
    });
    const originalFetch: typeof fetch = globalThis.fetch;
    const originalEventSource: typeof EventSource | undefined = globalThis.EventSource;

    try {
      await server.initialize();
      const internal = await server.startInternal();
      const externalPort: number = await getAvailablePort();
      await server.reloadExternal({ enabled: true, httpPort: externalPort });
      const externalOrigin: string = `http://127.0.0.1:${externalPort}`;
      const internalRoot: Response = await originalFetch(`${internal.origin}/`);
      expect(await internalRoot.text()).toContain('/main_window/index.js');
      const setupResponse: Response = await originalFetch(
        `${externalOrigin}/api/v1/auth/setup`,
        {
          body: JSON.stringify({
            password: 'correct horse battery staple',
            username: 'admin',
          }),
          headers: {
            'content-type': 'application/json',
            origin: externalOrigin,
          },
          method: 'POST',
        },
      );
      expect(setupResponse.status).toBe(200);

      const rootResponse: Response = await originalFetch(`${externalOrigin}/`);
      expect(rootResponse.status).toBe(200);
      expect(rootResponse.headers.get('content-type')).toContain('text/html');
      document.documentElement.innerHTML = await rootResponse.text();
      expect(document.querySelector('#app')).not.toBeNull();
      const scriptSource: string | null = document.querySelector('script')?.getAttribute('src') ||
        null;
      expect(scriptSource).toBe('/app.js');

      const scriptResponse: Response = await originalFetch(`${externalOrigin}${scriptSource}`);
      expect(scriptResponse.status).toBe(200);
      expect(scriptResponse.headers.get('content-type')).toContain('application/javascript');
      expect((await scriptResponse.text()).trim().length).toBeGreaterThan(0);

      globalThis.EventSource = vi.fn() as never;
      globalThis.fetch = ((
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> => {
        const inputUrl: URL = new URL(
          typeof input === 'string' ? input : input.toString(),
          externalOrigin,
        );
        const requestUrl: string =
          `${externalOrigin}${inputUrl.pathname}${inputUrl.search}${inputUrl.hash}`;
        return originalFetch(requestUrl, init);
      }) as typeof fetch;
      installServerConnectedRendererApi();

      await act(async (): Promise<void> => {
        startApp();
      });
      await waitForText('Sign in to access this RaceSweet server.');

      expect(document.body.textContent).toContain('RaceSweet');
      expect(document.body.textContent).toContain('Sign in to access this RaceSweet server.');
      expect(document.querySelector('input[autocomplete="username"]')).not.toBeNull();
      expect(document.querySelector('input[type="password"]')).not.toBeNull();
      expect(document.querySelector('button[type="submit"]')?.textContent).toBe('Sign in');
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.EventSource = originalEventSource as never;
      window.api = undefined as never;
      await server.close();
      await rm(dataDirectory, { force: true, recursive: true });
    }
  }, 15_000);
});
