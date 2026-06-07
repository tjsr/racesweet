// @vitest-environment jsdom

import { ElectronJsonEventCatalogPersistence } from './eventCatalogPersistence.js';
import { createDefaultEventCatalogLedger } from './eventCatalog.js';

const eventCatalogTestPath = '../../test/generated/event-catalog.test.json';

describe('ElectronJsonEventCatalogPersistence', () => {
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
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
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
    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it('returns parsed ledger when file exists and is valid', async () => {
    const ledgerData = {
      mutations: [{ eventId: 'evt-1', id: 'mut-1', timestamp: '2025-01-01T00:00:00.000Z', type: 'event-activated' }],
      schemaVersion: 1,
    };

    const requestFileContent = vi.fn(async () => JSON.stringify(ledgerData));

    (window as unknown as {
      api: { requestFileContent: <T>(filePath: string, dataType: string) => Promise<T> };
    }).api = {
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
    };

    const persistence = new ElectronJsonEventCatalogPersistence(eventCatalogTestPath);
    const loaded = await persistence.load();

    expect(loaded.mutations).toEqual(ledgerData.mutations);
    expect(loaded.schemaVersion).toBe(1);
  });

  it('reports save permission errors without throwing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
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
    expect(warnSpy).toHaveBeenCalledOnce();
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
