import swaggerJsdoc, { type OAS3Options } from "swagger-jsdoc";
import YAML from "yaml";

const openApiOptions: OAS3Options = {
  apis: [],
  definition: {
    components: {
      securitySchemes: {
        raceSweetSession: {
          in: "cookie",
          name: "racesweet_session",
          type: "apiKey",
        },
      },
      schemas: {
        ReplaySnapshot: {
          properties: { records: { items: { $ref: '#/components/schemas/ReplayRecord' }, type: 'array' }, state: { $ref: '#/components/schemas/ReplayState' } },
          required: ['records', 'state'], type: 'object',
        },
        ReplayConnected: {
          properties: {
            mode: { enum: ['live', 'replay'], type: 'string' }, protocolVersion: { enum: [1], type: 'integer' },
            selection: { properties: { eventId: { type: 'string' }, sessionId: { type: 'string' } }, required: ['eventId'], type: 'object' },
            serverTimestamp: { format: 'date-time', type: 'string' }, state: { $ref: '#/components/schemas/ReplayState' }, streamId: { type: 'string' },
          }, required: ['mode', 'protocolVersion', 'selection', 'serverTimestamp', 'state', 'streamId'], type: 'object',
        },
        ReplayUpdate: {
          properties: { record: { $ref: '#/components/schemas/ReplayRecord' }, state: { $ref: '#/components/schemas/ReplayState' } },
          required: ['record', 'state'], type: 'object',
        },
        ReplaySeek: {
          properties: {
            position: { minimum: 0, type: 'integer' }, snapshotBoundary: { minimum: 0, type: 'integer' },
            records: { items: { $ref: '#/components/schemas/ReplayRecord' }, type: 'array' }, state: { $ref: '#/components/schemas/ReplayState' },
            target: { oneOf: [
              { additionalProperties: false, properties: { position: { minimum: 0, type: 'integer' } }, required: ['position'], type: 'object' },
              { additionalProperties: false, properties: { timestamp: { format: 'date-time', type: 'string' } }, required: ['timestamp'], type: 'object' },
            ] },
          }, required: ['position', 'snapshotBoundary', 'records', 'state', 'target'], type: 'object',
        },
        ReplayError: {
          properties: { code: { type: 'string' }, message: { type: 'string' }, state: { $ref: '#/components/schemas/ReplayState' } },
          required: ['code', 'message'], type: 'object',
        },
        ReplayState: {
          properties: {
            emittedRecordCount: { minimum: 0, type: 'integer' }, eventId: { type: 'string' },
            mode: { enum: ['live', 'replay'], type: 'string' }, position: { minimum: 0, type: 'integer' },
            recordCount: { minimum: 0, type: 'integer' }, serverTimestamp: { format: 'date-time', type: 'string' },
            sessionId: { type: 'string' }, speed: { maximum: 1000, minimum: 0.01, type: 'number' },
            status: { enum: ['completed', 'paused', 'replaying'], type: 'string' }, streamId: { type: 'string' },
          },
          required: ['emittedRecordCount', 'eventId', 'mode', 'position', 'recordCount', 'serverTimestamp', 'speed', 'status', 'streamId'],
          type: 'object',
        },
        ReplayRecord: {
          properties: {
            id: { type: 'string' }, eventId: { type: 'string' }, sessionId: { type: 'string' },
            timestamp: { format: 'date-time', type: 'string' }, sequence: { type: 'number' }, recordType: { type: 'number' },
            participantId: { type: 'string' }, entrantId: { type: 'string' }, entryId: { type: 'string' },
            lineNumber: { type: 'number' }, loopNumber: { type: 'number' },
          },
          required: ['id', 'eventId', 'sessionId', 'timestamp', 'sequence', 'recordType'], type: 'object',
        },
        AuthenticatedUser: {
          properties: {
            id: { type: "string" },
            role: { enum: ["admin", "operator", "viewer"], type: "string" },
            username: { type: "string" },
          },
          required: ["id", "role", "username"],
          type: "object",
        },
        AuthenticationRequest: {
          properties: {
            password: { format: "password", minLength: 12, type: "string" },
            username: { type: "string" },
          },
          required: ["password", "username"],
          type: "object",
        },
        AuthenticationStatus: {
          properties: {
            setupRequired: { type: "boolean" },
            user: { $ref: "#/components/schemas/AuthenticatedUser" },
          },
          required: ["setupRequired"],
          type: "object",
        },
        DomainEventEnvelope: {
          properties: {
            aggregate: {
              enum: [
                "catalog",
                "race-admin",
                "server",
                "source",
                "system-config",
                "timing",
              ],
              type: "string",
            },
            commandId: { type: "string" },
            id: { type: "string" },
            occurredAt: { format: "date-time", type: "string" },
            payload: { type: "object" },
            revision: { minimum: 0, type: "integer" },
            type: { type: "string" },
          },
          required: [
            "aggregate",
            "id",
            "occurredAt",
            "payload",
            "revision",
            "type",
          ],
          type: "object",
        },
        EventCatalogMutation: {
          additionalProperties: true,
          description:
            "An immutable event-catalog ledger mutation. The `type` field identifies the mutation operation and the remaining fields depend on that operation.",
          properties: {
            id: {
              description: "Immutable mutation identifier.",
              type: "string",
            },
            timestamp: {
              description: "ISO 8601 mutation timestamp.",
              format: "date-time",
              type: "string",
            },
            type: {
              description: "The immutable ledger operation to apply.",
              enum: [
                "category-created",
                "category-deleted",
                "category-updated",
                "entrant-created",
                "entrant-deleted",
                "entrants-deleted",
                "entrant-updated",
                "entry-created",
                "entry-deleted",
                "entry-updated",
                "event-activated",
                "event-created",
                "event-deleted",
                "event-updated",
                "race-state-imported",
                "session-activated",
                "session-created",
                "session-deleted",
                "session-updated",
              ],
              type: "string",
            },
          },
          required: ["id", "timestamp", "type"],
          type: "object",
        },
        MutationPullResponse: {
          properties: {
            cursor: {
              description: "Cursor to send with the next pull request.",
              type: "string",
            },
            mutations: {
              items: { $ref: "#/components/schemas/EventCatalogMutation" },
              type: "array",
            },
          },
          required: ["cursor", "mutations"],
          type: "object",
        },
        MutationPushRequest: {
          properties: {
            mutations: {
              items: { $ref: "#/components/schemas/EventCatalogMutation" },
              type: "array",
            },
          },
          required: ["mutations"],
          type: "object",
        },
        MutationPushResponse: {
          properties: {
            acknowledgedMutationIds: {
              items: { type: "string" },
              type: "array",
            },
            cursor: {
              description: "Cursor for subsequent pull requests.",
              type: "string",
            },
          },
          required: ["acknowledgedMutationIds", "cursor"],
          type: "object",
        },
        UploadedApplicationFile: {
          properties: {
            id: { type: "string" },
            mediaType: { type: "string" },
            name: { type: "string" },
            relativePath: { type: "string" },
            size: { minimum: 0, type: "integer" },
          },
          required: ["id", "mediaType", "name", "relativePath", "size"],
          type: "object",
        },
        Problem: {
          properties: { error: { type: "string" } },
          required: ["error"],
          type: "object",
        },
      },
    },
    info: {
      description:
        "Authenticated RaceSweet application, command, upload, and live-event API.",
      title: "RaceSweet API",
      version: "1.0.0",
    },
    openapi: "3.0.3",
    paths: {
      "/api/v1/auth/status": {
        get: {
          operationId: "getAuthenticationStatus",
          responses: {
            200: { description: "Setup and current-session status." },
          },
          summary: "Get setup and authentication status",
          tags: ["Authentication"],
        },
      },
      "/api/v1/auth/setup": {
        post: {
          operationId: "createInitialAdministrator",
          requestBody: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthenticationRequest" },
              },
            },
            required: true,
          },
          responses: {
            200: { description: "The initial administrator session." },
            400: {
              description:
                "Setup is closed or the request is not from loopback.",
            },
          },
          summary: "Create the first administrator from loopback",
          tags: ["Authentication"],
        },
      },
      "/api/v1/auth/login": {
        post: {
          operationId: "login",
          requestBody: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthenticationRequest" },
              },
            },
            required: true,
          },
          responses: {
            200: { description: "Authenticated user and session cookie." },
            400: { description: "Invalid credentials." },
          },
          summary: "Sign in",
          tags: ["Authentication"],
        },
      },
      "/api/v1/auth/logout": {
        post: {
          operationId: "logout",
          responses: { 200: { description: "Session removed." } },
          security: [{ raceSweetSession: [] }],
          summary: "Sign out",
          tags: ["Authentication"],
        },
      },
      "/api/v1/auth/users": {
        get: {
          operationId: "listUsers",
          responses: {
            200: { description: "Users." },
            403: { description: "Administrator role required." },
          },
          security: [{ raceSweetSession: [] }],
          summary: "List users",
          tags: ["Authentication"],
        },
        post: {
          operationId: "createUser",
          responses: {
            201: { description: "User created." },
            403: { description: "Administrator role required." },
          },
          security: [{ raceSweetSession: [] }],
          summary: "Create a user",
          tags: ["Authentication"],
        },
      },
      "/api/v1/bootstrap": {
        get: {
          operationId: "getApplicationBootstrap",
          responses: {
            200: {
              description: "Current safe application projection and revision.",
            },
            401: { description: "Authentication required." },
          },
          security: [{ raceSweetSession: [] }],
          summary: "Load the application state",
          tags: ["Application"],
        },
      },
      "/api/v1/timing/crossing": {
        post: {
          operationId: "submitTimingCrossings",
          responses: {
            200: { description: "Accepted timing crossings." },
            400: { description: "Invalid request." },
          },
          security: [{ raceSweetSession: [] }],
          summary: "Submit timing crossing records",
          tags: ["Timing"],
        },
      },
      "/api/v1/timing/manual-crossings": {
        post: {
          description: "Record, correct, reverse, or reconcile one manual crossing through the Event Catalog ledger. The action defaults to record. Repeating the same mutationId and payload returns already-accepted. Validation failures return status rejected and an operator-safe reason. All actions require race:write.",
          operationId: "submitManualCrossing",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["crossing", "crossingId", "mutationId"],
                  properties: {
                    action: { enum: ['record', 'correct', 'reverse', 'reconcile'], type: 'string' },
                    crossing: { type: "object" },
                    crossingId: { type: "string" },
                    mutationId: { type: "string" },
                    reason: { type: 'string', description: 'Optional reversal reason.' },
                  },
                },
              },
            },
            required: true,
          },
          responses: {
            200: { description: "Accepted or previously accepted manual crossing." },
            400: { description: "Invalid crossing or catalog context." },
            401: { description: "Authentication required." },
            403: { description: "Race write permission required." },
            409: { description: "Mutation ID already identifies another crossing." },
          },
          security: [{ raceSweetSession: [] }],
          summary: "Submit an idempotent manual crossing",
          tags: ["Timing"],
        },
      },
      "/api/v1/displays/templates": {
        post: {
          operationId: "createDisplayTemplate",
          responses: { 200: { description: "Created catalog template." }, 401: { description: "Authentication required." }, 403: { description: "Race write permission required." } },
          security: [{ raceSweetSession: [] }],
          summary: "Create a reusable display template",
          tags: ["Displays"],
        },
      },
      "/api/v1/displays/templates/{templateId}/draft": {
        put: {
          operationId: "saveDisplayDraft",
          parameters: [{ in: "path", name: "templateId", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Saved private draft revision." }, 400: { description: "Invalid layout or name." } },
          security: [{ raceSweetSession: [] }],
          summary: "Save a display draft",
          tags: ["Displays"],
        },
      },
      "/api/v1/displays/templates/{templateId}/{action}": {
        post: {
          operationId: "changeDisplayPublication",
          parameters: [
            { in: "path", name: "templateId", required: true, schema: { type: "string" } },
            { in: "path", name: "action", required: true, schema: { enum: ["publish", "unpublish", "archive"], type: "string" } },
          ],
          responses: { 200: { description: "Published, unpublished, or archived template." } },
          security: [{ raceSweetSession: [] }],
          summary: "Manage display publication",
          tags: ["Displays"],
        },
      },
      "/api/v1/displays/shares": {
        post: {
          operationId: "createDisplayShare",
          responses: { 200: { description: "Created a bound link and returned its token once." } },
          security: [{ raceSweetSession: [] }],
          summary: "Create a display share link",
          tags: ["Displays"],
        },
      },
      "/api/v1/displays/shares/{linkId}/{action}": {
        post: {
          operationId: "changeDisplayShare",
          parameters: [
            { in: "path", name: "linkId", required: true, schema: { type: "string" } },
            { in: "path", name: "action", required: true, schema: { enum: ["rotate", "revoke"], type: "string" } },
          ],
          responses: { 200: { description: "Rotated or revoked the link." } },
          security: [{ raceSweetSession: [] }],
          summary: "Manage a display share link",
          tags: ["Displays"],
        },
      },
      "/api/v1/displays/view/{token}/snapshot": {
        get: {
          operationId: "getPublicDisplaySnapshot",
          parameters: [{ in: "path", name: "token", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Token-scoped published layout and calculated display data." }, 404: { description: "Display unavailable." } },
          summary: "Read a public display snapshot",
          tags: ["Displays"],
        },
      },
      "/api/v1/displays/view/{token}/events": {
        get: {
          operationId: "streamPublicDisplay",
          parameters: [{ in: "path", name: "token", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Token-scoped snapshot and unavailable SSE events." }, 404: { description: "Display unavailable." } },
          summary: "Stream a public display",
          tags: ["Displays"],
        },
      },
      "/api/v1/events": {
        get: {
          description:
            "Supports Last-Event-ID replay and emits resync-required when retained history cannot satisfy the cursor.",
          operationId: "streamDomainEvents",
          responses: {
            200: {
              content: {
                "text/event-stream": {
                  schema: { $ref: "#/components/schemas/DomainEventEnvelope" },
                },
              },
              description: "Ordered domain event stream.",
            },
          },
          security: [{ raceSweetSession: [] }],
          summary: "Stream live domain events",
          tags: ["Application"],
        },
      },
      "/api/v1/reports/replay": {
        get: {
          description:
            "Version 1 SSE protocol: replay-connected, replay-snapshot, replay-state, then race-update. Seek emits replay-seek and replay-state; reset emits replay-reset and replay-state. replay-complete closes a completed replay. replay-error contains a safe code/message. Every reconnect replaces client records from the authoritative snapshot. Live snapshots include currently accepted records. Requires race:read.",
          operationId: "streamEventReplay",
          parameters: [
            {
              description: "Event to stream.",
              in: "query",
              name: "eventId",
              required: true,
              schema: { type: "string" },
            },
            {
              description: "Optional session within the selected event.",
              in: "query",
              name: "sessionId",
              schema: { type: "string" },
            },
            {
              description:
                "Replay recorded data or stream newly accepted live crossings.",
              in: "query",
              name: "mode",
              schema: {
                default: "replay",
                enum: ["live", "replay"],
                type: "string",
              },
            },
            {
              description: "Relative playback speed, from 0.01 to 1000.",
              in: "query",
              name: "speed",
              schema: {
                default: 1,
                maximum: 1000,
                minimum: 0.01,
                type: "number",
              },
            },
            {
              description: "Stable replay identifier. Reconnecting with this identifier receives a snapshot and the current replay state.",
              in: "query",
              name: "streamId",
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              content: { "text/event-stream": {
                example: 'event: replay-connected\ndata: {"protocolVersion":1,"streamId":"marshal-view","mode":"replay","selection":{"eventId":"event-1"},"serverTimestamp":"2026-01-01T00:00:00.000Z","state":{"streamId":"marshal-view","eventId":"event-1","mode":"replay","status":"replaying","speed":1,"recordCount":10,"emittedRecordCount":0,"position":0,"serverTimestamp":"2026-01-01T00:00:00.000Z"}}\n\n',
                schema: { type: "string" },
              } },
              description: "Versioned replay lifecycle and normalized race-update events, in protocol order.",
            },
            400: { description: "Invalid replay parameters." },
            401: { description: "Authentication required." },
            404: { description: "Selected event or session was not found." },
            409: { description: "Stream ID is bound to another event, session, or mode." },
          },
          security: [{ raceSweetSession: [] }],
          summary: "Stream live or replayed event crossings",
          tags: ["Reports"],
        },
      },
      "/api/v1/reports/replay/control": {
        post: {
          description: "Any race:write user may control a known replay. Seek accepts exactly one zero-based position (0 through recordCount) or ISO timestamp with an offset. Other commands reject seek fields. A speed change preserves elapsed playback time.",
          operationId: "controlEventReplay",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  properties: {
                    command: { enum: ["pause", "reset", "resume", "seek", "set-speed", "start"], type: "string" },
                    position: { minimum: 0, type: "integer" },
                    speed: { maximum: 1000, minimum: 0.01, type: "number" },
                    streamId: { type: "string" },
                    timestamp: { format: "date-time", type: "string" },
                  },
                  required: ["command", "streamId"],
                  type: "object",
                },
              },
            },
            required: true,
          },
          responses: {
            200: { content: { "application/json": { schema: { properties: { state: { $ref: '#/components/schemas/ReplayState' } }, required: ['state'], type: 'object' } } }, description: "Current replay state after the command." },
            400: { description: "Invalid replay control request." },
            401: { description: "Authentication required." },
            404: { description: "Replay stream was not found." },
          },
          security: [{ raceSweetSession: [] }],
          summary: "Control a replay stream",
          tags: ["Reports"],
        },
      },
      "/api/v1/mutations": {
        get: {
          operationId: "pullMutations",
          parameters: [
            {
              description:
                "The cursor returned by the preceding pull or push response.",
              in: "query",
              name: "cursor",
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MutationPullResponse" },
                },
              },
              description: "Mutations and the cursor for the next pull.",
            },
            405: { description: "Only GET and PUT are supported." },
          },
          summary: "Pull ledger mutations after a cursor",
          tags: ["Mutations"],
        },
        put: {
          operationId: "pushMutations",
          requestBody: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MutationPushRequest" },
              },
            },
            required: true,
          },
          responses: {
            200: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MutationPushResponse" },
                },
              },
              description:
                "Mutation identifiers acknowledged by the receiving store.",
            },
            400: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Problem" },
                },
              },
              description:
                "The request body is not valid JSON or cannot be applied.",
            },
            405: { description: "Only GET and PUT are supported." },
          },
          summary: "Append remote ledger mutations",
          tags: ["Mutations"],
        },
      },
      "/api/v1/uploads": {
        post: {
          operationId: "uploadApplicationFile",
          parameters: [
            {
              in: "query",
              name: "name",
              required: true,
              schema: { type: "string" },
            },
            { in: "query", name: "relativePath", schema: { type: "string" } },
            { in: "query", name: "mediaType", schema: { type: "string" } },
          ],
          requestBody: {
            content: {
              "application/octet-stream": {
                schema: { format: "binary", type: "string" },
              },
            },
            required: true,
          },
          responses: { 201: { description: "Server-managed upload." } },
          security: [{ raceSweetSession: [] }],
          summary: "Upload a file for an import",
          tags: ["Files"],
        },
      },
      "/api/v1/uploads/{uploadId}": {
        get: {
          operationId: "downloadApplicationFile",
          parameters: [
            {
              in: "path",
              name: "uploadId",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: { description: "Uploaded or generated file." },
            404: { description: "File not found." },
          },
          security: [{ raceSweetSession: [] }],
          summary: "Download a managed file",
          tags: ["Files"],
        },
      },
      "/api/v1/race-admin": {
        get: {
          operationId: "getRaceAdminChanges",
          responses: {
            200: { description: "Persisted administrative changes." },
          },
          security: [{ raceSweetSession: [] }],
          summary: "Read race administration changes",
          tags: ["Race administration"],
        },
        put: {
          operationId: "replaceRaceAdminChanges",
          responses: {
            200: { description: "Changes persisted and broadcast." },
          },
          security: [{ raceSweetSession: [] }],
          summary: "Persist race administration changes",
          tags: ["Race administration"],
        },
      },
      "/api/v1/system/configuration": {
        get: {
          operationId: "getSharedSystemConfiguration",
          responses: {
            200: { description: "Shared configuration with secrets redacted." },
          },
          security: [{ raceSweetSession: [] }],
          summary: "Read shared source configuration",
          tags: ["System"],
        },
        put: {
          operationId: "replaceSharedSystemConfiguration",
          responses: {
            200: { description: "Configuration persisted and broadcast." },
          },
          security: [{ raceSweetSession: [] }],
          summary: "Persist shared source configuration",
          tags: ["System"],
        },
      },
      "/api/v1/system/listener": {
        get: {
          responses: {
            200: { description: "Active external listener status." },
            403: { description: "Administrator role required." },
          },
          security: [{ cookieAuth: [] }],
          summary: "Read active external HTTP and HTTPS listener status",
        },
        put: {
          operationId: "updateListenerServer",
          responses: {
            200: { description: "External listeners safely replaced." },
            403: { description: "Administrator role required." },
          },
          security: [{ raceSweetSession: [] }],
          summary: "Configure external HTTP and HTTPS listeners",
          tags: ["System"],
        },
      },
      "/api/v1/catalog/events": {
        post: {
          operationId: "createEvent",
          responses: {
            200: { description: "Event created, persisted, and broadcast." },
          },
          security: [{ raceSweetSession: [] }],
          summary: "Create an event",
          tags: ["Catalog"],
        },
      },
      "/api/v1/catalog/events/{eventId}": {
        delete: {
          operationId: "deleteEvent",
          parameters: [
            {
              in: "path",
              name: "eventId",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "Event deleted." } },
          security: [{ raceSweetSession: [] }],
          summary: "Delete an event",
          tags: ["Catalog"],
        },
        patch: {
          operationId: "updateEvent",
          parameters: [
            {
              in: "path",
              name: "eventId",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "Event updated." } },
          security: [{ raceSweetSession: [] }],
          summary: "Update an event",
          tags: ["Catalog"],
        },
      },
      "/api/v1/catalog/events/{eventId}/activate": {
        post: {
          operationId: "activateEvent",
          parameters: [
            {
              in: "path",
              name: "eventId",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "Event activated." } },
          security: [{ raceSweetSession: [] }],
          summary: "Activate an event",
          tags: ["Catalog"],
        },
      },
    },
    tags: [
      { name: "Application" },
      { name: "Authentication" },
      { name: "Catalog" },
      { name: "Files" },
      {
        description: "Immutable event-catalog ledger replication.",
        name: "Mutations",
      },
      { name: "Race administration" },
      { name: "System" },
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
