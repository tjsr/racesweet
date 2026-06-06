import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

describe('package scripts', () => {
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
});
