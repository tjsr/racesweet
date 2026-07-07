// @vitest-environment jsdom

import { ElectronJsonSystemConfigPersistence } from '../persistence/systemConfigPersistence.js';
import { createDefaultSystemConfiguration } from '../app/systemConfig.js';
import { useStderrGuard } from '../testing/stderrGuard.js';

const systemConfigTestPath = '../../test/generated/system-config.test.json';

describe('ElectronJsonSystemConfigPersistence', () => {
  useStderrGuard();

  afterEach(() => {
    delete (window as unknown as { api?: unknown }).api;
    vi.restoreAllMocks();
  });

  it('returns default config when file does not exist', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const requestFileContent = vi.fn(async () => {
      throw new Error('ENOENT: no such file or directory');
    });

    (window as unknown as {
      api: { requestFileContent: <T>(filePath: string, dataType: string) => Promise<T> };
    }).api = {
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
    };

    const persistence = new ElectronJsonSystemConfigPersistence(systemConfigTestPath);
    const loaded = await persistence.load();

    expect(loaded).toEqual(createDefaultSystemConfiguration());
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
    const persistence = new ElectronJsonSystemConfigPersistence(systemConfigTestPath, onError);
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
    const persistence = new ElectronJsonSystemConfigPersistence(systemConfigTestPath, onError);
    const loaded = await persistence.load();

    expect(loaded).toEqual(createDefaultSystemConfiguration());
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(SyntaxError);
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

    const persistence = new ElectronJsonSystemConfigPersistence(systemConfigTestPath);
    const loaded = await persistence.load();

    expect(loaded.dataSources).toEqual(configData.dataSources);
    expect(loaded.eventSourceAssignments).toEqual(configData.eventSourceAssignments);
    expect(loaded.schemaVersion).toBe(1);
  });

  it('loads cached Apical events and migrates legacy event id into selected dropdown ids', async () => {
    const configData = {
      dataSources: [
        {
          apiConfig: {
            apicalEventId: 1001,
            authHeaderName: 'Authorization',
            authHeaderValue: 'Bearer token',
            baseUrl: 'https://apicalracetiming.com.au',
            companyId: 2,
            httpTimeoutSeconds: 10,
            live: true,
            pollIntervalSeconds: 30,
          },
          enabled: true,
          id: 'source-apical',
          listedEvents: [
            { id: 1001, name: 'Cached Round 1' },
            { id: 1002, name: 'Cached Round 2' },
          ],
          name: 'Apical Source',
          type: 'api-apical-data-file',
        },
      ],
      eventSourceAssignments: {},
      schemaVersion: 1,
      sessionSourceAssignments: {},
    };
    const requestFileContent = vi.fn(async () => JSON.stringify(configData));

    (window as unknown as {
      api: { requestFileContent: <T>(filePath: string, dataType: string) => Promise<T> };
    }).api = {
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
    };

    const persistence = new ElectronJsonSystemConfigPersistence(systemConfigTestPath);
    const loaded = await persistence.load();

    expect(loaded.dataSources[0]?.listedEvents).toEqual(configData.dataSources[0].listedEvents);
    expect(loaded.dataSources[0]?.apiConfig?.selectedEventIds).toEqual([1001]);
  });

  it('reports save permission errors without throwing', async () => {
    const writeFileContent = vi.fn(async () => {
      throw new Error('EACCES: access is denied');
    });

    (window as unknown as {
      api: { writeFileContent: (filePath: string, contents: string) => Promise<void> };
    }).api = {
      writeFileContent,
    };

    const onError = vi.fn();
    const persistence = new ElectronJsonSystemConfigPersistence(systemConfigTestPath, onError);

    await expect(persistence.save(createDefaultSystemConfiguration())).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toContain('Windows denied file access');
  });
});
