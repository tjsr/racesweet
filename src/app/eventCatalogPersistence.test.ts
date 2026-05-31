// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { createDefaultEventCatalogLedger } from './eventCatalog.js';
import { ElectronJsonEventCatalogPersistence } from './eventCatalogPersistence.js';

describe('ElectronJsonEventCatalogPersistence', () => {
  it('returns default ledger when file does not exist', async () => {
    const requestFileContent = vi.fn(async () => {
      throw new Error('ENOENT: no such file or directory');
    });

    (window as unknown as {
      api: { requestFileContent: <T>(filePath: string, dataType: string) => Promise<T> };
    }).api = {
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
    };

    const persistence = new ElectronJsonEventCatalogPersistence('../../src/generated/event-catalog.json');
    const loaded = await persistence.load();

    expect(loaded).toEqual(createDefaultEventCatalogLedger());
  });

  it('does not call onError when file is not found (ENOENT)', async () => {
    const requestFileContent = vi.fn(async () => {
      throw new Error('ENOENT: no such file or directory');
    });

    (window as unknown as {
      api: { requestFileContent: <T>(filePath: string, dataType: string) => Promise<T> };
    }).api = {
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
    };

    const onError = vi.fn();
    const persistence = new ElectronJsonEventCatalogPersistence('../../src/generated/event-catalog.json', onError);
    await persistence.load();

    expect(onError).not.toHaveBeenCalled();
  });

  it('calls onError and returns defaults when file content is invalid JSON', async () => {
    const requestFileContent = vi.fn(async () => 'not valid json{{{');

    (window as unknown as {
      api: { requestFileContent: <T>(filePath: string, dataType: string) => Promise<T> };
    }).api = {
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
    };

    const onError = vi.fn();
    const persistence = new ElectronJsonEventCatalogPersistence('../../src/generated/event-catalog.json', onError);
    const loaded = await persistence.load();

    expect(loaded).toEqual(createDefaultEventCatalogLedger());
    expect(onError).toHaveBeenCalledOnce();
  });

  it('returns parsed ledger when file exists and is valid', async () => {
    const ledgerData = {
      mutations: [{ id: 'mut-1', timestamp: '2025-01-01T00:00:00.000Z', type: 'event-activated', eventId: 'evt-1' }],
      schemaVersion: 1,
    };

    const requestFileContent = vi.fn(async () => JSON.stringify(ledgerData));

    (window as unknown as {
      api: { requestFileContent: <T>(filePath: string, dataType: string) => Promise<T> };
    }).api = {
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
    };

    const persistence = new ElectronJsonEventCatalogPersistence('../../src/generated/event-catalog.json');
    const loaded = await persistence.load();

    expect(loaded.mutations).toEqual(ledgerData.mutations);
    expect(loaded.schemaVersion).toBe(1);
  });
});
