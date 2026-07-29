import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https';
import type { AddressInfo, Socket } from 'node:net';
import path from 'node:path';
import type { EventCatalogState } from '../../catalog/eventCatalog.js';
import type { EventCatalogMutation } from '../../ledger/eventCatalogLedger.js';
import type { CategoryId } from '../../processing/category.js';
import type { EventEntrantId } from '../../model/entrant.js';
import type { EventId, SessionId } from '../../model/raceevent.js';
import type {
  ApiProblem,
  ApplicationBootstrap,
  AuthenticatedUser,
  JsonValue,
  LoginRequest,
  RuntimeCapabilities,
  SetupRequest,
  UserRole,
} from '../../model/serverApi.js';
import {
  NodeJsonEventCatalogPersistence,
  NodeJsonRaceAdminPersistence,
  NodeJsonSystemConfigPersistence,
} from '../../persistence/nodePersistence.js';
import type {
  AdministrativeChanges,
} from '../../persistence/raceAdminPersistence.js';
import { EventCatalogService } from '../../service/eventCatalogService.js';
import { SystemConfigService } from '../../service/systemConfigService.js';
import {
  type ListenerServerConfig,
  type SystemConfiguration,
  normalizeSystemConfiguration,
} from '../systemConfig.js';
import { getOpenApiSpecification } from '../openapi.js';
import { RESTART_REQUIRED_AFTER } from '../restartVersion.js';
import { AuthStore } from './authStore.js';
import { DomainEventHub } from './domainEventHub.js';
import { UploadStore } from './uploadStore.js';

type ListenerServer = HttpServer | HttpsServer;

const SESSION_COOKIE_NAME: string = 'racesweet_session';
const LOGIN_ATTEMPT_WINDOW_MS: number = 60_000;
const LOGIN_BLOCK_DURATION_MS: number = 5 * 60_000;
const MAXIMUM_LOGIN_ATTEMPTS: number = 5;
const requiredSwaggerAssets: string[] = [
  'swagger-ui.css',
  'swagger-ui-bundle.js',
  'swagger-ui-standalone-preset.js',
];
const staticContentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const rolePermissions: Record<UserRole, string[]> = {
  admin: ['race:read', 'race:write', 'server:admin', 'users:admin'],
  operator: ['race:read', 'race:write'],
  viewer: ['race:read'],
};

export interface RaceSweetApplicationServerOptions {
  assetSource?: string;
  dataDirectory: string;
  eventRetention?: number;
  externalAssetSource?: string | null;
  swaggerAssetDirectory?: string;
}

export interface StartedRaceSweetServer {
  origin: string;
  port: number;
}

interface JsonObject {
  [key: string]: JsonValue;
}

interface LoginAttemptState {
  blockedUntil?: number;
  failures: number[];
}

const jsonValue = (value: object): JsonValue =>
  JSON.parse(JSON.stringify(value)) as JsonValue;

const readRequestBody = async <TValue>(request: IncomingMessage): Promise<TValue> =>
  new Promise<TValue>((resolve, reject): void => {
    let body: string = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string): void => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error('Request body exceeds the 10 MiB JSON limit.'));
        request.destroy();
      }
    });
    request.on('end', (): void => {
      try {
        resolve(JSON.parse(body || '{}') as TValue);
      } catch (error: unknown) {
        reject(error);
      }
    });
    request.on('error', reject);
  });

const parseCookies = (header: string | undefined): Record<string, string> =>
  Object.fromEntries(
    (header || '')
      .split(';')
      .map((item: string): string[] => item.trim().split('='))
      .filter((item: string[]): boolean => item.length >= 2)
      .map((item: string[]): [string, string] => [
        item[0] || '',
        decodeURIComponent(item.slice(1).join('=')),
      ]),
  );

const sendJson = (
  response: ServerResponse,
  status: number,
  value: object,
  headers: Record<string, string> = {},
): void => {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    ...headers,
  }).end(JSON.stringify(value));
};

const sendProblem = (response: ServerResponse, status: number, error: string): void => {
  sendJson(response, status, { error, status } satisfies ApiProblem);
};

const sendHtml = (
  response: ServerResponse,
  status: number,
  html: string | Buffer,
): void => {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'text/html; charset=utf-8',
  }).end(html);
};

