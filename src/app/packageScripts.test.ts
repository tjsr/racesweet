import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

describe('package scripts', () => {
  it('runs compile through Electron Forge so the Electron webpack bundle is generated', async () => {
    const packageJson = JSON.parse(
      await readFile(join(process.cwd(), 'package.json'), 'utf-8')
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.compile).toContain('npm run compile:electron');
    expect(packageJson.scripts?.['compile:electron']).toBe('electron-forge package');
    expect(packageJson.scripts?.compile).not.toContain('webpack.main.config');
  });

  it('runs serve through Electron Forge so renderer preload output is built', async () => {
    const packageJson = JSON.parse(
      await readFile(join(process.cwd(), 'package.json'), 'utf-8')
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.serve).toContain('startElectronForge');
    expect(packageJson.scripts?.serve).not.toContain('webpack.main.config');
  });

  it('runs kill-port through the portable TypeScript CLI', async () => {
    const packageJson = JSON.parse(
      await readFile(join(process.cwd(), 'package.json'), 'utf-8')
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.['kill-port']).toBe('tsx ./src/app/killPort.ts');
  });

  it('has a portable CLI for waiting on Electron dev assets', async () => {
    const packageJson = JSON.parse(
      await readFile(join(process.cwd(), 'package.json'), 'utf-8')
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.['wait:electron-assets']).toBe('tsx ./src/app/waitForElectronAssets.ts');
  });
});
