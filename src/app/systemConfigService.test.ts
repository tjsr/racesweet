import * as systemConfig from './systemConfig.js';

import type { SystemConfigPersistence } from './systemConfigPersistence.js';
import { SystemConfigService } from './systemConfigService.js';

const createPersistence = (initial = systemConfig.createDefaultSystemConfiguration()): SystemConfigPersistence => {
  let config = initial;

  return {
    load: vi.fn(async () => config),
    save: vi.fn(async (nextConfig) => {
      config = nextConfig;
    }),
  };
};

describe('SystemConfigService', () => {
  it('creates and updates apical API data source config and persists assignments', async () => {
    const persistence = createPersistence();
    const service = await SystemConfigService.create(persistence);

    await service.createSource('api-apical-data-file');
    const source = service.state.dataSources[0];
    expect(source).toBeDefined();
    expect(source.type).toBe('api-apical-data-file');

    await service.updateSource(source.id, {
      apiConfig: {
        ...source.apiConfig!,
        apicalEventId: 1001,
        httpTimeoutSeconds: 12,
        live: true,
        pollIntervalSeconds: 45,
      },
      listedEvents: [{ id: 1001, name: 'Round 1' }],
      name: 'Apical Live Feed',
    });

    await service.assignSourcesToEvent('event-1', [source.id]);
    await service.assignSourcesToSession('session-1', {
      mode: 'specific',
      sourceIds: [source.id],
    });

    expect(service.state.eventSourceAssignments['event-1']).toEqual([source.id]);
    expect(service.state.sessionSourceAssignments['session-1']).toEqual({ mode: 'specific', sourceIds: [source.id] });
    expect(persistence.save).toHaveBeenCalled();
  });

  it('uses default event assignment for session when mode is default', () => {
    const config = {
      ...systemConfig.createDefaultSystemConfiguration(),
      eventSourceAssignments: {
        'event-1': ['source-a', 'source-b'],
      },
      sessionSourceAssignments: {
        'session-1': {
          mode: 'default' as const,
          sourceIds: ['source-c'],
        },
      },
    };

    expect(systemConfig.getSessionAssignedSourceIds(config, 'event-1', 'session-1')).toEqual(['source-a', 'source-b']);
    expect(systemConfig.getSessionAssignedSourceIds(config, 'event-1', 'session-2')).toEqual(['source-a', 'source-b']);
  });

  it('deletes a source and removes it from event and session assignments', async () => {
    const persistence = createPersistence();
    const service = await SystemConfigService.create(persistence);

    await service.createSource('api-apical-data-file');
    const sourceId = service.state.dataSources[0]!.id;

    await service.updateSource(sourceId, { name: 'Transient Source' });
    expect(service.state.dataSources.find((source) => source.id === sourceId)?.name).toBe('Transient Source');

    await service.assignSourcesToEvent('event-1', [sourceId]);
    await service.assignSourcesToSession('session-1', { mode: 'specific', sourceIds: [sourceId] });

    await service.deleteSource(sourceId);

    expect(service.state.dataSources.find((source) => source.id === sourceId)).toBeUndefined();
    expect(service.state.eventSourceAssignments['event-1']).toEqual([]);
    expect(service.state.sessionSourceAssignments['session-1']).toEqual({ mode: 'specific', sourceIds: [] });
    expect(persistence.save).toHaveBeenCalled();
  });

  it('persists Apical manual data retrieval time and assigns the fetched event/session source', async () => {
    const persistence = createPersistence();
    const service = await SystemConfigService.create(persistence);

    await service.createSource('api-apical-data-file');
    const sourceId = service.state.dataSources[0]!.id;
    const expectedApicalDataFilePath = systemConfig.normalizeOptionalSystemFilePath('../../src/generated/apical-excel-cache/apical-event-1001.xlsx');

    await service.assignSourcesToEvent('event-existing', [sourceId]);
    await service.persistApicalDataFetch(
      sourceId,
      'event-apical-1001',
      'session-apical-1001',
      '2026-06-08T09:10:11.123Z',
      '../../src/generated/apical-excel-cache/apical-event-1001.xlsx'
    );

    expect(service.state.dataSources[0]?.apicalDataFilePath).toBe(expectedApicalDataFilePath);
    expect(service.state.dataSources[0]?.dataLastRetrieved).toBe('2026-06-08T09:10:11.123Z');
    expect(service.state.eventSourceAssignments['event-apical-1001']).toEqual([sourceId]);
    expect(service.state.sessionSourceAssignments['session-apical-1001']).toEqual({
      mode: 'specific',
      sourceIds: [sourceId],
    });
    expect(service.state.eventSourceAssignments['event-existing']).toEqual([sourceId]);
    expect(persistence.save).toHaveBeenLastCalledWith(expect.objectContaining({
      dataSources: [
        expect.objectContaining({
          apicalDataFilePath: expectedApicalDataFilePath,
          dataLastRetrieved: '2026-06-08T09:10:11.123Z',
          id: sourceId,
        }),
      ],
      eventSourceAssignments: expect.objectContaining({
        'event-apical-1001': [sourceId],
      }),
      sessionSourceAssignments: expect.objectContaining({
        'session-apical-1001': {
          mode: 'specific',
          sourceIds: [sourceId],
        },
      }),
    }));
  });

  it('backfills persisted Apical cache paths recovered from event data', async () => {
    const persistence = createPersistence({
      ...systemConfig.createDefaultSystemConfiguration(),
      dataSources: [
        {
          apiConfig: {
            authHeaderName: 'Authorization',
            authHeaderValue: '',
            baseUrl: 'https://apical.example.com',
            companyId: 2,
            httpTimeoutSeconds: 30,
            live: false,
            pollIntervalSeconds: 30,
            selectedEventIds: [1001],
          },
          dataLastRetrieved: '2026-06-08T09:10:11.123Z',
          enabled: true,
          id: 'source-apical',
          name: 'Apical Data file endpoint',
          type: 'api-apical-data-file',
        },
      ],
    });
    const service = await SystemConfigService.create(persistence);
    const expectedApicalDataFilePath = systemConfig.normalizeOptionalSystemFilePath('../../src/generated/apical-excel-cache/apical-event-1001.xlsx');

    await service.persistApicalDataFilePaths({
      'source-apical': '../../src/generated/apical-excel-cache/apical-event-1001.xlsx',
    });

    expect(service.state.dataSources[0]?.apicalDataFilePath).toBe(expectedApicalDataFilePath);
    expect(service.state.dataSources[0]?.dataLastRetrieved).toBe('2026-06-08T09:10:11.123Z');
    expect(persistence.save).toHaveBeenLastCalledWith(expect.objectContaining({
      dataSources: [
        expect.objectContaining({
          apicalDataFilePath: expectedApicalDataFilePath,
          dataLastRetrieved: '2026-06-08T09:10:11.123Z',
          id: 'source-apical',
        }),
      ],
    }));
  });

  it('persists per-event display options', async () => {
    const persistence = createPersistence();
    const service = await SystemConfigService.create(persistence);

    await service.updateEventOptions('event-1', { timeDisplayZoneMode: 'gmt' });

    expect(service.state.eventOptions['event-1']).toEqual({ timeDisplayZoneMode: 'gmt' });
    expect(persistence.save).toHaveBeenCalledWith(expect.objectContaining({
      eventOptions: {
        'event-1': {
          timeDisplayZoneMode: 'gmt',
        },
      },
    }));
  });

  it('normalizes the Apical Excel cache directory to an absolute system config path', async () => {
    const normalizedConfig = systemConfig.normalizeSystemConfiguration({
      ...systemConfig.createDefaultSystemConfiguration(),
      apicalExcelCacheDirectoryPath: 'src/generated/custom-apical-cache',
    });

    expect(normalizedConfig.apicalExcelCacheDirectoryPath).toBe(systemConfig.normalizeSystemDirectoryPath('src/generated/custom-apical-cache'));
    expect(systemConfig.normalizeSystemDirectoryPath(undefined)).toBe(systemConfig.DEFAULT_APICAL_EXCEL_CACHE_DIRECTORY_PATH);
  });

  it('persists Apical Excel cache directory changes as absolute paths', async () => {
    const persistence = createPersistence();
    const service = await SystemConfigService.create(persistence);

    await service.updateApicalExcelCacheDirectoryPath('src/generated/custom-apical-cache');

    expect(service.state.apicalExcelCacheDirectoryPath).toBe(systemConfig.normalizeSystemDirectoryPath('src/generated/custom-apical-cache'));
    expect(persistence.save).toHaveBeenCalledWith(expect.objectContaining({
      apicalExcelCacheDirectoryPath: systemConfig.normalizeSystemDirectoryPath('src/generated/custom-apical-cache'),
    }));
  });

  it('persists cached Apical events and clears selections that are not in the dropdown options', async () => {
    const persistence = createPersistence();
    const service = await SystemConfigService.create(persistence);

    await service.createSource('api-apical-data-file');
    const source = service.state.dataSources[0]!;
    await service.updateSource(source.id, {
      apiConfig: {
        ...source.apiConfig!,
        apicalEventId: 1001,
        selectedEventIds: [1001],
      },
    });

    await service.persistListedApicalEvents(source.id, [{ id: 1002, name: 'Round 2' }]);

    expect(service.state.dataSources[0]?.listedEvents).toEqual([{ id: 1002, name: 'Round 2' }]);
    expect(service.state.dataSources[0]?.apiConfig?.apicalEventId).toBeUndefined();
    expect(service.state.dataSources[0]?.apiConfig?.selectedEventIds).toEqual([]);
  });

  it('supports master entrant profile sources assigned to events', async () => {
    const persistence = createPersistence();
    const service = await SystemConfigService.create(persistence);

    await service.createSource('master-entrant-profiles');
    const source = service.state.dataSources[0];

    await service.updateSource(source.id, {
      masterEntrantConfig: {
        profiles: [
          {
            entrantId: 'team-7',
            firstName: 'Master',
            lastName: 'Record',
          },
        ],
      },
      name: 'Master Entrants A',
    });
    await service.assignSourcesToEvent('event-7', [source.id]);

    const profiles = systemConfig.getMasterEntrantProfilesForEvent(service.state, 'event-7');
    expect(profiles).toEqual([
      expect.objectContaining({ entrantId: 'team-7', firstName: 'Master', lastName: 'Record' }),
    ]);
  });

  it('creates and persists RFID Timing CSV file source config', async () => {
    const persistence = createPersistence();
    const service = await SystemConfigService.create(persistence);

    await service.createSource('file-rfid-timing-csv');
    const source = service.state.dataSources[0];
    expect(source).toBeDefined();
    expect(source.type).toBe('file-rfid-timing-csv');
    expect(source.fileConfig).toEqual({});

    await service.updateSource(source.id, {
      fileConfig: {
        filePath: 'src/testdata/2026-05-30.csv',
      },
    });

    expect(service.state.dataSources[0]?.fileConfig).toEqual({
      filePath: 'src/testdata/2026-05-30.csv',
    });
    expect(persistence.save).toHaveBeenCalledWith(expect.objectContaining({
      dataSources: [
        expect.objectContaining({
          fileConfig: {
            filePath: 'src/testdata/2026-05-30.csv',
          },
          type: 'file-rfid-timing-csv',
        }),
      ],
    }));
  });
});
