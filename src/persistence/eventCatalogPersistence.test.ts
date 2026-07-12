// @vitest-environment jsdom

import { ElectronJsonEventCatalogPersistence } from '../persistence/eventCatalogPersistence.js';
import { EventCatalogService } from '../service/eventCatalogService.js';
import { createDefaultEventCatalogLedger } from '../ledger/eventCatalogLedger.js';
import { createCategoryId, createEventId, createId } from '../model/ids.js';
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

  it('writes event catalog data to a manifest and per-event data files', async () => {
    const writeFileContent = vi.fn(async () => undefined);

    (window as unknown as {
      api: { writeFileContent: (filePath: string, contents: string) => Promise<void> };
    }).api = {
      writeFileContent,
    };

    const eventId = createEventId('event-new');
    const categoryId = createCategoryId('event-new-category');
    const ledger = {
      ...createDefaultEventCatalogLedger(),
      mutations: [
        {
          event: {
            categoryIds: [],
            date: '2026-06-05',
            entrantIds: [],
            format: 'race-weekend' as const,
            id: eventId,
            name: 'New Event',
            sessionIds: [],
          },
          id: 'mutation-new-event',
          timestamp: '2026-06-05T00:00:00.000Z',
          type: 'event-created' as const,
        },
        {
          category: {
            code: 'CAT',
            description: '',
            eventId,
            id: categoryId,
            name: 'Category',
          },
          id: 'mutation-new-category',
          timestamp: '2026-06-05T00:00:01.000Z',
          type: 'category-created' as const,
        },
      ],
    };

    const persistence = new ElectronJsonEventCatalogPersistence(eventCatalogTestPath);
    await persistence.save(ledger);

    expect(writeFileContent).toHaveBeenCalledWith(
      eventCatalogTestPath,
      JSON.stringify({
        eventFiles: [
          {
            eventId,
            fileName: `${eventId}.json`,
          },
        ],
        globalMutations: [],
        mutationOrder: [
          {
            eventId,
            mutationId: 'mutation-new-event',
          },
          {
            eventId,
            mutationId: 'mutation-new-category',
          },
        ],
        schemaVersion: 2,
      }, null, 2)
    );
    expect(writeFileContent).toHaveBeenCalledWith(
      `../../test/generated/${eventId}.json`,
      JSON.stringify({
        eventId,
        mutations: ledger.mutations,
        schemaVersion: 1,
      }, null, 2)
    );
  });

  it('loads split event catalog manifests and event data files as one ledger', async () => {
    const eventId = createEventId('split-event');
    const eventMutation = {
      event: {
        categoryIds: [],
        date: '2026-06-05',
        entrantIds: [],
        format: 'race-weekend' as const,
        id: eventId,
        name: 'Split Event',
        sessionIds: [],
      },
      id: 'mutation-split-event',
      timestamp: '2026-06-05T00:00:00.000Z',
      type: 'event-created' as const,
    };
    const requestFileContent = vi.fn(async (filePath: string) => {
      if (filePath === eventCatalogTestPath) {
        return JSON.stringify({
          eventFiles: [{ eventId, fileName: `${eventId}.json` }],
          globalMutations: [],
          mutationOrder: [{ eventId, mutationId: eventMutation.id }],
          schemaVersion: 2,
        });
      }

      return JSON.stringify({
        eventId,
        mutations: [eventMutation],
        schemaVersion: 1,
      });
    });

    (window as unknown as {
      api: { requestFileContent: <T>(filePath: string, dataType: string) => Promise<T> };
    }).api = {
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
    };

    const persistence = new ElectronJsonEventCatalogPersistence(eventCatalogTestPath);
    const loaded = await persistence.load();

    expect(loaded).toEqual({
      mutations: [eventMutation],
      schemaVersion: 1,
    });
    expect(requestFileContent).toHaveBeenCalledWith(`../../test/generated/${eventId}.json`, 'utf8');
  });

  it('skips unchanged event data files on subsequent saves', async () => {
    const eventOneId = createEventId('event-one');
    const eventTwoId = createEventId('event-two');
    const createEventMutation = (eventId: ReturnType<typeof createEventId>, name: string, mutationId: string) => ({
      event: {
        categoryIds: [],
        date: '2026-06-05',
        entrantIds: [],
        format: 'race-weekend' as const,
        id: eventId,
        name,
        sessionIds: [],
      },
      id: mutationId,
      timestamp: '2026-06-05T00:00:00.000Z',
      type: 'event-created' as const,
    });
    const firstLedger = {
      ...createDefaultEventCatalogLedger(),
      mutations: [
        createEventMutation(eventOneId, 'Event One', 'mutation-event-one'),
        createEventMutation(eventTwoId, 'Event Two', 'mutation-event-two'),
      ],
    };
    const secondLedger = {
      ...createDefaultEventCatalogLedger(),
      mutations: [
        ...firstLedger.mutations,
        {
          changes: { name: 'Event One Updated' },
          eventId: eventOneId,
          id: 'mutation-event-one-updated',
          timestamp: '2026-06-05T00:00:01.000Z',
          type: 'event-updated' as const,
        },
      ],
    };
    const writeFileContent = vi.fn(async () => undefined);

    (window as unknown as {
      api: { writeFileContent: (filePath: string, contents: string) => Promise<void> };
    }).api = {
      writeFileContent,
    };

    const persistence = new ElectronJsonEventCatalogPersistence(eventCatalogTestPath);
    await persistence.save(firstLedger);
    writeFileContent.mockClear();
    await persistence.save(secondLedger);

    expect(writeFileContent).toHaveBeenCalledWith(eventCatalogTestPath, expect.any(String));
    expect(writeFileContent).toHaveBeenCalledWith(`../../test/generated/${eventOneId}.json`, expect.any(String));
    expect(writeFileContent).not.toHaveBeenCalledWith(`../../test/generated/${eventTwoId}.json`, expect.any(String));
  });
});
