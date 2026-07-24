// @vitest-environment jsdom

import { assertRendererApi, getRendererApi } from './rendererApi.js';

const createRendererApi = () => ({
  openExternalUrl: vi.fn(),
  openLocalFile: vi.fn(),
  receive: vi.fn(),
  requestBuffer: vi.fn(),
  requestExternalHttp: vi.fn(),
  requestFileContent: vi.fn(),
  selectLocalDirectory: vi.fn(),
  selectLocalFile: vi.fn(),
  send: vi.fn(),
  writeFileContent: vi.fn(),
});

describe('renderer API assertions', () => {
  afterEach(() => {
    delete (window as unknown as { api?: unknown }).api;
  });

  it('accepts a complete Electron preload API object', () => {
    const api = createRendererApi();

    expect(() => assertRendererApi(api)).not.toThrow();
  });

  it('throws a clear error when window.api was not populated by preload', () => {
    expect(() => getRendererApi()).toThrow(
      /RaceSweet Electron preload API is not available or incomplete[\s\S]*window\.api must be populated/
    );
  });

  it('lists missing IPC methods when the preload API is incomplete', () => {
    const api = {
      requestFileContent: vi.fn(),
    };

    expect(() => assertRendererApi(api)).toThrow(/Missing methods: receive, requestBuffer, requestExternalHttp, openLocalFile, openExternalUrl, selectLocalDirectory, selectLocalFile, send, writeFileContent/);
  });

  it('allows callers to assert only the IPC methods required for a specific operation', () => {
    const api = {
      writeFileContent: vi.fn(),
    };

    expect(() => assertRendererApi(api, ['writeFileContent'])).not.toThrow();
    expect(() => assertRendererApi(api, ['requestFileContent'])).toThrow(/Missing methods: requestFileContent/);
  });
});
