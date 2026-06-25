// @vitest-environment jsdom

import {
  ElectronJsonRaceAdminPersistence,
  createDefaultAdministrativeChanges,
} from './raceAdminPersistence.js';

const adminOverridesTestPath = '../../test/generated/admin-overrides.test.json';

describe('ElectronJsonRaceAdminPersistence', () => {
  afterEach(() => {
    delete (window as unknown as { api?: unknown }).api;
    vi.restoreAllMocks();
  });

  it('returns default admin changes when admin-overrides file does not exist', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const requestFileContent = vi.fn(async () => {
      throw new Error('ENOENT: no such file or directory');
    });

    (window as unknown as {
      api: {
        requestFileContent: <T>(filePath: string, dataType: string) => Promise<T>;
      };
    }).api = {
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
    };

    const persistence = new ElectronJsonRaceAdminPersistence(adminOverridesTestPath);
    const loaded = await persistence.load();

    expect(loaded).toEqual(createDefaultAdministrativeChanges());
    expect(infoSpy).toHaveBeenCalledOnce();
  });

  it('does not call onError when file is not found (ENOENT)', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const requestFileContent = vi.fn(async () => {
      throw new Error('ENOENT: no such file or directory');
    });

    (window as unknown as {
      api: {
        requestFileContent: <T>(filePath: string, dataType: string) => Promise<T>;
      };
    }).api = {
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
    };

    const onError = vi.fn();
    const persistence = new ElectronJsonRaceAdminPersistence(adminOverridesTestPath, onError);
    await persistence.load();

    expect(onError).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledOnce();
  });

  it('calls onError and returns defaults when file content is invalid JSON', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const requestFileContent = vi.fn(async () => 'not valid json{{{');

    (window as unknown as {
      api: {
        requestFileContent: <T>(filePath: string, dataType: string) => Promise<T>;
      };
    }).api = {
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
    };

    const onError = vi.fn();
    const persistence = new ElectronJsonRaceAdminPersistence(adminOverridesTestPath, onError);
    const loaded = await persistence.load();

    expect(loaded).toEqual(createDefaultAdministrativeChanges());
    expect(onError).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it('returns parsed admin changes when file exists', async () => {
    const requestFileContent = vi.fn(async () => JSON.stringify({
      addedRecords: [{
        record: { id: 'record-1', recordType: 16, sequence: 1, sessionId: 'session-a', source: 'manual-source' },
        sessionId: 'session-a',
      }],
      entrantCategories: { teamA: 'cat-1' },
      excludedCrossings: { crossing1: true },
      schemaVersion: 1,
    }));

    (window as unknown as {
      api: {
        requestFileContent: <T>(filePath: string, dataType: string) => Promise<T>;
      };
    }).api = {
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
    };

    const persistence = new ElectronJsonRaceAdminPersistence(adminOverridesTestPath);
    const loaded = await persistence.load();

    expect(loaded).toEqual({
      addedRecords: [{
        record: { id: 'record-1', recordType: 16, sequence: 1, sessionId: 'session-a', source: 'manual-source' },
        sessionId: 'session-a',
      }],
      entrantCategories: { teamA: 'cat-1' },
      excludedCrossings: { crossing1: true },
      flagCategoryChanges: [],
      flagDeleted: {},
      schemaVersion: 1,
      updatedRecords: [],
    });
  });

  it('reports save permission errors without throwing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const writeFileContent = vi.fn(async () => {
      throw new Error('EACCES: permission denied');
    });

    (window as unknown as {
      api: {
        writeFileContent: (filePath: string, contents: string) => Promise<void>;
      };
    }).api = {
      writeFileContent,
    };

    const onError = vi.fn();
    const persistence = new ElectronJsonRaceAdminPersistence(adminOverridesTestPath, onError);

    await expect(persistence.save(createDefaultAdministrativeChanges())).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledOnce();
  });
});
