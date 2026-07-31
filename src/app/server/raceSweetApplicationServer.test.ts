import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { EventCatalogMutation } from '../../ledger/eventCatalogLedger.js';
import { createEventId, createId } from '../../model/ids.js';
import {
  type AdministrativeChanges,
  createDefaultAdministrativeChanges,
} from '../../persistence/raceAdminPersistence.js';
import { createServerConnectedRendererApi } from '../serverConnection.js';
import { RESTART_REQUIRED_AFTER } from '../restartVersion.js';
import {
  RaceSweetApplicationServer,
  resolveDevelopmentAssetUrl,
} from './raceSweetApplicationServer.js';

interface StartedTestServer {
  adminCookie: string;
  dataDirectory: string;
  origin: string;
  server: RaceSweetApplicationServer;
}

const jsonRequest = (
  origin: string,
  requestPath: string,
  body: object,
  cookie?: string,
): Promise<Response> => fetch(`${origin}${requestPath}`, {
  body: JSON.stringify(body),
  headers: {
    ...(cookie ? { cookie } : {}),
    'content-type': 'application/json',
    origin,
  },
  method: 'POST',
});

const readSseEvent = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  eventType: string,
): Promise<string> => {
  const decoder: TextDecoder = new TextDecoder();
  let eventText: string = '';
  for (let index: number = 0; index < 8 && !eventText.includes(`event: ${eventType}`); index += 1) {
    const chunk: ReadableStreamReadResult<Uint8Array> = await reader.read();
    eventText += decoder.decode(chunk.value, { stream: true });
  }
  return eventText;
};

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

const startTestServer = async (): Promise<StartedTestServer> => {
  const dataDirectory: string = await mkdtemp(path.join(os.tmpdir(), 'racesweet-server-test-'));
  const assetDirectory: string = path.join(dataDirectory, 'web');
  await mkdir(assetDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(assetDirectory, 'index.html'),
      '<!doctype html><div id="app">RaceSweet application</div><script defer src="/app.js"></script>',
      'utf8',
    ),
    writeFile(path.join(assetDirectory, 'app.js'), 'globalThis.raceSweetLoaded = true;', 'utf8'),
    writeFile(
      path.join(assetDirectory, 'app.abcdef1234567890.js'),
      'globalThis.hashedRaceSweetLoaded = true;',
      'utf8',
    ),
  ]);
  const server: RaceSweetApplicationServer = new RaceSweetApplicationServer({
    assetSource: assetDirectory,
    dataDirectory,
    eventRetention: 2,
  });
  await server.initialize();
  const started = await server.startInternal();
  const setupResponse: Response = await jsonRequest(started.origin, '/api/v1/auth/setup', {
    password: 'correct horse battery staple',
    username: 'admin',
  });
  const cookie: string = (setupResponse.headers.get('set-cookie') || '').split(';')[0] || '';
  expect(setupResponse.status).toBe(200);
  expect(cookie).toContain('racesweet_session=');
  return {
    adminCookie: cookie,
    dataDirectory,
    origin: started.origin,
    server,
  };
};

