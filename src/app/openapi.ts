import swaggerJsdoc, { type OAS3Options } from 'swagger-jsdoc';
import YAML from 'yaml';

const openApiOptions: OAS3Options = {
  apis: [],
  definition: {
    components: {
      securitySchemes: {
        raceSweetSession: {
          in: 'cookie',
          name: 'racesweet_session',
          type: 'apiKey',
        },
      },
      schemas: {
        AuthenticatedUser: {
          properties: {
            id: { type: 'string' },
            role: { enum: ['admin', 'operator', 'viewer'], type: 'string' },
            username: { type: 'string' },
          },
          required: ['id', 'role', 'username'],
          type: 'object',
        },
        AuthenticationRequest: {
          properties: {
            password: { format: 'password', minLength: 12, type: 'string' },
            username: { type: 'string' },
          },
          required: ['password', 'username'],
          type: 'object',
        },
        AuthenticationStatus: {
          properties: {
            setupRequired: { type: 'boolean' },
            user: { $ref: '#/components/schemas/AuthenticatedUser' },
          },
          required: ['setupRequired'],
          type: 'object',
        },
        DomainEventEnvelope: {
          properties: {
            aggregate: { enum: ['catalog', 'race-admin', 'server', 'source', 'system-config', 'timing'], type: 'string' },
            commandId: { type: 'string' },
            id: { type: 'string' },
            occurredAt: { format: 'date-time', type: 'string' },
            payload: { type: 'object' },
            revision: { minimum: 0, type: 'integer' },
            type: { type: 'string' },
          },
          required: ['aggregate', 'id', 'occurredAt', 'payload', 'revision', 'type'],
          type: 'object',
        },
        EventCatalogMutation: {
          additionalProperties: true,
          description: 'An immutable event-catalog ledger mutation. The `type` field identifies the mutation operation and the remaining fields depend on that operation.',
          properties: {
            id: { description: 'Immutable mutation identifier.', type: 'string' },
            timestamp: { description: 'ISO 8601 mutation timestamp.', format: 'date-time', type: 'string' },
            type: {
              description: 'The immutable ledger operation to apply.',
              enum: [
                'category-created', 'category-deleted', 'category-updated', 'entrant-created', 'entrant-deleted', 'entrants-deleted', 'entrant-updated',
                'entry-created', 'entry-deleted', 'entry-updated', 'event-activated', 'event-created', 'event-deleted',
                'event-updated', 'race-state-imported', 'session-activated', 'session-created', 'session-deleted', 'session-updated',
              ],
              type: 'string',
            },
          },
          required: ['id', 'timestamp', 'type'],
          type: 'object',
        },
        MutationPullResponse: {
          properties: {
            cursor: { description: 'Cursor to send with the next pull request.', type: 'string' },
            mutations: { items: { $ref: '#/components/schemas/EventCatalogMutation' }, type: 'array' },
          },
          required: ['cursor', 'mutations'],
          type: 'object',
        },
        MutationPushRequest: {
          properties: {
            mutations: { items: { $ref: '#/components/schemas/EventCatalogMutation' }, type: 'array' },
          },
          required: ['mutations'],
          type: 'object',
        },
        MutationPushResponse: {
          properties: {
            acknowledgedMutationIds: { items: { type: 'string' }, type: 'array' },
            cursor: { description: 'Cursor for subsequent pull requests.', type: 'string' },
          },
          required: ['acknowledgedMutationIds', 'cursor'],
          type: 'object',
        },
        UploadedApplicationFile: {
          properties: {
            id: { type: 'string' },
            mediaType: { type: 'string' },
            name: { type: 'string' },
            relativePath: { type: 'string' },
            size: { minimum: 0, type: 'integer' },
          },
          required: ['id', 'mediaType', 'name', 'relativePath', 'size'],
          type: 'object',
        },
        Problem: {
          properties: { error: { type: 'string' } },
          required: ['error'],
          type: 'object',
        },
      },
    },
    info: {
      description: 'Authenticated RaceSweet application, command, upload, and live-event API.',
      title: 'RaceSweet API',
      version: '1.0.0',
    },
    openapi: '3.0.3',
    paths: {
      '/api/v1/auth/status': {
        get: {
          operationId: 'getAuthenticationStatus',
          responses: { 200: { description: 'Setup and current-session status.' } },
          summary: 'Get setup and authentication status',
          tags: ['Authentication'],
        },
      },
      '/api/v1/auth/setup': {
        post: {
          operationId: 'createInitialAdministrator',
          requestBody: {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthenticationRequest' } } },
            required: true,
          },
          responses: { 200: { description: 'The initial administrator session.' }, 400: { description: 'Setup is closed or the request is not from loopback.' } },
          summary: 'Create the first administrator from loopback',
          tags: ['Authentication'],
        },
      },
      '/api/v1/auth/login': {
        post: {
          operationId: 'login',
          requestBody: {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthenticationRequest' } } },
            required: true,
          },
          responses: { 200: { description: 'Authenticated user and session cookie.' }, 400: { description: 'Invalid credentials.' } },
          summary: 'Sign in',
          tags: ['Authentication'],
        },
      },
      '/api/v1/auth/logout': {
        post: {
          operationId: 'logout',
          responses: { 200: { description: 'Session removed.' } },
          security: [{ raceSweetSession: [] }],
          summary: 'Sign out',
          tags: ['Authentication'],
        },
      },
      '/api/v1/auth/users': {
        get: {
          operationId: 'listUsers',
          responses: { 200: { description: 'Users.' }, 403: { description: 'Administrator role required.' } },
          security: [{ raceSweetSession: [] }],
          summary: 'List users',
          tags: ['Authentication'],
        },
        post: {
          operationId: 'createUser',
          responses: { 201: { description: 'User created.' }, 403: { description: 'Administrator role required.' } },
          security: [{ raceSweetSession: [] }],
          summary: 'Create a user',
          tags: ['Authentication'],
        },
      },
      '/api/v1/bootstrap': {
        get: {
          operationId: 'getApplicationBootstrap',
          responses: { 200: { description: 'Current safe application projection and revision.' }, 401: { description: 'Authentication required.' } },
          security: [{ raceSweetSession: [] }],
          summary: 'Load the application state',
          tags: ['Application'],
        },
      },
      '/api/v1/events': {
        get: {
          description: 'Supports Last-Event-ID replay and emits resync-required when retained history cannot satisfy the cursor.',
          operationId: 'streamDomainEvents',
          responses: {
            200: {
              content: { 'text/event-stream': { schema: { $ref: '#/components/schemas/DomainEventEnvelope' } } },
              description: 'Ordered domain event stream.',
            },
          },
          security: [{ raceSweetSession: [] }],
          summary: 'Stream live domain events',
          tags: ['Application'],
        },
      },
      '/api/v1/mutations': {
        get: {
          operationId: 'pullMutations',
          parameters: [{
            description: 'The cursor returned by the preceding pull or push response.',
            in: 'query',
            name: 'cursor',
            schema: { type: 'string' },
          }],
          responses: {
            200: {
              content: { 'application/json': { schema: { $ref: '#/components/schemas/MutationPullResponse' } } },
              description: 'Mutations and the cursor for the next pull.',
            },
            405: { description: 'Only GET and PUT are supported.' },
          },
          summary: 'Pull ledger mutations after a cursor',
          tags: ['Mutations'],
        },
        put: {
          operationId: 'pushMutations',
          requestBody: {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MutationPushRequest' } } },
            required: true,
          },
          responses: {
            200: {
              content: { 'application/json': { schema: { $ref: '#/components/schemas/MutationPushResponse' } } },
              description: 'Mutation identifiers acknowledged by the receiving store.',
            },
            400: {
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Problem' } } },
              description: 'The request body is not valid JSON or cannot be applied.',
            },
            405: { description: 'Only GET and PUT are supported.' },
          },
          summary: 'Append remote ledger mutations',
          tags: ['Mutations'],
        },
      },
      '/api/v1/uploads': {
        post: {
          operationId: 'uploadApplicationFile',
          parameters: [
            { in: 'query', name: 'name', required: true, schema: { type: 'string' } },
            { in: 'query', name: 'relativePath', schema: { type: 'string' } },
            { in: 'query', name: 'mediaType', schema: { type: 'string' } },
          ],
          requestBody: {
            content: { 'application/octet-stream': { schema: { format: 'binary', type: 'string' } } },
            required: true,
          },
          responses: { 201: { description: 'Server-managed upload.' } },
          security: [{ raceSweetSession: [] }],
          summary: 'Upload a file for an import',
          tags: ['Files'],
        },
      },
      '/api/v1/uploads/{uploadId}': {
        get: {
          operationId: 'downloadApplicationFile',
          parameters: [{ in: 'path', name: 'uploadId', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Uploaded or generated file.' }, 404: { description: 'File not found.' } },
          security: [{ raceSweetSession: [] }],
          summary: 'Download a managed file',
          tags: ['Files'],
        },
      },
      '/api/v1/race-admin': {
        get: {
          operationId: 'getRaceAdminChanges',
          responses: { 200: { description: 'Persisted administrative changes.' } },
          security: [{ raceSweetSession: [] }],
          summary: 'Read race administration changes',
          tags: ['Race administration'],
        },
        put: {
          operationId: 'replaceRaceAdminChanges',
          responses: { 200: { description: 'Changes persisted and broadcast.' } },
          security: [{ raceSweetSession: [] }],
          summary: 'Persist race administration changes',
          tags: ['Race administration'],
        },
      },
      '/api/v1/system/configuration': {
        get: {
          operationId: 'getSharedSystemConfiguration',
          responses: { 200: { description: 'Shared configuration with secrets redacted.' } },
          security: [{ raceSweetSession: [] }],
          summary: 'Read shared source configuration',
          tags: ['System'],
        },
        put: {
          operationId: 'replaceSharedSystemConfiguration',
          responses: { 200: { description: 'Configuration persisted and broadcast.' } },
          security: [{ raceSweetSession: [] }],
          summary: 'Persist shared source configuration',
          tags: ['System'],
        },
      },
      '/api/v1/system/listener': {
        get: {
          responses: { 200: { description: 'Active external listener status.' }, 403: { description: 'Administrator role required.' } },
          security: [{ cookieAuth: [] }],
          summary: 'Read active external HTTP and HTTPS listener status',
        },
        put: {
          operationId: 'updateListenerServer',
          responses: { 200: { description: 'External listeners safely replaced.' }, 403: { description: 'Administrator role required.' } },
          security: [{ raceSweetSession: [] }],
          summary: 'Configure external HTTP and HTTPS listeners',
          tags: ['System'],
        },
      },
      '/api/v1/catalog/events': {
        post: {
          operationId: 'createEvent',
          responses: { 200: { description: 'Event created, persisted, and broadcast.' } },
          security: [{ raceSweetSession: [] }],
          summary: 'Create an event',
          tags: ['Catalog'],
        },
      },
      '/api/v1/catalog/events/{eventId}': {
        delete: {
          operationId: 'deleteEvent',
          parameters: [{ in: 'path', name: 'eventId', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Event deleted.' } },
          security: [{ raceSweetSession: [] }],
          summary: 'Delete an event',
          tags: ['Catalog'],
        },
        patch: {
          operationId: 'updateEvent',
          parameters: [{ in: 'path', name: 'eventId', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Event updated.' } },
          security: [{ raceSweetSession: [] }],
          summary: 'Update an event',
          tags: ['Catalog'],
        },
      },
      '/api/v1/catalog/events/{eventId}/activate': {
        post: {
          operationId: 'activateEvent',
          parameters: [{ in: 'path', name: 'eventId', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Event activated.' } },
          security: [{ raceSweetSession: [] }],
          summary: 'Activate an event',
          tags: ['Catalog'],
        },
      },
    },
    tags: [
      { name: 'Application' },
      { name: 'Authentication' },
      { name: 'Catalog' },
      { name: 'Files' },
      { description: 'Immutable event-catalog ledger replication.', name: 'Mutations' },
      { name: 'Race administration' },
      { name: 'System' },
    ],
  },
};

export interface OpenApiSpecification {
  components: { schemas: Record<string, object> };
  info: { title: string; version: string };
  openapi: string;
  paths: Record<string, Record<string, object>>;
}

const prepareSwaggerJsdocYamlCompatibility = (): void => {
  // swagger-jsdoc 6.x still accesses the YAML 1.x defaultOptions API although its dependency resolves to YAML 2.x.
  Object.assign(YAML, { defaultOptions: {} });
};

export const getOpenApiSpecification = (): OpenApiSpecification => {
  prepareSwaggerJsdocYamlCompatibility();
  return swaggerJsdoc(openApiOptions) as OpenApiSpecification;
};
