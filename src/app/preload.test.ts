// @vitest-environment jsdom

import { RequestOpenLocalFileIpcInvokeChannel, RequestReadIpcSendChannel, RequestWriteIpcSendChannel } from '../model/electronIpc.js';
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
      requestBuffer: expect.any(Function),
      requestExternalHttp: expect.any(Function),
      requestFileContent: expect.any(Function),
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

  it('opens local files through the invoke IPC bridge', async () => {
    setContextIsolation(false);

    await import('./preload.js');

    void window.api.openLocalFile('../../src/generated/apical-excel-cache/apical-event-1001.xlsx');

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      RequestOpenLocalFileIpcInvokeChannel,
      '../../src/generated/apical-excel-cache/apical-event-1001.xlsx'
    );
  });
});
