// @vitest-environment jsdom

import { RequestOpenLocalFileIpcInvokeChannel, RequestReadIpcSendChannel, RequestSelectLocalDirectoryIpcInvokeChannel, RequestSelectLocalFileIpcInvokeChannel, RequestWriteIpcSendChannel, WriteContentErrorIpcReceiveChannel } from '../model/electronIpc.js';
import { contextBridge, ipcRenderer } from 'electron';


vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn((key: string, value: unknown) => {
      (window as unknown as Record<string, unknown>)[key] = value;
    }),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    send: vi.fn(),
  },
}));

const setContextIsolation = (value: boolean | undefined): void => {
  Object.defineProperty(process, 'contextIsolated', {
    configurable: true,
    value,
  });
};

describe('Electron preload renderer API', () => {
  const originalContextIsolated = (process as NodeJS.Process & { contextIsolated?: boolean }).contextIsolated;

  beforeEach(() => {
    vi.resetModules();
    vi.mocked(contextBridge.exposeInMainWorld).mockClear();
    vi.mocked(ipcRenderer.invoke).mockClear();
    vi.mocked(ipcRenderer.on).mockClear();
    vi.mocked(ipcRenderer.send).mockClear();
    delete (window as unknown as { api?: unknown }).api;
  });

  afterEach(() => {
    setContextIsolation(originalContextIsolated);
    delete (window as unknown as { api?: unknown }).api;
  });

  it('populates window.api with the full IPC surface when context isolation is disabled', async () => {
    setContextIsolation(false);

    await import('./preload.js');

    expect(contextBridge.exposeInMainWorld).not.toHaveBeenCalled();
    expect(window.api).toEqual(expect.objectContaining({
      receive: expect.any(Function),
      openLocalFile: expect.any(Function),
      openExternalUrl: expect.any(Function),
      requestBuffer: expect.any(Function),
      requestExternalHttp: expect.any(Function),
      requestFileContent: expect.any(Function),
      selectLocalDirectory: expect.any(Function),
      selectLocalFile: expect.any(Function),
      send: expect.any(Function),
      writeFileContent: expect.any(Function),
    }));
  });

  it('exposes the same complete IPC API through contextBridge when context isolation is enabled', async () => {
    setContextIsolation(true);

    await import('./preload.js');

    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith('api', window.api);
    expect(window.api.writeFileContent).toEqual(expect.any(Function));
    expect(window.api.openLocalFile).toEqual(expect.any(Function));
    expect(window.api.openExternalUrl).toEqual(expect.any(Function));
    expect(window.api.requestFileContent).toEqual(expect.any(Function));
  });

  it('sends read and write IPC requests through the constructed window.api methods', async () => {
    setContextIsolation(false);
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222');

    await import('./preload.js');

    void window.api.requestFileContent<string>('catalog.json', 'utf8');
    void window.api.writeFileContent('catalog.json', '{"schemaVersion":1}');

    expect(ipcRenderer.send).toHaveBeenCalledWith(
      RequestReadIpcSendChannel,
      'catalog.json',
      '11111111-1111-4111-8111-111111111111',
      'utf8');
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      RequestWriteIpcSendChannel,
      'catalog.json',
      '22222222-2222-4222-8222-222222222222',
      '{"schemaVersion":1}',
      'utf8');
  });

  it('converts structured main-process file-write failures into renderer errors', async () => {
    setContextIsolation(false);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('33333333-3333-4333-8333-333333333333');
    await import('./preload.js');

    const pendingWrite = window.api.writeFileContent('catalog.json', '{}');
    const errorListener = vi.mocked(ipcRenderer.on).mock.calls.find(([channel]) => channel === WriteContentErrorIpcReceiveChannel)?.[1];
    errorListener?.({} as never, '33333333-3333-4333-8333-333333333333', {
      diagnostics: {
        attemptId: 'save-attempt-1',
        currentWorkingDirectory: 'C:\\dev\\racesweet',
        durationMilliseconds: 1,
        message: 'access denied',
        osUserName: 'tim',
        parentDirectoryPath: 'C:\\dev\\racesweet\\src\\generated',
        payloadByteLength: 2,
        payloadType: 'utf8',
        processId: 1234,
        queuedBehindApplicationWrite: false,
        queueWaitMilliseconds: 0,
        requestedPath: 'catalog.json',
        resolvedPath: 'C:\\dev\\racesweet\\src\\generated\\catalog.json',
        startedAt: '2026-07-20T00:00:00.000Z',
        userDataPath: 'C:\\Users\\tim\\AppData\\Roaming\\RaceSweet',
      },
      guidance: 'Check file permissions.',
    });

    await expect(pendingWrite).rejects.toMatchObject({
      diagnostics: expect.objectContaining({ attemptId: 'save-attempt-1' }),
      guidance: 'Check file permissions.',
      name: 'FileWriteFailureError',
    });
  });

  it('opens local files through the invoke IPC bridge', async () => {
    setContextIsolation(false);

    await import('./preload.js');

    void window.api.openLocalFile('../../src/generated/apical-excel-cache/apical-event-1001.xlsx');

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      RequestOpenLocalFileIpcInvokeChannel,
      '../../src/generated/apical-excel-cache/apical-event-1001.xlsx'
    );
  });

  it('selects local directories through the dedicated invoke IPC bridge', async () => {
    setContextIsolation(false);

    await import('./preload.js');

    void window.api.selectLocalDirectory('Select MR-SCATS data directory');

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      RequestSelectLocalDirectoryIpcInvokeChannel,
      'Select MR-SCATS data directory'
    );
  });

  it('falls back to the file picker directory mode when the main process lacks the dedicated directory handler', async () => {
    setContextIsolation(false);
    vi.mocked(ipcRenderer.invoke)
      .mockRejectedValueOnce(new Error("No handler registered for 'askToSelectLocalDirectory'"))
      .mockResolvedValueOnce('C:/RaceTime/timing-data/W9721');

    await import('./preload.js');

    await expect(window.api.selectLocalDirectory('Select MR-SCATS data directory')).resolves.toBe('C:/RaceTime/timing-data/W9721');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      RequestSelectLocalDirectoryIpcInvokeChannel,
      'Select MR-SCATS data directory'
    );
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      RequestSelectLocalFileIpcInvokeChannel,
      {
        properties: ['openDirectory'],
        title: 'Select MR-SCATS data directory',
      }
    );
  });
});
