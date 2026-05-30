// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import {
  createDefaultAdministrativeChanges,
  ElectronJsonRaceAdminPersistence,
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
});
