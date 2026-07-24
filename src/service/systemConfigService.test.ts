import path from 'node:path';

import { createEventEntrantId, createEventId } from '../model/ids.js';
import * as systemConfig from '../app/systemConfig.js';

import type { SystemConfigPersistence } from '../persistence/systemConfigPersistence.js';
import { SystemConfigService } from '../service/systemConfigService.js';

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
  it('recognizes when an Apical source name should be replaced by the fetched event name', () => {
    expect(systemConfig.shouldRenameApicalSourceForFetchedEvent(undefined)).toBe(true);
    expect(systemConfig.shouldRenameApicalSourceForFetchedEvent(null)).toBe(true);
    expect(systemConfig.shouldRenameApicalSourceForFetchedEvent('')).toBe(true);
    expect(systemConfig.shouldRenameApicalSourceForFetchedEvent('   ')).toBe(true);
    expect(systemConfig.shouldRenameApicalSourceForFetchedEvent(systemConfig.APICAL_DEFAULT_SOURCE_NAME)).toBe(true);
    expect(systemConfig.shouldRenameApicalSourceForFetchedEvent('Apical Live Feed')).toBe(false);
  });

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
    await service.updateSource(sourceId, { name: systemConfig.APICAL_DEFAULT_SOURCE_NAME });
    const expectedApicalDataFilePath = systemConfig.normalizeOptionalSystemFilePath('../../src/generated/apical-excel-cache/apical-event-1001.xlsx');

    await service.assignSourcesToEvent('event-existing', [sourceId]);
    await service.persistApicalDataFetch(
      sourceId,
      'event-apical-1001',
      'session-apical-1001',
      '2026-06-08T09:10:11.123Z',
      '../../src/generated/apical-excel-cache/apical-event-1001.xlsx',
      'Round 1'
    );

    expect(service.state.dataSources[0]?.apicalDataFilePath).toBe(expectedApicalDataFilePath);
    expect(service.state.dataSources[0]?.dataLastRetrieved).toBe('2026-06-08T09:10:11.123Z');
    expect(service.state.dataSources[0]?.name).toBe('Round 1');
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
          name: 'Round 1',
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

  it('preserves a custom Apical source name when fetching event data', async () => {
    const persistence = createPersistence();
    const service = await SystemConfigService.create(persistence);

    await service.createSource('api-apical-data-file');
    const sourceId = service.state.dataSources[0]!.id;
    await service.updateSource(sourceId, { name: 'Custom Apical Feed' });

    await service.persistApicalDataFetch(
      sourceId,
      'event-apical-1001',
      'session-apical-1001',
      '2026-06-08T09:10:11.123Z',
      undefined,
      'Round 1'
    );

    expect(service.state.dataSources[0]?.name).toBe('Custom Apical Feed');
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

  it('persists fastest time indicator color settings', async () => {
    const persistence = createPersistence();
    const service = await SystemConfigService.create(persistence);

    await service.updateFastestTimeIndicatorColors({ sessionFastestTime: '#123456' });

    expect(service.state.fastestTimeIndicatorColors).toEqual({
      ...systemConfig.DEFAULT_FASTEST_TIME_INDICATOR_COLORS,
      sessionFastestTime: '#123456',
    });
    expect(persistence.save).toHaveBeenCalledWith(expect.objectContaining({
      fastestTimeIndicatorColors: {
        ...systemConfig.DEFAULT_FASTEST_TIME_INDICATOR_COLORS,
        sessionFastestTime: '#123456',
      },
    }));
  });

  it('normalizes the local storage directory to an absolute system config path', async () => {
    const normalizedConfig = systemConfig.normalizeSystemConfiguration({
      ...systemConfig.createDefaultSystemConfiguration(),
      localStorageDirectoryPath: 'src/generated/custom-storage',
    });

    expect(normalizedConfig.localStorageDirectoryPath).toBe(systemConfig.normalizeSystemDirectoryPath('src/generated/custom-storage'));
    expect(systemConfig.normalizeSystemDirectoryPath(undefined)).toBe(systemConfig.DEFAULT_LOCAL_STORAGE_DIRECTORY_PATH);
  });

  it('migrates legacy Apical Excel cache directory config to the local storage parent path', async () => {
    const normalizedConfig = systemConfig.normalizeSystemConfiguration({
      ...systemConfig.createDefaultSystemConfiguration(),
      apicalExcelCacheDirectoryPath: 'src/generated/custom-storage/apical-excel-cache',
      localStorageDirectoryPath: undefined,
    });

    expect(normalizedConfig.localStorageDirectoryPath).toBe(systemConfig.normalizeSystemDirectoryPath('src/generated/custom-storage'));
  });

  it('persists local storage directory changes as absolute paths', async () => {
    const persistence = createPersistence();
    const service = await SystemConfigService.create(persistence);

    await service.updateLocalStorageDirectoryPath('src/generated/custom-storage');

    expect(service.state.localStorageDirectoryPath).toBe(systemConfig.normalizeSystemDirectoryPath('src/generated/custom-storage'));
    expect(persistence.save).toHaveBeenCalledWith(expect.objectContaining({
      localStorageDirectoryPath: systemConfig.normalizeSystemDirectoryPath('src/generated/custom-storage'),
    }));
  });

  it('persists the Timing context selection', async () => {
    const persistence = createPersistence();
    const service = await SystemConfigService.create(persistence);

    await service.updateTimingContextSelection({
      eventId: 'event-1',
      selectionMode: 'session',
      sessionId: 'session-1',
    });

    expect(service.state.timingContextSelection).toEqual({
      eventId: 'event-1',
      selectionMode: 'session',
      sessionId: 'session-1',
    });
    expect(persistence.save).toHaveBeenCalledWith(expect.objectContaining({
      timingContextSelection: {
        eventId: 'event-1',
        selectionMode: 'session',
        sessionId: 'session-1',
      },
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
    expect(service.state.apicalListedEvents).toEqual([{ id: 1002, name: 'Round 2' }]);
    expect(service.state.dataSources[0]?.apiConfig?.apicalEventId).toBeUndefined();
    expect(service.state.dataSources[0]?.apiConfig?.selectedEventIds).toEqual([]);
  });

  it('hydrates Apical sources from a persisted shared event list on reload', async () => {
    const persistence = createPersistence({
      ...systemConfig.createDefaultSystemConfiguration(),
      apicalListedEvents: [
        { id: 1001, name: 'Round 1' },
        { id: 1002, name: 'Round 2' },
      ],
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
          enabled: true,
          id: 'source-apical',
          name: 'Apical Data file endpoint',
          type: 'api-apical-data-file',
        },
      ],
    });

    const service = await SystemConfigService.create(persistence);

    expect(service.state.apicalListedEvents).toEqual([
      { id: 1001, name: 'Round 1' },
      { id: 1002, name: 'Round 2' },
    ]);
    expect(service.state.dataSources[0]?.listedEvents).toEqual([
      { id: 1001, name: 'Round 1' },
      { id: 1002, name: 'Round 2' },
    ]);
  });

  it('shares fetched Apical listed events across existing and newly created Apical sources', async () => {
    const persistence = createPersistence();
    const service = await SystemConfigService.create(persistence);

    await service.createSource('api-apical-data-file');
    const firstSource = service.state.dataSources[0]!;
    await service.updateSource(firstSource.id, {
      apiConfig: {
        ...firstSource.apiConfig!,
        selectedEventIds: [1001],
      },
    });

    await service.persistListedApicalEvents(firstSource.id, [
      { id: 1001, name: 'Round 1' },
      { id: 1002, name: 'Round 2' },
    ]);

    await service.createSource('api-apical-data-file');

    expect(service.state.apicalListedEvents).toEqual([
      { id: 1001, name: 'Round 1' },
      { id: 1002, name: 'Round 2' },
    ]);
    expect(service.state.dataSources[0]?.listedEvents).toEqual([
      { id: 1001, name: 'Round 1' },
      { id: 1002, name: 'Round 2' },
    ]);
    expect(service.state.dataSources[1]?.listedEvents).toEqual([
      { id: 1001, name: 'Round 1' },
      { id: 1002, name: 'Round 2' },
    ]);
    expect(persistence.save).toHaveBeenCalled();
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
            entrantId: createEventEntrantId('team-7'),
            firstName: 'Master',
            lastName: 'Record',
          },
        ],
      },
      name: 'Master Entrants A',
    });
    await service.assignSourcesToEvent(createEventId('event-7'), [source.id]);

    const profiles = systemConfig.getMasterEntrantProfilesForEvent(service.state, createEventId('event-7'));
    expect(profiles).toEqual([
      expect.objectContaining({ entrantId: createEventEntrantId('team-7'), firstName: 'Master', lastName: 'Record' }),
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

  it('creates and persists the Dorian CTC Import or Update mode', async () => {
    const persistence = createPersistence();
    const service = await SystemConfigService.create(persistence);

    await service.createSource('file-dorian-ctc-srt');
    const source = service.state.dataSources[0];

    expect(source.fileConfig).toEqual({ importMode: 'import', importPlaceholderEntrantsForUnknownTransmitters: false });

    await service.updateSource(source.id, {
      fileConfig: {
        filePath: path.join('RaceTime', 'timing', 'INDY500.ERF'),
        importMode: 'update',
      },
    });

    expect(service.state.dataSources[0]?.fileConfig).toEqual({
      ctcTrackConfig: undefined,
      filePath: path.resolve('RaceTime', 'timing', 'INDY500.ERF'),
      importMode: 'update',
      importPlaceholderEntrantsForUnknownTransmitters: false,
      trackConfigFilePath: undefined,
    });
  });

  it('creates and persists DURT FileMaker source settings', async () => {
    const persistence = createPersistence();
    const service = await SystemConfigService.create(persistence);

    await service.createSource('file-durt-filemaker');
    const source = service.state.dataSources[0];
    expect(source?.durtFileMakerConfig).toEqual({ importMode: 'import' });

    await service.updateSource(source!.id, {
      durtFileMakerConfig: {
        databaseFilePath: 'C:/DURT/Enduro Event.fp7',
        extractorPath: 'C:/tools/fmp2json.exe',
        importMode: 'update',
      },
    });

    expect(service.state.dataSources[0]?.durtFileMakerConfig).toEqual({
      databaseFilePath: path.resolve('C:/DURT/Enduro Event.fp7'),
      extractorPath: path.resolve('C:/tools/fmp2json.exe'),
      importMode: 'update',
    });
  });

  it('creates and persists MR-SCATS data source inventory config', async () => {
    const persistence = createPersistence();
    const service = await SystemConfigService.create(persistence);

    await service.createSource('file-mr-scats-data');
    const source = service.state.dataSources[0];
    expect(source).toBeDefined();
    expect(source.finishLineNumbers).toEqual([1]);
    expect(source.type).toBe('file-mr-scats-data');
    expect(source.mrScatsConfig).toEqual({
      files: [],
      ignoreLineOneNo1CrossingsWhenDbfPresent: true,
    });

    await service.updateSource(source.id, {
      mrScatsConfig: {
        dataLocationPath: 'C:/RaceTime/timing-data/W9721',
        files: [
          {
            extension: '.dbf',
            kind: 'dbf-table',
            name: 'W9721Q01.DBF',
            relativePath: 'W9721Q01.DBF',
            size: 7067,
          },
        ],
        sourceKind: 'directory',
      },
    });

    expect(service.state.dataSources[0]?.mrScatsConfig).toEqual({
      dataLocationPath: systemConfig.normalizeOptionalSystemFilePath('C:/RaceTime/timing-data/W9721'),
      files: [
        {
          extension: '.dbf',
          kind: 'dbf-table',
          name: 'W9721Q01.DBF',
          relativePath: 'W9721Q01.DBF',
          size: 7067,
        },
      ],
      ignoreLineOneNo1CrossingsWhenDbfPresent: true,
      sourceKind: 'directory',
    });
    expect(persistence.save).toHaveBeenCalledWith(expect.objectContaining({
      dataSources: [
        expect.objectContaining({
          finishLineNumbers: [1],
          mrScatsConfig: expect.objectContaining({
            dataLocationPath: systemConfig.normalizeOptionalSystemFilePath('C:/RaceTime/timing-data/W9721'),
            sourceKind: 'directory',
          }),
          type: 'file-mr-scats-data',
        }),
      ],
    }));
  });
});
