// @vitest-environment jsdom

import { ElectronJsonEventCatalogPersistence } from './eventCatalogPersistence.js';
import { EventCatalogService } from './eventCatalogService.js';
import { createDefaultEventCatalogLedger } from './eventCatalog.js';
import { createEventId, createId } from '../model/ids.js';
import { useStderrGuard } from '../testing/stderrGuard.js';

const eventCatalogTestPath = '../../test/generated/event-catalog.test.json';

describe('ElectronJsonEventCatalogPersistence', () => {
  useStderrGuard();

  afterEach(() => {
    delete (window as unknown as { api?: unknown }).api;
    vi.restoreAllMocks();
  });

  it('returns default ledger when file does not exist', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const requestFileContent = vi.fn(async () => {
      throw new Error('ENOENT: no such file or directory');
    });

    (window as unknown as {
      api: { requestFileContent: <T>(filePath: string, dataType: string) => Promise<T> };
    }).api = {
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
    };

    const persistence = new ElectronJsonEventCatalogPersistence(eventCatalogTestPath);
    const loaded = await persistence.load();

    expect(loaded).toEqual(createDefaultEventCatalogLedger());
    expect(infoSpy).toHaveBeenCalledOnce();
  });

  it('throws a clear assertion when window.api is missing during load', async () => {
    const persistence = new ElectronJsonEventCatalogPersistence(eventCatalogTestPath);

    await expect(persistence.load()).rejects.toThrow(/window\.api must be populated/);
  });

  it('throws a clear assertion when window.api.writeFileContent is missing during save', async () => {
    (window as unknown as {
      api: { requestFileContent: <T>(filePath: string, dataType: string) => Promise<T> };
    }).api = {
      requestFileContent: vi.fn(),
    };

    const persistence = new ElectronJsonEventCatalogPersistence(eventCatalogTestPath);

    await expect(persistence.save(createDefaultEventCatalogLedger())).rejects.toThrow(/Missing methods: writeFileContent/);
  });

  it('fails EventCatalogService.create clearly when seed persistence cannot access window.api.writeFileContent', async () => {
    (window as unknown as {
      api: { requestFileContent: <T>(filePath: string, dataType: string) => Promise<T> };
    }).api = {
      requestFileContent: vi.fn(async () => JSON.stringify(createDefaultEventCatalogLedger())) as <T>(filePath: string, dataType: string) => Promise<T>,
    };

    const persistence = new ElectronJsonEventCatalogPersistence(eventCatalogTestPath);

    await expect(EventCatalogService.create(persistence)).rejects.toThrow(/Missing methods: writeFileContent/);
  });

  it('does not call onError when file is not found (ENOENT)', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const requestFileContent = vi.fn(async () => {
      throw new Error('ENOENT: no such file or directory');
    });

    (window as unknown as {
      api: { requestFileContent: <T>(filePath: string, dataType: string) => Promise<T> };
    }).api = {
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
    };

    const onError = vi.fn();
    const persistence = new ElectronJsonEventCatalogPersistence(eventCatalogTestPath, onError);
    await persistence.load();

    expect(onError).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledOnce();
  });

  it('calls onError and returns defaults when file content is invalid JSON', async () => {
    const requestFileContent = vi.fn(async () => 'not valid json{{{');

    (window as unknown as {
      api: { requestFileContent: <T>(filePath: string, dataType: string) => Promise<T> };
    }).api = {
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
    };

    const onError = vi.fn();
    const persistence = new ElectronJsonEventCatalogPersistence(eventCatalogTestPath, onError);
    const loaded = await persistence.load();

    expect(loaded).toEqual(createDefaultEventCatalogLedger());
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(SyntaxError);
  });

  it('returns normalized parsed ledger when file exists and is valid', async () => {
    const ledgerData = {
      mutations: [
        {
          event: {
            categoryIds: [],
            date: '2025-01-01',
            entrantIds: [],
            format: 'race-weekend',
            id: 'evt-1',
            name: 'Legacy Event',
            sessionIds: [],
          },
          id: 'mut-1',
          timestamp: '2025-01-01T00:00:00.000Z',
          type: 'event-created',
        },
        { eventId: 'evt-1', id: 'mut-2', timestamp: '2025-01-01T00:00:00.000Z', type: 'event-activated' },
      ],
      schemaVersion: 1,
    };
    const expectedEventId = createEventId('evt-1');
    const expectedEventMutationId = createId('mutationId', 'mut-1');
    const expectedActivationMutationId = createId('mutationId', 'mut-2');

    const requestFileContent = vi.fn(async () => JSON.stringify(ledgerData));

    (window as unknown as {
      api: { requestFileContent: <T>(filePath: string, dataType: string) => Promise<T> };
    }).api = {
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
    };

    const persistence = new ElectronJsonEventCatalogPersistence(eventCatalogTestPath);
    const loaded = await persistence.load();

    expect(loaded.mutations).toEqual([
      {
        event: {
          categoryIds: [],
          date: '2025-01-01',
          entrantIds: [],
          format: 'race-weekend',
          id: expectedEventId,
          name: 'Legacy Event',
          sessionIds: [],
        },
        id: expectedEventMutationId,
        timestamp: '2025-01-01T00:00:00.000Z',
        type: 'event-created',
      },
      { eventId: expectedEventId, id: expectedActivationMutationId, timestamp: '2025-01-01T00:00:00.000Z', type: 'event-activated' },
    ]);
    expect(loaded.schemaVersion).toBe(1);
  });

  it('reports save permission errors without throwing', async () => {
    const writeFileContent = vi.fn(async () => {
      throw new Error('EPERM: operation not permitted');
    });

    (window as unknown as {
      api: { writeFileContent: (filePath: string, contents: string) => Promise<void> };
    }).api = {
      writeFileContent,
    };

    const onError = vi.fn();
    const persistence = new ElectronJsonEventCatalogPersistence(eventCatalogTestPath, onError);

    await expect(persistence.save(createDefaultEventCatalogLedger())).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toContain('Windows denied file access');
  });

  it('writes the event catalog ledger to the configured event data file', async () => {
    const writeFileContent = vi.fn(async () => undefined);

    (window as unknown as {
      api: { writeFileContent: (filePath: string, contents: string) => Promise<void> };
    }).api = {
      writeFileContent,
    };

    const ledger = {
      ...createDefaultEventCatalogLedger(),
      mutations: [
        {
          event: {
            categoryIds: [],
            date: '2026-06-05',
            entrantIds: [],
            format: 'race-weekend' as const,
            id: 'event-new',
            name: 'New Event',
            sessionIds: [],
          },
          id: 'mutation-new-event',
          timestamp: '2026-06-05T00:00:00.000Z',
          type: 'event-created' as const,
        },
      ],
    };

    const persistence = new ElectronJsonEventCatalogPersistence(eventCatalogTestPath);
    await persistence.save(ledger);

    expect(writeFileContent).toHaveBeenCalledWith(
      eventCatalogTestPath,
      JSON.stringify(ledger, null, 2)
    );
  });
});