describe('RaceSweetApplicationServer', () => {
  let testServer: StartedTestServer;

  beforeEach(async () => {
    testServer = await startTestServer();
  });

  it('resolves Forge renderer assets from the development server origin', () => {
    expect(resolveDevelopmentAssetUrl(
      'http://localhost:3488/main_window/index.html',
      '/',
    ).toString()).toBe('http://localhost:3488/main_window/index.html');
    expect(resolveDevelopmentAssetUrl(
      'http://localhost:3488/main_window/index.html',
      '/main_window/index.js',
    ).toString()).toBe('http://localhost:3488/main_window/index.js');
  });

  it('returns the version captured when the application server was launched without authentication', async () => {
    const response: Response = await fetch(`${testServer.origin}/api/v1/runtime-version`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ launchedVersion: RESTART_REQUIRED_AFTER });
  });

  it('serves the packaged renderer from a Windows file URL', async () => {
    const dataDirectory: string = await mkdtemp(
      path.join(os.tmpdir(), 'racesweet-packaged-server-test-'),
    );
    const assetDirectory: string = path.join(dataDirectory, 'renderer', 'main_window');
    const indexPath: string = path.join(assetDirectory, 'index.html');
    await mkdir(assetDirectory, { recursive: true });
    await writeFile(
      indexPath,
      '<!doctype html><div id="app">Packaged RaceSweet application</div><script src="../main_window/index.js"></script>',
      'utf8',
    );
    await writeFile(
      path.join(assetDirectory, 'index.js'),
      'globalThis.packagedRaceSweetLoaded = true;',
      'utf8',
    );
    const server: RaceSweetApplicationServer = new RaceSweetApplicationServer({
      assetSource: pathToFileURL(indexPath).toString(),
      dataDirectory,
    });

    try {
      await server.initialize();
      const started = await server.startInternal();
      const [response, rendererScript]: Response[] = await Promise.all([
        fetch(`${started.origin}/`),
        fetch(`${started.origin}/main_window/index.js`),
      ]);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('Packaged RaceSweet application');
      expect(rendererScript.status).toBe(200);
      expect(rendererScript.headers.get('content-type')).toContain('application/javascript');
      expect(await rendererScript.text()).toContain('packagedRaceSweetLoaded');
    } finally {
      await server.close();
      await rm(dataDirectory, { force: true, recursive: true });
    }
  });

  afterEach(async () => {
    await testServer.server.close();
    await rm(testServer.dataDirectory, { force: true, recursive: true });
  });

  it('serves a complete browser application and Swagger UI asset chain', async () => {
    const [
      root,
      nestedRoute,
      applicationScript,
      hashedApplicationScript,
      documentation,
      specification,
      swaggerStyles,
      swaggerBundle,
      swaggerPreset,
      swaggerInitialization,
      missingAsset,
      missingApi,
    ] = await Promise.all([
      fetch(`${testServer.origin}/`),
      fetch(`${testServer.origin}/events/current`),
      fetch(`${testServer.origin}/app.js`),
      fetch(`${testServer.origin}/app.abcdef1234567890.js`),
      fetch(`${testServer.origin}/api`),
      fetch(`${testServer.origin}/api/openapi.json`),
      fetch(`${testServer.origin}/api/swagger-ui/swagger-ui.css`),
      fetch(`${testServer.origin}/api/swagger-ui/swagger-ui-bundle.js`),
      fetch(`${testServer.origin}/api/swagger-ui/swagger-ui-standalone-preset.js`),
      fetch(`${testServer.origin}/api/swagger-ui/swagger-ui-init.js`),
      fetch(`${testServer.origin}/missing.js`),
      fetch(`${testServer.origin}/api/v1/not-a-resource`),
    ]);

    expect(root.status).toBe(200);
    const rootHtml: string = await root.text();
    expect(rootHtml).toContain('RaceSweet application');
    expect(rootHtml).toContain('src="/app.js"');
    expect(nestedRoute.status).toBe(200);
    expect(await nestedRoute.text()).toContain('RaceSweet application');
    expect(applicationScript.status).toBe(200);
    expect(applicationScript.headers.get('cache-control')).toBe('no-cache');
    expect(applicationScript.headers.get('content-type')).toContain('application/javascript');
    expect(await applicationScript.text()).toContain('raceSweetLoaded');
    expect(hashedApplicationScript.status).toBe(200);
    expect(hashedApplicationScript.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable',
    );
    expect(documentation.status).toBe(200);
    const documentationHtml: string = await documentation.text();
    expect(documentationHtml).toContain('RaceSweet API documentation');
    expect(documentationHtml).toContain('/api/swagger-ui/swagger-ui.css');
    expect(documentationHtml).toContain('/api/swagger-ui/swagger-ui-bundle.js');
    expect(specification.headers.get('content-type')).toContain('application/json');
    expect((await specification.json() as { paths: Record<string, object> }).paths['/api/v1/events']).toBeDefined();
    expect(swaggerStyles.status).toBe(200);
    expect(swaggerStyles.headers.get('content-type')).toContain('text/css');
    expect(await swaggerStyles.text()).toContain('.swagger-ui');
    expect(swaggerBundle.status).toBe(200);
    expect(swaggerBundle.headers.get('content-type')).toContain('application/javascript');
    expect(await swaggerBundle.text()).toContain('SwaggerUIBundle');
    expect(swaggerPreset.status).toBe(200);
    expect(await swaggerPreset.text()).toContain('SwaggerUIStandalonePreset');
    expect(swaggerInitialization.status).toBe(200);
    expect(await swaggerInitialization.text()).toContain("url: '/api/openapi.json'");
    expect(missingAsset.status).toBe(404);
    expect(missingAsset.headers.get('content-type')).toContain('application/json');
    expect(await missingAsset.text()).not.toContain('RaceSweet application');
    expect(missingApi.status).toBe(404);
    expect(await missingApi.text()).not.toContain('RaceSweet application');
  });

  it('shows actionable placeholders when browser or Swagger UI files are missing', async () => {
    const dataDirectory: string = await mkdtemp(
      path.join(os.tmpdir(), 'racesweet-missing-assets-test-'),
    );
    const missingAssetDirectory: string = path.join(dataDirectory, 'missing-web-build');
    const server: RaceSweetApplicationServer = new RaceSweetApplicationServer({
      assetSource: missingAssetDirectory,
      dataDirectory,
      swaggerAssetDirectory: path.join(dataDirectory, 'missing-swagger-ui'),
    });

    try {
      await server.initialize();
      const started = await server.startInternal();
      const [application, documentation, specification]: Response[] = await Promise.all([
        fetch(`${started.origin}/`),
        fetch(`${started.origin}/api`),
        fetch(`${started.origin}/api/openapi.json`),
      ]);

      expect(application.status).toBe(503);
      expect(application.headers.get('content-type')).toContain('text/html');
      const applicationHtml: string = await application.text();
      expect(applicationHtml).toContain('RaceSweet web application is not built');
      expect(applicationHtml).toContain('npm run build:web');
      expect(documentation.status).toBe(503);
      expect(documentation.headers.get('content-type')).toContain('text/html');
      expect(await documentation.text()).toContain(
        'RaceSweet API documentation is unavailable',
      );
      expect(specification.status).toBe(200);
      expect(specification.headers.get('content-type')).toContain('application/json');
    } finally {
      await server.close();
      await rm(dataDirectory, { force: true, recursive: true });
    }
  });

  it('shows the build placeholder when index HTML references a missing compiled script', async () => {
    const dataDirectory: string = await mkdtemp(
      path.join(os.tmpdir(), 'racesweet-incomplete-web-build-test-'),
    );
    const assetDirectory: string = path.join(dataDirectory, 'web');
    await mkdir(assetDirectory, { recursive: true });
    await writeFile(
      path.join(assetDirectory, 'index.html'),
      '<!doctype html><div id="app"></div><script defer src="/app.js"></script>',
      'utf8',
    );
    const server: RaceSweetApplicationServer = new RaceSweetApplicationServer({
      assetSource: assetDirectory,
      dataDirectory,
    });

    try {
      await server.initialize();
      const started = await server.startInternal();
      const response: Response = await fetch(`${started.origin}/`);

      expect(response.status).toBe(503);
      expect(await response.text()).toContain('compiled HTML or JavaScript');
    } finally {
      await server.close();
      await rm(dataDirectory, { force: true, recursive: true });
    }
  });

  it('does not expose the Electron renderer when the external web build is missing', async () => {
    const dataDirectory: string = await mkdtemp(
      path.join(os.tmpdir(), 'racesweet-missing-external-web-build-test-'),
    );
    const electronAssetDirectory: string = path.join(dataDirectory, 'main_window');
    await mkdir(electronAssetDirectory, { recursive: true });
    await Promise.all([
      writeFile(
        path.join(electronAssetDirectory, 'index.html'),
        '<!doctype html><div id="app"></div><script src="/main_window/index.js"></script>',
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
      externalAssetSource: null,
    });

    try {
      await server.initialize();
      const internal = await server.startInternal();
      const externalPort: number = await getAvailablePort();
      await server.reloadExternal({ enabled: true, httpPort: externalPort });
      const [internalResponse, externalResponse]: Response[] = await Promise.all([
        fetch(`${internal.origin}/`),
        fetch(`http://127.0.0.1:${externalPort}/`),
      ]);

      expect(internalResponse.status).toBe(200);
      expect(await internalResponse.text()).toContain('/main_window/index.js');
      expect(externalResponse.status).toBe(503);
      expect(externalResponse.headers.get('content-type')).toContain('text/html');
      const errorPage: string = await externalResponse.text();
      expect(errorPage).toContain('RaceSweet web application is not built');
      expect(errorPage).toContain('npm run build:web');
      expect(errorPage).not.toContain('/main_window/index.js');
    } finally {
      await server.close();
      await rm(dataDirectory, { force: true, recursive: true });
    }
  });

  it('closes setup after the first loopback administrator and enforces authentication', async () => {
    const secondSetup: Response = await jsonRequest(testServer.origin, '/api/v1/auth/setup', {
      password: 'another long secure password',
      username: 'second-admin',
    });
    const unauthenticatedBootstrap: Response = await fetch(`${testServer.origin}/api/v1/bootstrap`);
    const authenticatedBootstrap: Response = await fetch(
      `${testServer.origin}/api/v1/bootstrap?runtime=web`,
      { headers: { cookie: testServer.adminCookie } },
    );

    expect(secondSetup.status).toBe(400);
    expect(unauthenticatedBootstrap.status).toBe(401);
    expect(authenticatedBootstrap.status).toBe(200);
    const bootstrap = await authenticatedBootstrap.json() as {
      permissions: string[];
      runtimeCapabilities: { runtime: string };
      systemConfiguration: { listenerServer?: object };
    };
    expect(bootstrap.permissions).toContain('server:admin');
    expect(bootstrap.runtimeCapabilities.runtime).toBe('web');
    expect(bootstrap.systemConfiguration.listenerServer).toBeUndefined();
  });

  it('validates mutation origins and rate-limits repeated login failures', async () => {
    const invalidOrigin: Response = await fetch(`${testServer.origin}/api/v1/auth/logout`, {
      headers: {
        cookie: testServer.adminCookie,
        origin: 'http://untrusted.example',
      },
      method: 'POST',
    });
    expect(invalidOrigin.status).toBe(403);

    const loginResponses: Response[] = [];
    for (let attempt: number = 0; attempt < 5; attempt += 1) {
      loginResponses.push(await jsonRequest(testServer.origin, '/api/v1/auth/login', {
        password: 'incorrect password value',
        username: 'admin',
      }));
    }
    expect(loginResponses.slice(0, 4).every(
      (response: Response): boolean => response.status === 401,
    )).toBe(true);
    expect(loginResponses[4]?.status).toBe(429);
    expect(loginResponses[4]?.headers.get('retry-after')).toBe('300');

    const blockedCorrectLogin: Response = await jsonRequest(
      testServer.origin,
      '/api/v1/auth/login',
      {
        password: 'correct horse battery staple',
        username: 'admin',
      },
    );
    expect(blockedCorrectLogin.status).toBe(429);
  });

  it('reports and reuses the active saved listener without rebinding its port', async () => {
    const httpPort: number = await getAvailablePort();
    const updateListener = (): Promise<Response> =>
      fetch(`${testServer.origin}/api/v1/system/listener`, {
        body: JSON.stringify({
          changes: {
            enabled: true,
            httpPort,
          },
        }),
        headers: {
          cookie: testServer.adminCookie,
          'content-type': 'application/json',
          origin: testServer.origin,
        },
        method: 'PUT',
      });

    const firstUpdate: Response = await updateListener();
    const secondUpdate: Response = await updateListener();
    const [listenerResponse, configurationResponse, externalResponse]: Response[] =
      await Promise.all([
        fetch(`${testServer.origin}/api/v1/system/listener`, {
          headers: { cookie: testServer.adminCookie },
        }),
        fetch(`${testServer.origin}/api/v1/system/configuration`, {
          headers: { cookie: testServer.adminCookie },
        }),
        fetch(`http://127.0.0.1:${httpPort}/api/openapi.json`),
      ]);

    expect(firstUpdate.status).toBe(200);
    expect(secondUpdate.status).toBe(200);
    expect(await secondUpdate.json()).toEqual(expect.objectContaining({
      listenerServer: {
        enabled: true,
        httpPort,
      },
    }));
    expect(await listenerResponse.json()).toEqual({
      listenerServer: {
        enabled: true,
        httpPort,
      },
    });
    expect(await configurationResponse.json()).toEqual(expect.objectContaining({
      listenerServer: {
        enabled: true,
        httpPort,
      },
    }));
    expect(externalResponse.status).toBe(200);
    const persistedConfig = JSON.parse(
      await readFile(path.join(testServer.dataDirectory, 'system-config.json'), 'utf8'),
    ) as { listenerServer?: { enabled?: boolean; httpPort?: number } };
    expect(persistedConfig.listenerServer).toEqual(expect.objectContaining({
      enabled: true,
      httpPort,
    }));
  });

  it('persists catalog commands and broadcasts the accepted mutations over SSE', async () => {
    const abortController: AbortController = new AbortController();
    const streamResponse: Response = await fetch(`${testServer.origin}/api/v1/events`, {
      headers: { cookie: testServer.adminCookie },
      signal: abortController.signal,
    });
    expect(streamResponse.status).toBe(200);
    const reader: ReadableStreamDefaultReader<Uint8Array> = streamResponse.body!.getReader();

    const commandResponse: Response = await fetch(`${testServer.origin}/api/v1/catalog/events`, {
      body: JSON.stringify({ commandId: 'web-command-1' }),
      headers: {
        cookie: testServer.adminCookie,
        'content-type': 'application/json',
        origin: testServer.origin,
      },
      method: 'POST',
    });
    expect(commandResponse.status).toBe(200);

    const decoder: TextDecoder = new TextDecoder();
    let eventText: string = '';
    for (let index: number = 0; index < 4 && !eventText.includes('catalog.mutations-applied'); index += 1) {
      const chunk: ReadableStreamReadResult<Uint8Array> = await reader.read();
      eventText += decoder.decode(chunk.value, { stream: true });
    }
    abortController.abort();
    await reader.cancel().catch((): void => undefined);

    expect(eventText).toContain('event: catalog.mutations-applied');
    expect(eventText).toContain('"commandId":"web-command-1"');
    const mutationsResponse: Response = await fetch(`${testServer.origin}/api/v1/mutations`, {
      headers: { cookie: testServer.adminCookie },
    });
    const mutations = await mutationsResponse.json() as { mutations: Array<{ type: string }> };
    expect(mutations.mutations.filter((mutation) => mutation.type === 'event-created')).toHaveLength(2);
  });

  it('deletes a category through HTTP, persists its mutations, and broadcasts the removal', async () => {
    const createEventResponse: Response = await fetch(`${testServer.origin}/api/v1/catalog/events`, {
      body: JSON.stringify({}),
      headers: {
        'content-type': 'application/json',
        cookie: testServer.adminCookie,
        origin: testServer.origin,
      },
      method: 'POST',
    });
    const createdEvent = await createEventResponse.json() as { catalog: { events: Array<{ id: string }> } };
    const eventId: string = createdEvent.catalog.events[0]!.id;
    const createCategoryResponse: Response = await fetch(`${testServer.origin}/api/v1/catalog/events/${eventId}/categories`, {
      body: JSON.stringify({}),
      headers: {
        'content-type': 'application/json',
        cookie: testServer.adminCookie,
        origin: testServer.origin,
      },
      method: 'POST',
    });
    const createdCategory = await createCategoryResponse.json() as { catalog: { categories: Array<{ eventId: string; id: string }> } };
    const categoryId: string = createdCategory.catalog.categories.find((category) => category.eventId === eventId)!.id;
    const abortController: AbortController = new AbortController();
    const streamResponse: Response = await fetch(`${testServer.origin}/api/v1/events`, {
      headers: { cookie: testServer.adminCookie },
      signal: abortController.signal,
    });
    const reader: ReadableStreamDefaultReader<Uint8Array> = streamResponse.body!.getReader();

    const deleteResponse: Response = await fetch(`${testServer.origin}/api/v1/catalog/events/${eventId}/categories/${categoryId}`, {
      headers: {
        cookie: testServer.adminCookie,
        origin: testServer.origin,
      },
      method: 'DELETE',
    });
    const deletion = await deleteResponse.json() as { mutations: EventCatalogMutation[] };
    const eventText: string = await readSseEvent(reader, 'catalog.mutations-applied');
    abortController.abort();
    await reader.cancel().catch((): void => undefined);

    expect(deleteResponse.status).toBe(200);
    expect(deletion.mutations.map((mutation) => mutation.type)).toEqual(['category-deleted']);
    expect(eventText).toContain(categoryId);
    const mutationsResponse: Response = await fetch(`${testServer.origin}/api/v1/mutations`, {
      headers: { cookie: testServer.adminCookie },
    });
    const persisted = await mutationsResponse.json() as { mutations: EventCatalogMutation[] };
    expect(persisted.mutations).toEqual(expect.arrayContaining([
      expect.objectContaining({ categoryId, type: 'category-deleted' }),
    ]));
  });

  it('deletes multiple entrants through one HTTP command and broadcasts one catalog mutation', async () => {
    const eventResponse = await jsonRequest(testServer.origin, '/api/v1/catalog/events', {}, testServer.adminCookie);
    const event = await eventResponse.json() as { catalog: { events: Array<{ id: string }> } };
    const eventId = event.catalog.events[0]!.id;
    const firstEntrantResponse = await jsonRequest(testServer.origin, `/api/v1/catalog/events/${eventId}/entrants`, {}, testServer.adminCookie);
    const secondEntrantResponse = await jsonRequest(testServer.origin, `/api/v1/catalog/events/${eventId}/entrants`, {}, testServer.adminCookie);
    const firstEntrant = await firstEntrantResponse.json() as { catalog: { entrants: Array<{ eventId: string; id: string }> } };
    const secondEntrant = await secondEntrantResponse.json() as { catalog: { entrants: Array<{ eventId: string; id: string }> } };
    const entrantIds = [
      firstEntrant.catalog.entrants.filter((entrant) => entrant.eventId === eventId).at(-1)!.id,
      secondEntrant.catalog.entrants.filter((entrant) => entrant.eventId === eventId).at(-1)!.id,
    ];
    const abortControllers: AbortController[] = [new AbortController(), new AbortController()];
    const readers = await Promise.all(abortControllers.map(async (abortController) => {
      const streamResponse = await fetch(`${testServer.origin}/api/v1/events`, {
        headers: { cookie: testServer.adminCookie },
        signal: abortController.signal,
      });
      return streamResponse.body!.getReader();
    }));

    const deleteResponse = await fetch(`${testServer.origin}/api/v1/catalog/events/${eventId}/entrants`, {
      body: JSON.stringify({ entrantIds }),
      headers: { 'content-type': 'application/json', cookie: testServer.adminCookie, origin: testServer.origin },
      method: 'DELETE',
    });
    const deletion = await deleteResponse.json() as { mutations: EventCatalogMutation[] };
    const eventTexts = await Promise.all(readers.map((reader) => readSseEvent(reader, 'catalog.mutations-applied')));
    abortControllers.forEach((abortController) => abortController.abort());
    await Promise.all(readers.map((reader) => reader.cancel().catch((): void => undefined)));
    const persistedResponse = await fetch(`${testServer.origin}/api/v1/mutations`, { headers: { cookie: testServer.adminCookie } });
    const persisted = await persistedResponse.json() as { mutations: EventCatalogMutation[] };

    expect(deleteResponse.status).toBe(200);
    expect(deletion.mutations).toEqual([expect.objectContaining({ entrantIds, type: 'entrants-deleted' })]);
    expect(eventTexts).toHaveLength(2);
    eventTexts.forEach((eventText) => expect(eventText).toContain('entrants-deleted'));
    expect(persisted.mutations.filter((mutation) => mutation.type === 'entrants-deleted')).toHaveLength(1);
  });

  it('broadcasts an Electron replica event mutation to every connected client', async () => {
    const abortControllers: AbortController[] = [
      new AbortController(),
      new AbortController(),
    ];
    const streamResponses: Response[] = await Promise.all(abortControllers.map(
      (abortController: AbortController): Promise<Response> =>
        fetch(`${testServer.origin}/api/v1/events`, {
          headers: { cookie: testServer.adminCookie },
          signal: abortController.signal,
        }),
    ));
    expect(streamResponses.every(
      (streamResponse: Response): boolean => streamResponse.status === 200,
    )).toBe(true);
    const readers: Array<ReadableStreamDefaultReader<Uint8Array>> = streamResponses.map(
      (streamResponse: Response): ReadableStreamDefaultReader<Uint8Array> =>
        streamResponse.body!.getReader(),
    );
    const eventReads: Array<Promise<string>> = readers.map(
      (reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> =>
        readSseEvent(reader, 'catalog.mutations-applied'),
    );
    const eventId = createEventId('electron-created-event');
    const mutation: EventCatalogMutation = {
      event: {
        categoryIds: [],
        date: '2026-07-29',
        entrantIds: [],
        format: 'race-weekend',
        id: eventId,
        name: 'Electron-created event',
        sessionIds: [],
      },
      id: createId('electron-created-event-mutation'),
      timestamp: '2026-07-29T00:00:00.000Z',
      type: 'event-created',
    };

    const mutationResponse: Response = await fetch(
      `${testServer.origin}/api/v1/mutations`,
      {
        body: JSON.stringify({
          commandId: 'electron-command-1',
          mutations: [mutation],
        }),
        headers: {
          cookie: testServer.adminCookie,
          'content-type': 'application/json',
          origin: testServer.origin,
        },
        method: 'PUT',
      },
    );
    expect(mutationResponse.status).toBe(200);
    const deliveredEvents: string[] = await Promise.all(eventReads);

    deliveredEvents.forEach((eventText: string): void => {
      expect(eventText).toContain('event: catalog.mutations-applied');
      expect(eventText).toContain('"commandId":"electron-command-1"');
      expect(eventText).toContain('Electron-created event');
      expect(eventText).toContain(eventId.toString());
    });
    const mutationsResponse: Response = await fetch(`${testServer.origin}/api/v1/mutations`, {
      headers: { cookie: testServer.adminCookie },
    });
    const persisted = await mutationsResponse.json() as {
      mutations: EventCatalogMutation[];
    };
    expect(persisted.mutations).toContainEqual(mutation);

    const reopenedWebResponse: Response = await fetch(`${testServer.origin}/api/v1/mutations`, {
      headers: { cookie: testServer.adminCookie },
    });
    const reopenedWebLedger = await reopenedWebResponse.json() as { mutations: EventCatalogMutation[] };
    expect(reopenedWebLedger.mutations).toContainEqual(mutation);

    abortControllers.forEach((abortController: AbortController): void => {
      abortController.abort();
    });
    await Promise.all(readers.map(
      (reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> =>
        reader.cancel().catch((): void => undefined),
    ));
  });

  it('accepts a DATA-1-sized mutation ledger write', async () => {
    const eventId = createEventId('data-1-large-ledger-event');
    const mutation: EventCatalogMutation = {
      event: {
        categoryIds: [],
        date: '2026-07-30',
        entrantIds: [],
        format: 'race-weekend',
        id: eventId,
        name: 'DATA-1 crossing '.repeat(800_000),
        sessionIds: [],
      },
      id: createId('data-1-large-ledger-mutation'),
      timestamp: '2026-07-30T00:00:00.000Z',
      type: 'event-created',
    };

    const response: Response = await fetch(`${testServer.origin}/api/v1/mutations`, {
      body: JSON.stringify({ mutations: [mutation] }),
      headers: {
        'content-type': 'application/json',
        cookie: testServer.adminCookie,
        origin: testServer.origin,
      },
      method: 'PUT',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      acknowledgedMutationIds: [mutation.id.toString()],
    }));
  });

  it('broadcasts an Electron flag deletion to every connected client', async () => {
    const abortControllers: AbortController[] = [
      new AbortController(),
      new AbortController(),
    ];
    const streamResponses: Response[] = await Promise.all(
      abortControllers.map(
        (abortController: AbortController): Promise<Response> =>
          fetch(`${testServer.origin}/api/v1/events`, {
            headers: { cookie: testServer.adminCookie },
            signal: abortController.signal,
          }),
      ),
    );
    const readers: Array<ReadableStreamDefaultReader<Uint8Array>> =
      streamResponses.map(
        (streamResponse: Response): ReadableStreamDefaultReader<Uint8Array> =>
          streamResponse.body!.getReader(),
      );
    const eventReads: Array<Promise<string>> = readers.map(
      (reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> =>
        readSseEvent(reader, 'race-admin.changed'),
    );
    const changes = {
      ...createDefaultAdministrativeChanges(),
      flagDeleted: {
        'electron-deleted-flag': true,
      },
    };

    const updateResponse: Response = await fetch(
      `${testServer.origin}/api/v1/race-admin`,
      {
        body: JSON.stringify({
          changes,
          commandId: 'electron-flag-delete-command',
        }),
        headers: {
          cookie: testServer.adminCookie,
          'content-type': 'application/json',
          origin: testServer.origin,
        },
        method: 'PUT',
      },
    );
    expect(updateResponse.status).toBe(200);
    const deliveredEvents: string[] = await Promise.all(eventReads);

    deliveredEvents.forEach((eventText: string): void => {
      expect(eventText).toContain('event: race-admin.changed');
      expect(eventText).toContain('"commandId":"electron-flag-delete-command"');
      expect(eventText).toContain('"electron-deleted-flag":true');
    });
    const persistedResponse: Response = await fetch(
      `${testServer.origin}/api/v1/race-admin`,
      {
        headers: { cookie: testServer.adminCookie },
      },
    );
    expect(await persistedResponse.json()).toEqual(changes);

    abortControllers.forEach((abortController: AbortController): void => {
      abortController.abort();
    });
    await Promise.all(
      readers.map(
        (reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> =>
          reader.cancel().catch((): void => undefined),
      ),
    );
  });

  it('broadcasts a web flag restoration through the browser adapter to an Electron subscriber', async () => {
    const originalFetch: typeof fetch = globalThis.fetch;
    const abortController: AbortController = new AbortController();
    const streamResponse: Response = await originalFetch(
      `${testServer.origin}/api/v1/events`,
      {
        headers: { cookie: testServer.adminCookie },
        signal: abortController.signal,
      },
    );
    expect(streamResponse.status).toBe(200);
    const reader: ReadableStreamDefaultReader<Uint8Array> =
      streamResponse.body!.getReader();
    const eventRead: Promise<string> = readSseEvent(
      reader,
      'race-admin.changed',
    );
    const changes: AdministrativeChanges = {
      ...createDefaultAdministrativeChanges(),
      flagDeleted: {
        'web-restored-flag': false,
      },
    };
    globalThis.fetch = (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const requestUrl: URL = new URL(input.toString(), testServer.origin);
      const headers: Headers = new Headers(init?.headers);
      headers.set('cookie', testServer.adminCookie);
      headers.set('origin', testServer.origin);
      return originalFetch(requestUrl, {
        ...init,
        headers,
      });
    };

    try {
      const browserApi: Window['api'] = createServerConnectedRendererApi();
      await browserApi.writeFileContent(
        '../../src/generated/admin-overrides.json',
        JSON.stringify(changes),
      );
      const deliveredEvent: string = await eventRead;

      expect(deliveredEvent).toContain('event: race-admin.changed');
      expect(deliveredEvent).toContain('"web-restored-flag":false');
      const persistedResponse: Response = await originalFetch(
        `${testServer.origin}/api/v1/race-admin`,
        {
          headers: { cookie: testServer.adminCookie },
        },
      );
      expect(await persistedResponse.json()).toEqual(changes);
    } finally {
      globalThis.fetch = originalFetch;
      abortController.abort();
      await reader.cancel().catch((): void => undefined);
    }
  });

  it('prevents viewers from issuing catalog commands', async () => {
    const createViewer: Response = await jsonRequest(
      testServer.origin,
      '/api/v1/auth/users',
      {
        password: 'viewer password is long enough',
        role: 'viewer',
        username: 'viewer',
      },
      testServer.adminCookie,
    );
    expect(createViewer.status).toBe(201);
    const loginViewer: Response = await jsonRequest(testServer.origin, '/api/v1/auth/login', {
      password: 'viewer password is long enough',
      username: 'viewer',
    });
    const viewerCookie: string = (loginViewer.headers.get('set-cookie') || '').split(';')[0] || '';

    const mutationResponse: Response = await fetch(`${testServer.origin}/api/v1/catalog/events`, {
      body: '{}',
      headers: {
        cookie: viewerCookie,
        'content-type': 'application/json',
        origin: testServer.origin,
      },
      method: 'POST',
    });
    expect(mutationResponse.status).toBe(403);
  });
});
