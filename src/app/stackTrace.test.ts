import { formatErrorForDisplay, remapStackTrace } from './stackTrace.ts';

describe('stack trace formatting', () => {
  it('remaps compiled stack frame positions to original source positions', () => {
    const stack = [
      'Error: Request failed',
      '    at loadEvents (http://localhost:3488/main_window/index.js:1234:56)',
      '    at HTMLButtonElement.onclick (webpack://racesweet/./src/views/display/systemPage.tsx:98:7)',
    ].join('\n');
    const mapPosition = vi.fn((position) => {
      if (position.source === 'http://localhost:3488/main_window/index.js') {
        return {
          column: 6,
          line: 97,
          source: 'webpack://racesweet/./src/views/display/systemPage.tsx',
        };
      }

      return position;
    });

    const remappedStack = remapStackTrace(stack, mapPosition);

    expect(remappedStack).toContain('at loadEvents [systemPage.tsx:97] (webpack://racesweet/./src/views/display/systemPage.tsx:97:7)');
    expect(remappedStack).toContain('at HTMLButtonElement.onclick [systemPage.tsx:98] (webpack://racesweet/./src/views/display/systemPage.tsx:98:7)');
    expect(mapPosition).toHaveBeenCalledWith({
      column: 55,
      line: 1234,
      source: 'http://localhost:3488/main_window/index.js',
    });
  });

  it('adds the mapped source filename next to named stack methods', () => {
    const stack = [
      'Error: Request failed',
      '    at fetchApicalResponse (http://localhost:3488/main_window/index.js:1234:56)',
      '    at async fetchApicalDataFilePayload (http://localhost:3488/main_window/index.js:1300:3)',
    ].join('\n');
    const mapPosition = vi.fn((position) => ({
      column: 4,
      line: position.line === 1234 ? 203 : 402,
      source: 'webpack://racesweet/./src/app/apicalDataSource.ts',
    }));

    const remappedStack = remapStackTrace(stack, mapPosition);

    expect(remappedStack).toContain('at fetchApicalResponse [apicalDataSource.ts:203] (webpack://racesweet/./src/app/apicalDataSource.ts:203:5)');
    expect(remappedStack).toContain('at async fetchApicalDataFilePayload [apicalDataSource.ts:402] (webpack://racesweet/./src/app/apicalDataSource.ts:402:5)');
  });

  it('tries local webpack renderer bundle paths when URL frame mapping misses', () => {
    const stack = [
      'Error: Request failed',
      '    at loadEvents (http://localhost:3488/main_window/index.js:2345:67)',
    ].join('\n');
    const mapPosition = vi.fn((position) => {
      if (position.source.endsWith('\\.webpack\\renderer\\main_window\\index.js')) {
        return {
          column: 3,
          line: 144,
          source: 'webpack://racesweet/./src/views/display/systemPage.tsx',
        };
      }

      return position;
    });

    const remappedStack = remapStackTrace(stack, mapPosition);

    expect(remappedStack).toContain('at loadEvents [systemPage.tsx:144] (webpack://racesweet/./src/views/display/systemPage.tsx:144:4)');
    expect(mapPosition).toHaveBeenCalledWith({
      column: 66,
      line: 2345,
      source: 'http://localhost:3488/main_window/index.js',
    });
    expect(mapPosition).toHaveBeenCalledWith({
      column: 66,
      line: 2345,
      source: `${process.cwd()}\\.webpack\\renderer\\main_window\\index.js`,
    });
  });

  it('formats errors for display with remapped stack lines', () => {
    const error = new Error('Failed to fetch');
    error.stack = [
      'Error: Failed to fetch',
      '    at C:\\dev\\racesweet\\.webpack\\x64\\renderer\\main_window\\index.js:200:11',
    ].join('\n');

    const formattedError = formatErrorForDisplay(error);

    expect(formattedError).toContain('Failed to fetch');
    expect(formattedError).toContain('C:\\dev\\racesweet\\.webpack\\x64\\renderer\\main_window\\index.js:200:11');
  });
});
