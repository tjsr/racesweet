// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { createDefaultSystemConfiguration } from './systemConfig.js';
import { ElectronJsonSystemConfigPersistence } from './systemConfigPersistence.js';

describe('ElectronJsonSystemConfigPersistence', () => {
  it('returns default config when file does not exist', async () => {
    const requestFileContent = vi.fn(async () => {
      throw new Error('ENOENT: no such file or directory');
    });

    (window as unknown as {
      api: { requestFileContent: <T>(filePath: string, dataType: string) => Promise<T> };
    }).api = {
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
    };

    const persistence = new ElectronJsonSystemConfigPersistence('../../src/generated/system-config.json');
    const loaded = await persistence.load();

    expect(loaded).toEqual(createDefaultSystemConfiguration());
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
    const persistence = new ElectronJsonSystemConfigPersistence('../../src/generated/system-config.json', onError);
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
    const persistence = new ElectronJsonSystemConfigPersistence('../../src/generated/system-config.json', onError);
    const loaded = await persistence.load();

    expect(loaded).toEqual(createDefaultSystemConfiguration());
    expect(onError).toHaveBeenCalledOnce();
  });

  it('returns parsed config when file exists and is valid', async () => {
    const configData = {
      dataSources: [{ enabled: true, id: 'src-1', name: 'Test Source', type: 'api-apical-data-file' }],
      eventSourceAssignments: { 'evt-1': ['src-1'] },
      schemaVersion: 1,
      sessionSourceAssignments: {},
    };

    const requestFileContent = vi.fn(async () => JSON.stringify(configData));

    (window as unknown as {
      api: { requestFileContent: <T>(filePath: string, dataType: string) => Promise<T> };
    }).api = {
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
    };

    const persistence = new ElectronJsonSystemConfigPersistence('../../src/generated/system-config.json');
    const loaded = await persistence.load();

    expect(loaded.dataSources).toEqual(configData.dataSources);
    expect(loaded.eventSourceAssignments).toEqual(configData.eventSourceAssignments);
    expect(loaded.schemaVersion).toBe(1);
  });
});
