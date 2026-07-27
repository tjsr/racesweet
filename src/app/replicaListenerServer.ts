import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https';
import type { Socket } from 'node:net';
import path from 'node:path';
import getAbsoluteSwaggerUiPath from 'swagger-ui-dist/absolute-path';
import type { EventCatalogMutation } from '../ledger/eventCatalogLedger.js';
import type { ListenerServerConfig } from './systemConfig.js';

export interface ReplicaListenerStore {
  appendRemoteMutations(mutations: EventCatalogMutation[]): Promise<void>;
  getMutationsAfter(cursor: string | undefined): { cursor: string; mutations: EventCatalogMutation[] };
}

type ListenerServer = HttpServer | HttpsServer;

const swaggerUiPath: string = getAbsoluteSwaggerUiPath();
export const getSwaggerUiHtml = (): string => `<!doctype html>
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
export const getSwaggerUiInit = (): string => `window.onload = function () {
  window.ui = SwaggerUIBundle({
    dom_id: '#swagger-ui',
    deepLinking: true,
    layout: 'StandaloneLayout',
    plugins: [SwaggerUIBundle.plugins.DownloadUrl],
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    url: '/api/openapi.json'
  });
};`;

const swaggerUiContentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const readBody = async (request: import('node:http').IncomingMessage): Promise<string> => new Promise((resolve, reject) => {
  let body = '';
  request.setEncoding('utf8');
  request.on('data', (chunk: string) => { body += chunk; });
  request.on('end', () => resolve(body));
  request.on('error', reject);
});

const closeServer = async (server: ListenerServer): Promise<void> => new Promise((resolve, reject) => {
  server.close((error?: Error) => error ? reject(error) : resolve());
});

export class ReplicaListenerServer {
  private httpServer: HttpServer | undefined;
  private httpsServer: HttpsServer | undefined;
  private readonly sockets = new Set<Socket>();
  private readonly store: ReplicaListenerStore;

  public constructor(store: ReplicaListenerStore) {
    this.store = store;
  }

  public async reload(config: ListenerServerConfig): Promise<void> {
    let nextHttpServer: HttpServer | undefined;
    let nextHttpsServer: HttpsServer | undefined;
    if (config.enabled && config.httpPort) {
      nextHttpServer = createHttpServer(this.handleRequest);
    }
    if (config.enabled && config.httpsPort && config.certificatePath && config.privateKeyPath) {
      nextHttpsServer = createHttpsServer({ cert: await readFile(config.certificatePath), key: await readFile(config.privateKeyPath) }, this.handleRequest);
    }
    const replacements: Array<{ port: number; server: ListenerServer }> = [
      ...(nextHttpServer && config.httpPort ? [{ port: config.httpPort, server: nextHttpServer }] : []),
      ...(nextHttpsServer && config.httpsPort ? [{ port: config.httpsPort, server: nextHttpsServer }] : []),
    ];
    await Promise.all(replacements.map(({ port, server }) => new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, () => { server.off('error', reject); resolve(); });
    })));
    const previous = [this.httpServer, this.httpsServer].filter((server): server is ListenerServer => !!server);
    this.httpServer = nextHttpServer;
    this.httpsServer = nextHttpsServer;
    await Promise.all(previous.map(closeServer));
  }

  public async close(): Promise<void> {
    await Promise.all([this.httpServer, this.httpsServer].filter((server): server is ListenerServer => !!server).map(closeServer));
    this.httpServer = undefined;
    this.httpsServer = undefined;
  }

  /**
   * @openapi
   * /api/v1/mutations:
   *   get:
   *     operationId: pullMutations
   *     summary: Pull ledger mutations after a cursor
   *     tags: [Mutations]
   *     parameters:
   *       - in: query
   *         name: cursor
   *         schema: { type: string }
   *         description: The cursor returned by the preceding pull or push response.
   *     responses:
   *       200:
   *         description: Mutations and the cursor for the next pull.
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/MutationPullResponse' }
   *       405: { description: Only GET and PUT are supported. }
   *   put:
   *     operationId: pushMutations
   *     summary: Append remote ledger mutations
   *     tags: [Mutations]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { $ref: '#/components/schemas/MutationPushRequest' }
   *     responses:
   *       200:
   *         description: Mutation identifiers acknowledged by the receiving store.
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/MutationPushResponse' }
   *       400:
   *         description: The request body is not valid JSON or cannot be applied.
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/Problem' }
   *       405: { description: Only GET and PUT are supported. }
   */
  private readonly handleRequest = async (request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse): Promise<void> => {
    const url = new URL(request.url || '/', 'http://localhost');
    if (request.method === 'GET' && (url.pathname === '/api' || url.pathname === '/api/')) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(getSwaggerUiHtml());
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/openapi.json') {
      const { getOpenApiSpecification } = await import('./openapi.js');
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(getOpenApiSpecification()));
      return;
    }
    if (request.method === 'GET' && url.pathname.startsWith('/api/swagger-ui/')) {
      if (url.pathname === '/api/swagger-ui/swagger-ui-init.js') {
        response.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' }).end(getSwaggerUiInit());
        return;
      }
      await this.serveSwaggerUiAsset(url.pathname, response);
      return;
    }
    if (url.pathname !== '/api/v1/mutations') {
      response.writeHead(404).end();
      return;
    }
    try {
      if (request.method === 'GET') {
        const result = this.store.getMutationsAfter(url.searchParams.get('cursor') || undefined);
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result));
        return;
      }
      if (request.method !== 'PUT') {
        response.writeHead(405).end();
        return;
      }
      const payload = JSON.parse(await readBody(request)) as { mutations?: EventCatalogMutation[] };
      const mutations = payload.mutations || [];
      await this.store.appendRemoteMutations(mutations);
      const result = this.store.getMutationsAfter(undefined);
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ acknowledgedMutationIds: mutations.map((mutation) => mutation.id), cursor: result.cursor }));
    } catch (error: unknown) {
      response.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  };

  private async serveSwaggerUiAsset(requestPath: string, response: import('node:http').ServerResponse): Promise<void> {
    const assetName: string = path.basename(requestPath);
    const assetPath: string = path.join(swaggerUiPath, assetName);
    try {
      const asset: Buffer = await readFile(assetPath);
      const contentType: string = swaggerUiContentTypes[path.extname(assetName).toLowerCase()] || 'application/octet-stream';
      response.writeHead(200, { 'content-type': contentType }).end(asset);
    } catch {
      response.writeHead(404).end();
    }
  }
}
