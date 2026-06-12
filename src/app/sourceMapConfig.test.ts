import { readFile } from 'node:fs/promises';

import { mainConfig } from '../../webpack.main.config.ts';
import { rendererConfig } from '../../webpack.renderer.config.ts';

describe('source map configuration', () => {
  it('installs source-map stack remapping in every Electron entry point', async () => {
    const [mainEntry, preloadEntry, rendererEntry] = await Promise.all([
      readFile('src/app/index.ts', 'utf-8'),
      readFile('src/app/preload.ts', 'utf-8'),
      readFile('src/app/renderer.ts', 'utf-8'),
    ]);

    expect(mainEntry).toContain("import './runtimeSourceMaps.ts';");
    expect(preloadEntry).toContain("import './runtimeSourceMaps.ts';");
    expect(rendererEntry).toContain("import './runtimeSourceMaps.ts';");
  });

  it('emits full source maps for Electron main and renderer bundles', () => {
    expect(mainConfig.devtool).toBe('source-map');
    expect(rendererConfig.devtool).toBe('source-map');
  });

  it('resolves TypeScript files after NodeNext import extension rewriting', () => {
    expect(mainConfig.resolve?.extensionAlias).toEqual({
      '.js': ['.js', '.ts', '.tsx'],
      '.jsx': ['.jsx', '.tsx'],
    });
    expect(rendererConfig.resolve?.extensionAlias).toEqual({
      '.js': ['.js', '.ts', '.tsx'],
      '.jsx': ['.jsx', '.tsx'],
    });
  });

  it('keeps TypeScript source maps enabled for loader input', async () => {
    const tsconfig = await readFile('tsconfig.json', 'utf-8');

    expect(tsconfig).toContain('"sourceMap": true');
  });
});
