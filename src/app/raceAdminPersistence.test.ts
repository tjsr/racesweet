// @vitest-environment jsdom

import {
  ElectronJsonRaceAdminPersistence,
  createDefaultAdministrativeChanges,
} from './raceAdminPersistence.js';

describe('ElectronJsonRaceAdminPersistence', () => {
  it('returns default admin changes when admin-overrides file does not exist', async () => {
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

    const persistence = new ElectronJsonRaceAdminPersistence('../../src/generated/admin-overrides.json');
    const loaded = await persistence.load();

    expect(loaded).toEqual(createDefaultAdministrativeChanges());
  });

  it('does not call onError when file is not found (ENOENT)', async () => {
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
    const persistence = new ElectronJsonRaceAdminPersistence('../../src/generated/admin-overrides.json', onError);
    await persistence.load();

    expect(onError).not.toHaveBeenCalled();
  });

  it('calls onError and returns defaults when file content is invalid JSON', async () => {
    const requestFileContent = vi.fn(async () => 'not valid json{{{');

    (window as unknown as {
      api: {
        requestFileContent: <T>(filePath: string, dataType: string) => Promise<T>;
      };
    }).api = {
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
    };

    const onError = vi.fn();
    const persistence = new ElectronJsonRaceAdminPersistence('../../src/generated/admin-overrides.json', onError);
    const loaded = await persistence.load();

    expect(loaded).toEqual(createDefaultAdministrativeChanges());
    expect(onError).toHaveBeenCalledOnce();
  });

  it('returns parsed admin changes when file exists', async () => {
    const requestFileContent = vi.fn(async () => JSON.stringify({
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

    const persistence = new ElectronJsonRaceAdminPersistence('../../src/generated/admin-overrides.json');
    const loaded = await persistence.load();

    expect(loaded).toEqual({
      entrantCategories: { teamA: 'cat-1' },
      excludedCrossings: { crossing1: true },
      schemaVersion: 1,
    });
  });

  it('reports save permission errors without throwing', async () => {
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
    const persistence = new ElectronJsonRaceAdminPersistence('../../src/generated/admin-overrides.json', onError);

    await expect(persistence.save(createDefaultAdministrativeChanges())).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledOnce();
  });
});
