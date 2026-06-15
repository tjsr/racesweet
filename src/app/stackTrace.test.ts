import { formatErrorForDisplay, remapStackTrace } from './stackTrace.ts';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SourceMapGenerator } from 'source-map-support/node_modules/source-map';

describe('stack trace formatting', () => {
  afterEach(async () => {
    await rm(path.join(tmpdir(), 'racesweet-stacktrace-test'), { force: true, recursive: true });
  });

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

  it('formats generated webpack frames with original TypeScript source-map locations', async () => {
    const bundleDir = path.join(tmpdir(), 'racesweet-stacktrace-test', '.webpack', 'renderer', 'main_window');
    const bundlePath = path.join(bundleDir, 'index.js');
    const generator = new SourceMapGenerator({ file: 'index.js' });
    generator.addMapping({
      generated: {
        column: 10,
        line: 200,
      },
      original: {
        column: 4,
        line: 321,
      },
      source: './src/app/apicalDataSource.ts',
    });
    generator.setSourceContent('./src/app/apicalDataSource.ts', 'throw new Error("Apical failed");');
    await mkdir(bundleDir, { recursive: true });
    await writeFile(`${bundlePath}.map`, generator.toString(), 'utf8');

    const error = new Error('Failed to fetch Apical events');
    error.stack = [
      'Error: Failed to fetch Apical events',
      `    at fetchApicalResponse (${bundlePath}:200:11)`,
    ].join('\n');

    const formattedError = formatErrorForDisplay(error);

    expect(formattedError).toContain('at fetchApicalResponse [apicalDataSource.ts:321] (webpack://racesweet/./src/app/apicalDataSource.ts:321:5)');
    expect(formattedError).not.toContain(`${bundlePath}:200:11`);
  });

  it('normalizes Electron renderer source-map paths that contain embedded webpack source paths', () => {
    const stack = [
      'Error: Failed to fetch Apical data',
      '    at fetchApicalRaceStateNow (webpack://racesweet/./h:/dev/racesweet/.webpack/renderer/main_window/webpack:/racesweet/src/app/apicalDataSource.ts:412:11)',
      '    at validateCookie (webpack://racesweet/./h:/dev/racesweet/.webpack/renderer/main_window/webpack:/racesweet/src/utils/apical/apicalEventSpreadsheet.ts:37:11)',
    ].join('\n');

    const formattedError = remapStackTrace(stack);

    expect(formattedError).toContain('webpack://racesweet/./src/app/apicalDataSource.ts:412:11');
    expect(formattedError).toContain('webpack://racesweet/./src/utils/apical/apicalEventSpreadsheet.ts:37:11');
    expect(formattedError).not.toContain('.webpack/renderer/main_window/webpack:');
  });

  it('includes nested causes when formatting errors for display', () => {
    const cause = new Error('Apical Excel download request returned HTTP 403 Forbidden.');
    const error = new Error('Failed to fetch Apical data from url https://apical.example.com/RaceResult/Event/ExportToExcel?eventId=301', {
      cause,
    });

    const formattedError = formatErrorForDisplay(error);

    expect(formattedError).toContain('Failed to fetch Apical data from url https://apical.example.com/RaceResult/Event/ExportToExcel?eventId=301');
    expect(formattedError).toContain('Caused by:');
    expect(formattedError).toContain('Apical Excel download request returned HTTP 403 Forbidden.');
  });
});
