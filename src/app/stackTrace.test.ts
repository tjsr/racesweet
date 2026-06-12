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

    expect(remappedStack).toContain('at loadEvents (webpack://racesweet/./src/views/display/systemPage.tsx:97:7)');
    expect(remappedStack).toContain('at HTMLButtonElement.onclick (webpack://racesweet/./src/views/display/systemPage.tsx:98:7)');
    expect(mapPosition).toHaveBeenCalledWith({
      column: 55,
      line: 1234,
      source: 'http://localhost:3488/main_window/index.js',
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
