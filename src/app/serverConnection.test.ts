// @vitest-environment jsdom

import type { AdministrativeChanges } from '../persistence/raceAdminPersistence.js';
import type { SystemConfiguration } from './systemConfig.js';
import { createServerConnectedRendererApi } from './serverConnection.js';

describe('server-connected renderer persistence', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns API persistence resources as JSON file content strings', async () => {
    const mutationsResponse: { cursor: string; mutations: object[] } = {
      cursor: '1',
      mutations: [{ id: 'mutation-1', type: 'event-created' }],
    };
    const configurationResponse: Partial<SystemConfiguration> = {
      dataSources: [],
    };
    const raceAdminResponse: Partial<AdministrativeChanges> = {
      excludedCrossings: {},
      schemaVersion: 1,
    };
    const fetchImplementation: typeof fetch = vi.fn(
      async (input: RequestInfo | URL): Promise<Response> => {
        const requestPath: string = input.toString();
        const responseBody: object = requestPath.includes('/mutations')
          ? mutationsResponse
          : requestPath.includes('/system/configuration')
            ? configurationResponse
            : raceAdminResponse;
        return new Response(JSON.stringify(responseBody), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        });
      },
    );
    vi.stubGlobal('fetch', fetchImplementation);
    const api: Window['api'] = createServerConnectedRendererApi();

    expect(api.persistenceMode).toBe('server');
    const [catalogContent, configurationContent, raceAdminContent]: string[] =
      await Promise.all([
        api.requestFileContent<string>('event-catalog.json', 'utf8'),
        api.requestFileContent<string>('system-config.json', 'utf8'),
        api.requestFileContent<string>('admin-overrides.json', 'utf8'),
      ]);

    expect(typeof catalogContent).toBe('string');
    expect(JSON.parse(catalogContent)).toEqual({
      mutations: mutationsResponse.mutations,
      schemaVersion: 1,
    });
    expect(JSON.parse(configurationContent)).toEqual(configurationResponse);
    expect(JSON.parse(raceAdminContent)).toEqual(raceAdminResponse);
  });

  it('uploads complete catalog mutations and rejects split manifests', async () => {
    const fetchImplementation: typeof fetch = vi.fn(
      async (): Promise<Response> => new Response('{}', {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchImplementation);
    const api: Window['api'] = createServerConnectedRendererApi();
    const mutation: object = {
      id: 'mutation-electron-event',
      type: 'event-created',
    };

    await api.writeFileContent(
      'event-catalog.json',
      JSON.stringify({ mutations: [mutation], schemaVersion: 1 }),
    );

    expect(fetchImplementation).toHaveBeenCalledWith(
      '/api/v1/mutations',
      expect.objectContaining({
        body: JSON.stringify({ mutations: [mutation] }),
        method: 'PUT',
      }),
    );
    await expect(api.writeFileContent(
      'event-catalog.json',
      JSON.stringify({
        eventFiles: [],
        globalMutations: [],
        mutationOrder: [],
        schemaVersion: 2,
      }),
    )).rejects.toThrow(
      'Server-backed event catalog persistence requires a complete mutation ledger.',
    );
  });

  it('uploads every race-admin action through the shared API resource', async () => {
    const fetchImplementation: typeof fetch = vi.fn(
      async (): Promise<Response> => new Response('{}', {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchImplementation);
    const api: Window['api'] = createServerConnectedRendererApi();
    const changes = {
      addedRecords: [],
      entrantCategories: { entrant: 'category' },
      excludedCrossings: { crossing: true },
      flagCategoryChanges: [
        { action: 'assign' as const, categoryId: 'category', flagId: 'flag' },
        { action: 'remove' as const, categoryId: 'category', flagId: 'flag' },
      ],
      flagDeleted: { flag: false },
      schemaVersion: 1 as const,
      updatedRecords: [],
    } satisfies AdministrativeChanges;

    await api.writeFileContent(
      'admin-overrides.json',
      JSON.stringify(changes),
    );

    expect(fetchImplementation).toHaveBeenCalledWith(
      '/api/v1/race-admin',
      expect.objectContaining({
        body: JSON.stringify({ changes }),
        method: 'PUT',
      }),
    );
  });
});
