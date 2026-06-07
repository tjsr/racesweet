import { spawn } from 'node:child_process';

import {
  buildElectronForgeArgs,
  createElectronForgeEnv,
  describeElectronForgeSpawnError,
  ensureElectronForgeCliAvailable,
  getElectronForgeCliPath
} from './electronForgeStartup.ts';
import { getRaceSweetServerPort } from './serverPort.ts';

const start = async (): Promise<void> => {
  const port = getRaceSweetServerPort();
  const electronForgeCli = getElectronForgeCliPath();
  const electronArgs = process.argv.slice(2);
  const forgeArgs = buildElectronForgeArgs(electronArgs);

  await ensureElectronForgeCliAvailable(electronForgeCli);
  console.log(`Starting Electron Forge webpack dev server on port ${port}`);

  const child = spawn(process.execPath, [electronForgeCli, ...forgeArgs], {
    env: createElectronForgeEnv(port),
    stdio: 'inherit',
  });

  child.once('spawn', () => {
    console.log(`Electron Forge process started. Waiting for webpack content server on port ${port}`);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  child.on('error', (error) => {
    console.error(describeElectronForgeSpawnError(error, electronForgeCli, port));
    process.exit(1);
  });
};

start().catch((error: Error) => {
  console.error(error);
  process.exit(1);
});