const getUnavailablePage = (
  title: string,
  message: string,
  action: string,
): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { color: #202124; font: 16px/1.5 system-ui, sans-serif; margin: 3rem auto; max-width: 48rem; padding: 0 1.5rem; }
    h1 { color: #b3261e; }
    code { background: #f1f3f4; border-radius: 0.25rem; padding: 0.15rem 0.35rem; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${message}</p>
    <p>${action}</p>
  </main>
</body>
</html>`;

const getLocalScriptPaths = (html: string): string[] =>
  Array.from(html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/giu))
    .map((match: RegExpMatchArray): string => match[1] || '')
    .filter((source: string): boolean =>
      source.length > 0 &&
      !/^(?:data:|https?:|\/\/)/iu.test(source),
    )
    .map((source: string): string => new URL(source, 'http://localhost/').pathname);

const isStaticAssetRequest = (requestPath: string): boolean =>
  path.posix.extname(requestPath) !== '';

const applicationAssetCacheControl = (requestPath: string): string =>
  /(?:^|[.-])[a-f0-9]{8,}(?:[.-]|$)/iu.test(path.posix.basename(requestPath))
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';

const setSecurityHeaders = (response: ServerResponse): void => {
  response.setHeader('content-security-policy', [
    "default-src 'self'",
    "connect-src 'self'",
    "font-src 'self' data:",
    "img-src 'self' data:",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
  ].join('; '));
  response.setHeader('referrer-policy', 'same-origin');
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('x-frame-options', 'DENY');
};

const getSwaggerUiHtml = (): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>RaceSweet API documentation</title>
  <link rel="stylesheet" href="/api/swagger-ui/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="/api/swagger-ui/swagger-ui-bundle.js"></script>
  <script src="/api/swagger-ui/swagger-ui-standalone-preset.js"></script>
  <script src="/api/swagger-ui/swagger-ui-init.js"></script>
</body>
</html>`;

const getSwaggerUiInit = (): string => `window.onload = function () {
  window.ui = SwaggerUIBundle({
    dom_id: '#swagger-ui',
    deepLinking: true,
    layout: 'StandaloneLayout',
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    url: '/api/openapi.json'
  });
};`;

const closeServer = async (server: ListenerServer): Promise<void> =>
  new Promise<void>((resolve, reject): void => {
    server.close((error?: Error): void => error ? reject(error) : resolve());
  });

const listen = async (
  server: ListenerServer,
  port: number,
  host?: string,
): Promise<number> => new Promise<number>((resolve, reject): void => {
  server.once('error', reject);
  server.listen(port, host, (): void => {
    server.off('error', reject);
    resolve((server.address() as AddressInfo).port);
  });
});

const listenerConfigsEqual = (
  left: ListenerServerConfig,
  right: ListenerServerConfig,
): boolean =>
  left.certificatePath === right.certificatePath &&
  left.enabled === right.enabled &&
  left.httpPort === right.httpPort &&
  left.httpsPort === right.httpsPort &&
  left.privateKeyPath === right.privateKeyPath;

const listeningPort = (server: ListenerServer | undefined): number | undefined => {
  if (!server?.listening) {
    return undefined;
  }
  const address: AddressInfo | string | null = server.address();
  return typeof address === 'object' && address !== null ? address.port : undefined;
};

const safeConfiguration = (
  config: SystemConfiguration,
): ApplicationBootstrap['systemConfiguration'] => ({
  dataSources: config.dataSources.map((source) => ({
    enabled: source.enabled,
    id: source.id,
    name: source.name,
    type: source.type,
  })),
  eventSourceAssignments: config.eventSourceAssignments,
  sessionSourceAssignments: config.sessionSourceAssignments,
});

const sharedConfigurationForClient = (config: SystemConfiguration): SystemConfiguration => ({
  ...config,
  dataSources: config.dataSources.map((source) => ({
    ...source,
    apiConfig: source.apiConfig
      ? {
          ...source.apiConfig,
          authHeaderValue: '',
        }
      : undefined,
  })),
  listenerServer: undefined,
  remoteServer: undefined,
});

const requestProtocol = (request: IncomingMessage): 'http' | 'https' =>
  request.socket && 'encrypted' in request.socket ? 'https' : 'http';

const isMutationMethod = (method: string | undefined): boolean =>
  method !== undefined && !['GET', 'HEAD', 'OPTIONS'].includes(method);

const resolveDevelopmentAssetUrl = (
  assetSource: string,
  requestPath: string,
): URL => {
  const baseUrl: URL = new URL(assetSource);
  return requestPath === '/'
    ? baseUrl
    : new URL(requestPath, baseUrl.origin);
};

export class RaceSweetApplicationServer {
  private readonly assetSource: string | undefined;
  private readonly authStore: AuthStore;
  private commandQueue: Promise<void> = Promise.resolve();
  private readonly dataDirectory: string;
  private readonly eventHub: DomainEventHub;
  private readonly externalAssetSource: string | undefined;
  private activeListenerConfig: ListenerServerConfig | undefined;
  private eventCatalogService: EventCatalogService | undefined;
  private externalHttpServer: HttpServer | undefined;
  private externalHttpsServer: HttpsServer | undefined;
  private internalServer: HttpServer | undefined;
  private readonly loginAttempts = new Map<string, LoginAttemptState>();
  private readonly launchedVersion: string;
  private readonly sockets = new Set<Socket>();
  private systemConfigService: SystemConfigService | undefined;
  private readonly raceAdminPersistence: NodeJsonRaceAdminPersistence;
  private readonly swaggerAssetDirectory: string;
  private readonly uploadStore: UploadStore;

  public constructor(options: RaceSweetApplicationServerOptions) {
    this.assetSource = options.assetSource;
    this.dataDirectory = options.dataDirectory;
    this.externalAssetSource = options.externalAssetSource === null
      ? undefined
      : options.externalAssetSource || options.assetSource;
    this.authStore = new AuthStore(path.join(options.dataDirectory, 'users.json'));
    this.eventHub = new DomainEventHub(options.eventRetention);
    this.launchedVersion = RESTART_REQUIRED_AFTER;
    this.raceAdminPersistence = new NodeJsonRaceAdminPersistence(
      path.join(options.dataDirectory, 'admin-overrides.json'),
    );
    this.swaggerAssetDirectory = options.swaggerAssetDirectory ||
      path.resolve('node_modules', 'swagger-ui-dist');
    this.uploadStore = new UploadStore(path.join(options.dataDirectory, 'uploads'));
  }

  public initialize = async (): Promise<void> => {
    await this.authStore.initialize();
    this.eventCatalogService = await EventCatalogService.create(
      new NodeJsonEventCatalogPersistence(path.join(this.dataDirectory, 'event-catalog.json')),
    );
    this.systemConfigService = await SystemConfigService.create(
      new NodeJsonSystemConfigPersistence(path.join(this.dataDirectory, 'system-config.json')),
    );
  };

  public get listenerConfig(): ListenerServerConfig {
    this.assertInitialized();
    return this.systemConfigService!.state.listenerServer || { enabled: false };
  }

  public startInternal = async (): Promise<StartedRaceSweetServer> => {
    this.assertInitialized();
    if (this.internalServer) {
      const address: AddressInfo = this.internalServer.address() as AddressInfo;
      return {
        origin: `http://127.0.0.1:${address.port}`,
        port: address.port,
      };
    }
    this.internalServer = createHttpServer((
      request: IncomingMessage,
      response: ServerResponse,
    ): void => {
      void this.handleRequest(request, response, this.assetSource);
    });
    this.trackSockets(this.internalServer);
    const port: number = await listen(this.internalServer, 0, '127.0.0.1');
    return {
      origin: `http://127.0.0.1:${port}`,
      port,
    };
  };

  public reloadExternal = async (config: ListenerServerConfig): Promise<void> => {
    if (
      this.activeListenerConfig &&
      listenerConfigsEqual(this.activeListenerConfig, config)
    ) {
      return;
    }
    let nextHttpServer: HttpServer | undefined;
    let nextHttpsServer: HttpsServer | undefined;
    if (config.enabled && config.httpPort) {
      if (listeningPort(this.externalHttpServer) === config.httpPort) {
        nextHttpServer = this.externalHttpServer;
      } else {
        nextHttpServer = createHttpServer((
          request: IncomingMessage,
          response: ServerResponse,
        ): void => {
          void this.handleRequest(request, response, this.externalAssetSource);
        });
        this.trackSockets(nextHttpServer);
      }
    }
    if (config.enabled && config.httpsPort && config.certificatePath && config.privateKeyPath) {
      const secureContext: { cert: Buffer; key: Buffer } = {
        cert: await readFile(config.certificatePath),
        key: await readFile(config.privateKeyPath),
      };
      if (listeningPort(this.externalHttpsServer) === config.httpsPort) {
        this.externalHttpsServer!.setSecureContext(secureContext);
        nextHttpsServer = this.externalHttpsServer;
      } else {
        nextHttpsServer = createHttpsServer(secureContext, (
          request: IncomingMessage,
          response: ServerResponse,
        ): void => {
          void this.handleRequest(request, response, this.externalAssetSource);
        });
        this.trackSockets(nextHttpsServer);
      }
    }
    await Promise.all([
      nextHttpServer && !nextHttpServer.listening && config.httpPort
        ? listen(nextHttpServer, config.httpPort)
        : undefined,
      nextHttpsServer && !nextHttpsServer.listening && config.httpsPort
        ? listen(nextHttpsServer, config.httpsPort)
        : undefined,
    ]);
    const previous: ListenerServer[] = [this.externalHttpServer, this.externalHttpsServer]
      .filter((server: ListenerServer | undefined): server is ListenerServer =>
        server !== undefined && server !== nextHttpServer && server !== nextHttpsServer,
      );
    this.externalHttpServer = nextHttpServer;
    this.externalHttpsServer = nextHttpsServer;
    this.activeListenerConfig = { ...config };
    await Promise.all(previous.map(closeServer));
  };

  public close = async (): Promise<void> => {
    this.eventHub.close();
    await this.uploadStore.close();
    const servers: ListenerServer[] = [
      this.internalServer,
      this.externalHttpServer,
      this.externalHttpsServer,
    ].filter((server: ListenerServer | undefined): server is ListenerServer => server !== undefined);
    this.sockets.forEach((socket: Socket): void => {
      socket.destroy();
    });
    this.sockets.clear();
    await Promise.all(servers.map(closeServer).map((closing: Promise<void>): Promise<void> =>
      closing.catch((error: Error): void => {
        if (!error.message.includes('Server is not running')) {
          throw error;
        }
      }),
    ));
    this.internalServer = undefined;
    this.externalHttpServer = undefined;
    this.externalHttpsServer = undefined;
    this.activeListenerConfig = undefined;
  };

  private activeListenerStatus = (): ListenerServerConfig => {
    const configured: ListenerServerConfig = this.listenerConfig;
    const httpPort: number | undefined = listeningPort(this.externalHttpServer);
    const httpsPort: number | undefined = listeningPort(this.externalHttpsServer);
    return {
      enabled: httpPort !== undefined || httpsPort !== undefined,
      httpPort: httpPort ?? configured.httpPort,
      httpsPort: httpsPort ?? configured.httpsPort,
    };
  };

  private assertInitialized = (): void => {
    if (!this.eventCatalogService || !this.systemConfigService) {
      throw new Error('RaceSweetApplicationServer.initialize() must complete before the server starts.');
    }
  };

  private trackSockets = (server: ListenerServer): void => {
    server.on('connection', (socket: Socket): void => {
      this.sockets.add(socket);
      socket.once('close', (): void => {
        this.sockets.delete(socket);
      });
    });
  };

  private authenticatedUser = (request: IncomingMessage): AuthenticatedUser | undefined => {
    const token: string | undefined = parseCookies(request.headers.cookie)[SESSION_COOKIE_NAME];
    return this.authStore.getUserForSession(token);
  };

  private requireUser = (
    request: IncomingMessage,
    response: ServerResponse,
    permission: string,
  ): AuthenticatedUser | undefined => {
    const user: AuthenticatedUser | undefined = this.authenticatedUser(request);
    if (!user) {
      sendProblem(response, 401, 'Authentication is required.');
      return undefined;
    }
    if (!rolePermissions[user.role].includes(permission)) {
      sendProblem(response, 403, 'Your RaceSweet role does not permit this operation.');
      return undefined;
    }
    return user;
  };

  private validRequestOrigin = (request: IncomingMessage): boolean => {
    const origin: string | undefined = request.headers.origin;
    if (!origin) {
      return true;
    }
    const host: string | undefined = request.headers.host;
    return host !== undefined && origin === `${requestProtocol(request)}://${host}`;
  };

  private getLoginAttemptKey = (request: IncomingMessage): string =>
    request.socket.remoteAddress || 'unknown';

  private getLoginRetrySeconds = (request: IncomingMessage): number | undefined => {
    const now: number = Date.now();
    const key: string = this.getLoginAttemptKey(request);
    const state: LoginAttemptState | undefined = this.loginAttempts.get(key);
    if (!state) {
      return undefined;
    }
    if (state.blockedUntil && state.blockedUntil > now) {
      return Math.max(1, Math.ceil((state.blockedUntil - now) / 1_000));
    }
    const failures: number[] = state.failures.filter(
      (timestamp: number): boolean => now - timestamp < LOGIN_ATTEMPT_WINDOW_MS,
    );
    if (failures.length === 0) {
      this.loginAttempts.delete(key);
      return undefined;
    }
    this.loginAttempts.set(key, { failures });
    return undefined;
  };

  private recordLoginFailure = (request: IncomingMessage): number | undefined => {
    const now: number = Date.now();
    const key: string = this.getLoginAttemptKey(request);
    const current: LoginAttemptState = this.loginAttempts.get(key) || { failures: [] };
    const failures: number[] = [
      ...current.failures.filter(
        (timestamp: number): boolean => now - timestamp < LOGIN_ATTEMPT_WINDOW_MS,
      ),
      now,
    ];
    if (failures.length >= MAXIMUM_LOGIN_ATTEMPTS) {
      const blockedUntil: number = now + LOGIN_BLOCK_DURATION_MS;
      this.loginAttempts.set(key, { blockedUntil, failures: [] });
      return Math.ceil(LOGIN_BLOCK_DURATION_MS / 1_000);
    }
    this.loginAttempts.set(key, { failures });
    return undefined;
  };

  private clearLoginFailures = (request: IncomingMessage): void => {
    this.loginAttempts.delete(this.getLoginAttemptKey(request));
  };

  private readonly handleRequest = async (
    request: IncomingMessage,
    response: ServerResponse,
    assetSource: string | undefined,
  ): Promise<void> => {
    setSecurityHeaders(response);
    const url: URL = new URL(request.url || '/', 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) {
        if (isMutationMethod(request.method) && !this.validRequestOrigin(request)) {
          sendProblem(response, 403, 'The request origin does not match this RaceSweet server.');
          return;
        }
        await this.handleApiRequest(request, response, url);
        return;
      }
      if (url.pathname === '/api') {
        await this.serveSwaggerDocumentation(response);
        return;
      }
      await this.serveApplication(url.pathname, response, assetSource);
    } catch (error: unknown) {
      if (!response.headersSent) {
        sendProblem(response, 400, error instanceof Error ? error.message : String(error));
      } else if (!response.writableEnded) {
        response.end();
      }
    }
  };

  private handleApiRequest = async (
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
  ): Promise<void> => {
    if (request.method === 'GET' && url.pathname === '/api/v1/runtime-version') {
      sendJson(response, 200, { launchedVersion: this.launchedVersion });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/openapi.json') {
      sendJson(response, 200, getOpenApiSpecification());
      return;
    }
    if (request.method === 'GET' && url.pathname.startsWith('/api/swagger-ui/')) {
      await this.serveSwaggerAsset(url.pathname, response);
      return;
    }
    if (url.pathname.startsWith('/api/v1/auth/')) {
      await this.handleAuthentication(request, response, url);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/bootstrap') {
      const user: AuthenticatedUser | undefined = this.requireUser(request, response, 'race:read');
      if (!user) {
        return;
      }
      const runtime: RuntimeCapabilities['runtime'] = url.searchParams.get('runtime') === 'electron'
        ? 'electron'
        : 'web';
      sendJson(response, 200, this.createBootstrap(user, runtime));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/events') {
      const user: AuthenticatedUser | undefined = this.requireUser(request, response, 'race:read');
      if (!user) {
        return;
      }
      const dispose: () => void = this.eventHub.subscribe(
        response,
        Array.isArray(request.headers['last-event-id'])
          ? request.headers['last-event-id'][0]
          : request.headers['last-event-id'] || url.searchParams.get('cursor') || undefined,
      );
      response.once('close', dispose);
      return;
    }
    if (url.pathname === '/api/v1/mutations') {
      await this.handleMutations(request, response, url);
      return;
    }
    if (url.pathname === '/api/v1/uploads') {
      await this.handleUpload(request, response, url);
      return;
    }
    if (url.pathname.startsWith('/api/v1/uploads/')) {
      const user: AuthenticatedUser | undefined = this.requireUser(request, response, 'race:read');
      if (!user || request.method !== 'GET') {
        return;
      }
      const uploadId: string = url.pathname.slice('/api/v1/uploads/'.length);
      if (!this.uploadStore.download(uploadId, response)) {
        sendProblem(response, 404, `Upload ${uploadId} was not found.`);
      }
      return;
    }
    if (url.pathname.startsWith('/api/v1/catalog/')) {
      await this.handleCatalogCommand(request, response, url);
      return;
    }
    if (url.pathname.startsWith('/api/v1/system/')) {
      await this.handleSystemCommand(request, response, url);
      return;
    }
    if (url.pathname === '/api/v1/race-admin') {
      await this.handleRaceAdmin(request, response);
      return;
    }
    sendProblem(response, 404, 'API resource not found.');
  };

  private handleAuthentication = async (
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
  ): Promise<void> => {
    if (request.method === 'GET' && url.pathname === '/api/v1/auth/status') {
      sendJson(response, 200, {
        setupRequired: this.authStore.setupRequired,
        user: this.authenticatedUser(request),
      });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/auth/setup') {
      const result: { token: string; user: AuthenticatedUser } =
        await this.authStore.createInitialAdmin(
          await readRequestBody<SetupRequest>(request),
          request.socket.remoteAddress,
        );
      this.sendAuthenticated(request, response, result);
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/auth/login') {
      const retrySeconds: number | undefined = this.getLoginRetrySeconds(request);
      if (retrySeconds) {
        sendJson(response, 429, {
          error: 'Too many failed login attempts. Try again later.',
          status: 429,
        } satisfies ApiProblem, {
          'retry-after': retrySeconds.toString(),
        });
        return;
      }
      try {
        const result: { token: string; user: AuthenticatedUser } =
          await this.authStore.authenticate(await readRequestBody<LoginRequest>(request));
        this.clearLoginFailures(request);
        this.sendAuthenticated(request, response, result);
      } catch {
        const nextRetrySeconds: number | undefined = this.recordLoginFailure(request);
        sendJson(response, nextRetrySeconds ? 429 : 401, {
          error: nextRetrySeconds
            ? 'Too many failed login attempts. Try again later.'
            : 'Invalid username or password.',
          status: nextRetrySeconds ? 429 : 401,
        } satisfies ApiProblem, nextRetrySeconds
          ? { 'retry-after': nextRetrySeconds.toString() }
          : {});
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/auth/logout') {
      this.authStore.logout(parseCookies(request.headers.cookie)[SESSION_COOKIE_NAME]);
      sendJson(response, 200, {}, {
        'set-cookie': `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
      });
      return;
    }
    if (url.pathname === '/api/v1/auth/users') {
      const user: AuthenticatedUser | undefined = this.requireUser(request, response, 'users:admin');
      if (!user) {
        return;
      }
      if (request.method === 'GET') {
        sendJson(response, 200, { users: this.authStore.listUsers() });
        return;
      }
      if (request.method === 'POST') {
        const body: LoginRequest & { role: UserRole } =
          await readRequestBody<LoginRequest & { role: UserRole }>(request);
        sendJson(response, 201, await this.authStore.createUser(body));
        return;
      }
    }
    sendProblem(response, 404, 'Authentication resource not found.');
  };

  private sendAuthenticated = (
    request: IncomingMessage,
    response: ServerResponse,
    result: { token: string; user: AuthenticatedUser },
  ): void => {
    const secureAttribute: string = requestProtocol(request) === 'https' ? '; Secure' : '';
    sendJson(response, 200, result.user, {
      'set-cookie': `${SESSION_COOKIE_NAME}=${encodeURIComponent(result.token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${secureAttribute}`,
    });
  };

  private createBootstrap = (
    user: AuthenticatedUser,
    runtime: RuntimeCapabilities['runtime'],
  ): ApplicationBootstrap => {
    this.assertInitialized();
    const catalog: EventCatalogState = this.eventCatalogService!.catalog;
    return {
      catalog,
      permissions: rolePermissions[user.role],
      revision: this.eventHub.currentRevision,
      runtimeCapabilities: {
        canOpenLocalFiles: runtime === 'electron',
        canSelectDirectories: true,
        canSelectFiles: true,
        runtime,
      },
      systemConfiguration: safeConfiguration(this.systemConfigService!.state),
      timing: {
        activeEventId: catalog.activeEventId,
        activeSessionId: catalog.activeSessionId,
        records: [],
      },
      user,
    };
  };

  private handleMutations = async (
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
  ): Promise<void> => {
    const requiredPermission: string = request.method === 'GET' ? 'race:read' : 'race:write';
    const user: AuthenticatedUser | undefined = this.requireUser(request, response, requiredPermission);
    if (!user) {
      return;
    }
    this.assertInitialized();
    if (request.method === 'GET') {
      const mutations: EventCatalogMutation[] = this.eventCatalogService!.mutations;
      const offsetValue: number = Number.parseInt(url.searchParams.get('cursor') || '0', 10);
      const offset: number = Number.isSafeInteger(offsetValue) && offsetValue >= 0 ? offsetValue : 0;
      sendJson(response, 200, {
        cursor: mutations.length.toString(),
        mutations: mutations.slice(offset),
      });
      return;
    }
    if (request.method !== 'PUT') {
      sendProblem(response, 405, 'Only GET and PUT are supported.');
      return;
    }
    const body: { commandId?: string; mutations?: EventCatalogMutation[] } =
      await readRequestBody<{ commandId?: string; mutations?: EventCatalogMutation[] }>(request);
    const mutations: EventCatalogMutation[] = body.mutations || [];
    await this.enqueueCommand(async (): Promise<void> => {
      const knownIds: Set<string> = new Set(
        this.eventCatalogService!.mutations.map((mutation: EventCatalogMutation): string =>
          mutation.id.toString(),
        ),
      );
      await this.eventCatalogService!.applyRemoteMutations(mutations);
      const accepted: EventCatalogMutation[] = mutations.filter(
        (mutation: EventCatalogMutation): boolean => !knownIds.has(mutation.id.toString()),
      );
      if (accepted.length > 0) {
        this.eventHub.publish(
          'catalog',
          'catalog.mutations-applied',
          jsonValue({ mutations: accepted }),
          body.commandId,
        );
      }
    });
    sendJson(response, 200, {
      acknowledgedMutationIds: mutations.map((mutation: EventCatalogMutation): string =>
        mutation.id.toString(),
      ),
      cursor: this.eventCatalogService!.mutations.length.toString(),
    });
  };

  private handleCatalogCommand = async (
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
  ): Promise<void> => {
    const user: AuthenticatedUser | undefined = this.requireUser(request, response, 'race:write');
    if (!user) {
      return;
    }
    this.assertInitialized();
    const body: JsonObject = isMutationMethod(request.method)
      ? await readRequestBody<JsonObject>(request)
      : {};
    const commandId: string | undefined =
      typeof body.commandId === 'string' ? body.commandId : undefined;
    const beforeCount: number = this.eventCatalogService!.mutations.length;

    await this.enqueueCommand(async (): Promise<void> => {
      const eventMatch: RegExpMatchArray | null = url.pathname.match(/^\/api\/v1\/catalog\/events(?:\/([^/]+))?(?:\/(activate))?$/u);
      const sessionMatch: RegExpMatchArray | null = url.pathname.match(/^\/api\/v1\/catalog\/events\/([^/]+)\/sessions(?:\/([^/]+))?(?:\/(activate))?$/u);
      const categoryMatch: RegExpMatchArray | null = url.pathname.match(/^\/api\/v1\/catalog\/events\/([^/]+)\/categories(?:\/([^/]+))?$/u);
      const entrantMatch: RegExpMatchArray | null = url.pathname.match(/^\/api\/v1\/catalog\/events\/([^/]+)\/entrants(?:\/([^/]+))?$/u);

      if (sessionMatch) {
        const eventId: EventId = sessionMatch[1] as EventId;
        const sessionId: SessionId | undefined = sessionMatch[2] as SessionId | undefined;
        if (request.method === 'POST' && !sessionId) {
          await this.eventCatalogService!.createSession(eventId);
        } else if (request.method === 'POST' && sessionId && sessionMatch[3] === 'activate') {
          await this.eventCatalogService!.activateSession(eventId, sessionId);
        } else if (request.method === 'PATCH' && sessionId) {
          await this.eventCatalogService!.updateSession(sessionId, body.changes as never);
        } else if (request.method === 'DELETE' && sessionId) {
          await this.eventCatalogService!.deleteSession(eventId, sessionId);
        } else {
          throw new Error('Unsupported session command.');
        }
      } else if (categoryMatch) {
        const eventId: EventId = categoryMatch[1] as EventId;
        const categoryId: CategoryId | undefined = categoryMatch[2] as CategoryId | undefined;
        if (request.method === 'POST' && !categoryId) {
          await this.eventCatalogService!.createCategory(eventId);
        } else if (request.method === 'PATCH' && categoryId) {
          await this.eventCatalogService!.updateCategory(categoryId, body.changes as never);
        } else if (request.method === 'DELETE' && categoryId) {
          await this.eventCatalogService!.deleteCategory(eventId, categoryId);
        } else {
          throw new Error('Unsupported category command.');
        }
      } else if (entrantMatch) {
        const eventId: EventId = entrantMatch[1] as EventId;
        const entrantId: EventEntrantId | undefined = entrantMatch[2] as EventEntrantId | undefined;
        if (request.method === 'POST' && !entrantId) {
          const entrantType: 'rider' | 'team' = body.entrantType === 'team' ? 'team' : 'rider';
          await this.eventCatalogService!.createEntrant(eventId, entrantType);
        } else if (request.method === 'PATCH' && entrantId) {
          await this.eventCatalogService!.updateEntrant(entrantId, body.changes as never);
        } else if (request.method === 'DELETE' && entrantId) {
          await this.eventCatalogService!.deleteEntrant(eventId, entrantId);
        } else {
          throw new Error('Unsupported entrant command.');
        }
      } else if (eventMatch) {
        const eventId: EventId | undefined = eventMatch[1] as EventId | undefined;
        if (request.method === 'POST' && !eventId) {
          await this.eventCatalogService!.createEvent();
        } else if (request.method === 'POST' && eventId && eventMatch[2] === 'activate') {
          await this.eventCatalogService!.activateEvent(eventId);
        } else if (request.method === 'PATCH' && eventId) {
          await this.eventCatalogService!.updateEvent(eventId, body.changes as never);
        } else if (request.method === 'DELETE' && eventId) {
          await this.eventCatalogService!.deleteEvent(eventId);
        } else {
          throw new Error('Unsupported event command.');
        }
      } else {
        throw new Error('Catalog command resource not found.');
      }

      const accepted: EventCatalogMutation[] =
        this.eventCatalogService!.mutations.slice(beforeCount);
      if (accepted.length > 0) {
        this.eventHub.publish(
          'catalog',
          'catalog.mutations-applied',
          jsonValue({ mutations: accepted }),
          commandId,
        );
      }
    });
    sendJson(response, 200, {
      catalog: this.eventCatalogService!.catalog,
      revision: this.eventHub.currentRevision,
    });
  };

  private handleSystemCommand = async (
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
  ): Promise<void> => {
    this.assertInitialized();
    if (url.pathname === '/api/v1/system/configuration') {
      const requiredPermission: string = request.method === 'GET' ? 'race:read' : 'race:write';
      const user: AuthenticatedUser | undefined = this.requireUser(
        request,
        response,
        requiredPermission,
      );
      if (!user) {
        return;
      }
      if (request.method === 'GET') {
        sendJson(response, 200, {
          ...sharedConfigurationForClient(this.systemConfigService!.state),
          listenerServer: rolePermissions[user.role].includes('server:admin')
            ? this.activeListenerStatus()
            : undefined,
        });
        return;
      }
      if (request.method === 'PUT') {
        const body: { commandId?: string; config: SystemConfiguration } =
          await readRequestBody<{ commandId?: string; config: SystemConfiguration }>(request);
        await this.enqueueCommand(async (): Promise<void> => {
          const config: SystemConfiguration =
            await this.systemConfigService!.replaceSharedConfiguration(body.config);
          this.eventHub.publish(
            'system-config',
            'system-config.changed',
            jsonValue(safeConfiguration(config)),
            body.commandId,
          );
        });
        sendJson(response, 200, {
          config: safeConfiguration(this.systemConfigService!.state),
          revision: this.eventHub.currentRevision,
        });
        return;
      }
      sendProblem(response, 405, 'Only GET and PUT are supported.');
      return;
    }
    if (url.pathname === '/api/v1/system/listener') {
      const user: AuthenticatedUser | undefined = this.requireUser(request, response, 'server:admin');
      if (!user) {
        return;
      }
      if (request.method === 'GET') {
        sendJson(response, 200, {
          listenerServer: this.activeListenerStatus(),
        });
        return;
      }
      if (request.method !== 'PUT') {
        sendProblem(response, 405, 'Only GET and PUT are supported.');
        return;
      }
      const body: { changes: Partial<ListenerServerConfig>; commandId?: string } =
        await readRequestBody<{ changes: Partial<ListenerServerConfig>; commandId?: string }>(request);
      await this.enqueueCommand(async (): Promise<void> => {
        const currentConfig: SystemConfiguration = this.systemConfigService!.state;
        const nextListenerConfig: ListenerServerConfig = normalizeSystemConfiguration({
          ...currentConfig,
          listenerServer: {
            enabled: false,
            ...currentConfig.listenerServer,
            ...body.changes,
          },
        }).listenerServer!;
        await this.reloadExternal(nextListenerConfig);
        const config: SystemConfiguration =
          await this.systemConfigService!.updateListenerServer(body.changes);
        const listenerStatus: ListenerServerConfig = this.activeListenerStatus();
        this.eventHub.publish(
          'server',
          'server.listener-updated',
          jsonValue({
            enabled: listenerStatus.enabled,
            httpPort: listenerStatus.httpPort || null,
            httpsPort: listenerStatus.httpsPort || null,
            insecureHttpWarning: listenerStatus.enabled &&
              listenerStatus.httpPort !== undefined,
          }),
          body.commandId,
        );
      });
      sendJson(response, 200, {
        listenerServer: this.activeListenerStatus(),
        revision: this.eventHub.currentRevision,
      });
      return;
    }
    sendProblem(response, 404, 'System command resource not found.');
  };

  private handleRaceAdmin = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    const requiredPermission: string = request.method === 'GET' ? 'race:read' : 'race:write';
    const user: AuthenticatedUser | undefined = this.requireUser(
      request,
      response,
      requiredPermission,
    );
    if (!user) {
      return;
    }
    if (request.method === 'GET') {
      sendJson(response, 200, await this.raceAdminPersistence.load());
      return;
    }
    if (request.method === 'PUT') {
      const body: { changes: AdministrativeChanges; commandId?: string } =
        await readRequestBody<{ changes: AdministrativeChanges; commandId?: string }>(request);
      await this.enqueueCommand(async (): Promise<void> => {
        await this.raceAdminPersistence.save(body.changes);
        this.eventHub.publish(
          'race-admin',
          'race-admin.changed',
          jsonValue(body.changes),
          body.commandId,
        );
      });
      sendJson(response, 200, {
        revision: this.eventHub.currentRevision,
      });
      return;
    }
    sendProblem(response, 405, 'Only GET and PUT are supported.');
  };

  private handleUpload = async (
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
  ): Promise<void> => {
    const user: AuthenticatedUser | undefined = this.requireUser(request, response, 'race:write');
    if (!user) {
      return;
    }
    if (request.method !== 'POST') {
      sendProblem(response, 405, 'Only POST is supported for uploads.');
      return;
    }
    const name: string = url.searchParams.get('name') || '';
    const upload = await this.uploadStore.accept(request, {
      mediaType: url.searchParams.get('mediaType') || request.headers['content-type'] || 'application/octet-stream',
      name,
      relativePath: url.searchParams.get('relativePath') || name,
    });
    this.eventHub.publish('source', 'source.file-uploaded', jsonValue(upload));
    sendJson(response, 201, upload);
  };

  private enqueueCommand = async (command: () => Promise<void>): Promise<void> => {
    const result: Promise<void> = this.commandQueue.then(command);
    this.commandQueue = result.catch((): void => undefined);
    return result;
  };

  private serveSwaggerAsset = async (
    requestPath: string,
    response: ServerResponse,
  ): Promise<void> => {
    if (requestPath === '/api/swagger-ui/swagger-ui-init.js') {
      response.writeHead(200, {
        'content-type': 'application/javascript; charset=utf-8',
      }).end(getSwaggerUiInit());
      return;
    }
    const assetName: string = path.basename(requestPath);
    if (!requiredSwaggerAssets.includes(assetName)) {
      sendProblem(response, 404, 'Swagger UI asset not found.');
      return;
    }
    const assetPath: string = path.join(this.swaggerAssetDirectory, assetName);
    try {
      const asset: Buffer = await readFile(assetPath);
      response.writeHead(200, {
        'cache-control': 'public, max-age=31536000, immutable',
        'content-type': staticContentTypes[path.extname(assetName).toLowerCase()] ||
          'application/octet-stream',
      }).end(asset);
    } catch {
      sendProblem(
        response,
        404,
        `Swagger UI asset "${assetName}" was not found. Reinstall dependencies or rebuild RaceSweet.`,
      );
    }
  };

  private serveSwaggerDocumentation = async (
    response: ServerResponse,
  ): Promise<void> => {
    try {
      await Promise.all(requiredSwaggerAssets.map(
        (assetName: string): Promise<Buffer> =>
          readFile(path.join(this.swaggerAssetDirectory, assetName)),
      ));
      sendHtml(response, 200, getSwaggerUiHtml());
    } catch {
      sendHtml(
        response,
        503,
        getUnavailablePage(
          'RaceSweet API documentation is unavailable',
          'The OpenAPI document is available, but the Swagger UI files required to display it were not found.',
          'Reinstall dependencies or rebuild RaceSweet, then reload this page. The raw specification remains available at <code>/api/openapi.json</code>.',
        ),
      );
    }
  };

  private sendApplicationUnavailable = (response: ServerResponse): void => {
    sendHtml(
      response,
      503,
      getUnavailablePage(
        'RaceSweet web application is not built',
        'The server is running, but the compiled HTML or JavaScript required by the browser application was not found.',
        'Run <code>npm run build:web</code>, restart the RaceSweet server, and reload this page. API documentation remains available at <code>/api</code>.',
      ),
    );
  };

  private fileAssetPath = (
    rootPath: string,
    requestPath: string,
  ): string | undefined => {
    const requestedRelativePath: string = requestPath.replace(/^\/+/u, '');
    const rootDirectoryPrefix: string = `${path.basename(rootPath)}/`;
    const assetRelativePath: string = requestedRelativePath.startsWith(rootDirectoryPrefix)
      ? requestedRelativePath.slice(rootDirectoryPrefix.length)
      : requestedRelativePath;
    const requestedPath: string = path.resolve(rootPath, assetRelativePath);
    return requestedPath === rootPath || requestedPath.startsWith(`${rootPath}${path.sep}`)
      ? requestedPath
      : undefined;
  };

  private fileApplicationHtml = async (
    rootPath: string,
    indexPath: string,
  ): Promise<Buffer | undefined> => {
    try {
      const html: Buffer = await readFile(indexPath);
      const scriptPaths: string[] = getLocalScriptPaths(html.toString('utf8'));
      if (scriptPaths.length === 0) {
        return undefined;
      }
      const scripts: Array<Promise<Buffer>> = scriptPaths.map(
        (scriptPath: string): Promise<Buffer> => {
          const assetPath: string | undefined = this.fileAssetPath(rootPath, scriptPath);
          return assetPath
            ? readFile(assetPath)
            : Promise.reject(new Error('Invalid application script path.'));
        },
      );
      await Promise.all(scripts);
      return html;
    } catch {
      return undefined;
    }
  };

  private developmentApplicationHtml = async (
    response: Response,
    baseUrl: URL,
  ): Promise<Buffer | undefined> => {
    if (!response.ok) {
      return undefined;
    }
    const html: Buffer = Buffer.from(await response.arrayBuffer());
    const scriptPaths: string[] = getLocalScriptPaths(html.toString('utf8'));
    if (scriptPaths.length === 0) {
      return undefined;
    }
    const scriptResponses: Response[] = await Promise.all(scriptPaths.map(
      (scriptPath: string): Promise<Response> => fetch(new URL(scriptPath, baseUrl.origin)),
    ));
    return scriptResponses.every((scriptResponse: Response): boolean => scriptResponse.ok)
      ? html
      : undefined;
  };

  private serveApplication = async (
    requestPath: string,
    response: ServerResponse,
    assetSource: string | undefined,
  ): Promise<void> => {
    if (!assetSource) {
      this.sendApplicationUnavailable(response);
      return;
    }
    if (/^https?:/u.test(assetSource)) {
      const baseUrl: URL = new URL(assetSource);
      const assetUrl: URL = resolveDevelopmentAssetUrl(assetSource, requestPath);
      let upstream: Response;
      try {
        upstream = await fetch(assetUrl);
      } catch {
        this.sendApplicationUnavailable(response);
        return;
      }
      if (upstream.ok) {
        if (!isStaticAssetRequest(requestPath)) {
          const html: Buffer | undefined = await this.developmentApplicationHtml(
            upstream,
            baseUrl,
          );
          if (!html) {
            this.sendApplicationUnavailable(response);
            return;
          }
          response.writeHead(200, {
            'cache-control': 'no-cache',
            'content-type': 'text/html; charset=utf-8',
          }).end(html);
          return;
        }
        response.writeHead(200, {
          'cache-control': applicationAssetCacheControl(requestPath),
          'content-type': upstream.headers.get('content-type') || 'application/octet-stream',
        }).end(Buffer.from(await upstream.arrayBuffer()));
        return;
      }
      if (isStaticAssetRequest(requestPath)) {
        sendProblem(response, 404, `Application asset "${requestPath}" was not found.`);
        return;
      }
      let fallback: Response;
      try {
        fallback = await fetch(baseUrl);
      } catch {
        this.sendApplicationUnavailable(response);
        return;
      }
      const html: Buffer | undefined = await this.developmentApplicationHtml(fallback, baseUrl);
      if (!html) {
        this.sendApplicationUnavailable(response);
        return;
      }
      response.writeHead(200, {
        'cache-control': 'no-cache',
        'content-type': 'text/html; charset=utf-8',
      }).end(html);
      return;
    }

    const sourceUrl: URL | undefined = assetSource.startsWith('file:')
      ? new URL(assetSource)
      : undefined;
    const sourcePath: string = sourceUrl
      ? decodeURIComponent(sourceUrl.pathname.replace(/^\/([A-Za-z]:)/u, '$1'))
      : path.resolve(assetSource);
    let sourceIsDirectory: boolean;
    try {
      sourceIsDirectory = (await stat(sourcePath)).isDirectory();
    } catch {
      this.sendApplicationUnavailable(response);
      return;
    }
    const rootPath: string = path.resolve(sourceIsDirectory ? sourcePath : path.dirname(sourcePath));
    const requestedRelativePath: string = requestPath === '/'
      ? path.basename(sourcePath).endsWith('.html') ? path.basename(sourcePath) : 'index.html'
      : requestPath.replace(/^\/+/u, '');
    const requestedPath: string | undefined = this.fileAssetPath(rootPath, requestedRelativePath);
    if (!requestedPath) {
      sendProblem(response, 400, 'Invalid static asset path.');
      return;
    }
    try {
      const asset: Buffer = await readFile(requestedPath);
      if (!isStaticAssetRequest(requestPath)) {
        const html: Buffer | undefined = await this.fileApplicationHtml(
          rootPath,
          requestedPath,
        );
        if (!html) {
          this.sendApplicationUnavailable(response);
          return;
        }
      }
      response.writeHead(200, {
        'cache-control': requestedRelativePath.endsWith('.html')
          ? 'no-cache'
          : applicationAssetCacheControl(requestedRelativePath),
        'content-type': staticContentTypes[path.extname(requestedPath).toLowerCase()] ||
          'application/octet-stream',
      }).end(asset);
    } catch {
      if (isStaticAssetRequest(requestPath)) {
        sendProblem(response, 404, `Application asset "${requestPath}" was not found.`);
        return;
      }
      const fallbackPath: string = path.join(rootPath, 'index.html');
      const html: Buffer | undefined = await this.fileApplicationHtml(rootPath, fallbackPath);
      if (!html) {
        this.sendApplicationUnavailable(response);
        return;
      }
      response.writeHead(200, {
        'cache-control': 'no-cache',
        'content-type': 'text/html; charset=utf-8',
      }).end(html);
    }
  };
}

export { getSwaggerUiHtml, getSwaggerUiInit, resolveDevelopmentAssetUrl };
