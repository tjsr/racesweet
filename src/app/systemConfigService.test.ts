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
