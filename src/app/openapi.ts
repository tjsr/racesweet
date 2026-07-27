import path from 'node:path';
import swaggerJsdoc, { type OAS3Options } from 'swagger-jsdoc';

const apiDefinitionPath: string = path.resolve(process.cwd(), 'src/app/replicaListenerServer.ts');

const openApiOptions: OAS3Options = {
  apis: [apiDefinitionPath],
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
    tags: [{ description: 'Immutable event-catalog ledger replication.', name: 'Mutations' }],
  },
};

export interface OpenApiSpecification {
  components: { schemas: Record<string, object> };
  info: { title: string; version: string };
  openapi: string;
  paths: Record<string, Record<string, object>>;
}

export const getOpenApiSpecification = (): OpenApiSpecification => swaggerJsdoc(openApiOptions) as OpenApiSpecification;
