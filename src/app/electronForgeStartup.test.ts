import path from 'node:path';

import {
  buildElectronForgeArgs,
  createElectronForgeEnv,
  describeElectronForgeSpawnError,
  ensureElectronForgeCliAvailable,
  getElectronForgeCliPath
} from './electronForgeStartup.js';

import { RACESWEET_SERVER_PORT_ENV } from './serverPort.js';

describe('electronForgeStartup', () => {
  it('resolves the local Electron Forge CLI path', () => {
    const installRoot = path.join('install-root');

    expect(getElectronForgeCliPath(installRoot)).toBe(
      path.join(installRoot, 'node_modules', '@electron-forge', 'cli', 'dist', 'electron-forge.js')
    );
  });

  it('passes app arguments through to Electron Forge', () => {
    expect(buildElectronForgeArgs([])).toEqual(['start']);
    expect(buildElectronForgeArgs(['--trace-warnings'])).toEqual(['start', '--', '--trace-warnings']);
  });

  it('sets the configured renderer server port in the Forge environment', () => {
    expect(createElectronForgeEnv(4567, { EXISTING: 'true' })).toMatchObject({
      EXISTING: 'true',
      [RACESWEET_SERVER_PORT_ENV]: '4567',
    });
  });

  it('checks that the startup CLI file is available', async () => {
    await expect(ensureElectronForgeCliAvailable('package.json')).resolves.toBeUndefined();
    await expect(ensureElectronForgeCliAvailable('missing-electron-forge-cli.js')).rejects.toThrow(
      'RaceSweet could not start Electron Forge because the CLI was not found'
    );
  });

  it('describes spawn errors with the command and port', () => {
    const message = describeElectronForgeSpawnError(
      new Error('spawn failed'),
      'C:\\RaceSweet\\node_modules\\@electron-forge\\cli\\dist\\electron-forge.js',
      3488
    );

    expect(message).toContain('RaceSweet attempted to start the Electron Forge webpack dev server');
    expect(message).toContain('Renderer server port: 3488');
    expect(message).toContain('Startup error: spawn failed');
  });
});
