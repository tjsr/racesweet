import { access } from 'node:fs/promises';
import path from 'node:path';

import { RACESWEET_SERVER_PORT_ENV } from './serverPort.ts';

export const getElectronForgeCliPath = (cwd: string = process.cwd()): string =>
  path.join(cwd, 'node_modules', '@electron-forge', 'cli', 'dist', 'electron-forge.js');

export const buildElectronForgeArgs = (electronArgs: readonly string[]): string[] => {
  const forgeArgs = ['start'];

  if (electronArgs.length > 0) {
    forgeArgs.push('--', ...electronArgs);
  }

  return forgeArgs;
};

export const createElectronForgeEnv = (
  port: number,
  env: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv => ({
  ...env,
  [RACESWEET_SERVER_PORT_ENV]: String(port),
});

export const ensureElectronForgeCliAvailable = async (cliPath: string): Promise<void> => {
  try {
    await access(cliPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `RaceSweet could not start Electron Forge because the CLI was not found at ${cliPath}. Run npm i and try again. Original error: ${message}`
    );
  }
};

export const describeElectronForgeSpawnError = (error: Error, cliPath: string, port: number): string =>
  [
    'RaceSweet attempted to start the Electron Forge webpack dev server, but the process could not be launched.',
    `Command: ${process.execPath} ${cliPath} start`,
    `Renderer server port: ${port}`,
    `Startup error: ${error.message}`,
  ].join(' ');
