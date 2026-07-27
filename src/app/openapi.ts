import swaggerJsdoc, { type OAS3Options } from 'swagger-jsdoc';
import YAML from 'yaml';

const openApiOptions: OAS3Options = {
  apis: [],
  definition: {
    components: {
      schemas: {
        EventCatalogMutation: {
          additionalProperties: true,
          description: 'An immutable event-catalog ledger mutation. The `type` field identifies the mutation operation and the remaining fields depend on that operation.',
          properties: {
            id: { description: 'Immutable mutation identifier.', type: 'string' },
            timestamp: { description: 'ISO 8601 mutation timestamp.', format: 'date-time', type: 'string' },
            type: {
              description: 'The immutable ledger operation to apply.',
              enum: [
                'category-created', 'category-deleted', 'category-updated', 'entrant-created', 'entrant-deleted', 'entrant-updated',
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
        Problem: {
          properties: { error: { type: 'string' } },
          required: ['error'],
          type: 'object',
        },
      },
    },
    info: {
      description: 'Replication API used by RaceSweet stores to exchange immutable event-catalog ledger mutations.',
      title: 'RaceSweet Replication API',
      version: '1.0.0',
    },
    openapi: '3.0.3',
    paths: {
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
    },
    tags: [{ description: 'Immutable event-catalog ledger replication.', name: 'Mutations' }],
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
