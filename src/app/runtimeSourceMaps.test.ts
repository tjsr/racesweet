import { enableRuntimeSourceMaps } from './runtimeSourceMaps.ts';

describe('enableRuntimeSourceMaps', () => {
  it('enables native source-map stack remapping and installs a runtime fallback', () => {
    const enableSourceMaps = vi.fn();
    const installSourceMapSupport = vi.fn();

    enableRuntimeSourceMaps(enableSourceMaps, installSourceMapSupport);

    expect(enableSourceMaps).toHaveBeenCalledWith(true);
    expect(installSourceMapSupport).toHaveBeenCalledWith({
      environment: 'node',
      handleUncaughtExceptions: false,
    });
  });

  it('still installs the runtime fallback when native source maps are unavailable', () => {
    const installSourceMapSupport = vi.fn();

    enableRuntimeSourceMaps(undefined, installSourceMapSupport);

    expect(installSourceMapSupport).toHaveBeenCalledWith({
      environment: 'node',
      handleUncaughtExceptions: false,
    });
  });

  it('uses browser source-map retrieval in Electron renderer processes', () => {
    const installSourceMapSupport = vi.fn();

    enableRuntimeSourceMaps(undefined, installSourceMapSupport, { type: 'renderer' } as NodeJS.Process & { type: string });

    expect(installSourceMapSupport).toHaveBeenCalledWith({
      environment: 'browser',
      handleUncaughtExceptions: false,
    });
  });
});
