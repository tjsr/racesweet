import { findAvailablePort } from './findAvailablePort.ts';
import path from 'node:path';
import { spawn } from 'node:child_process';

const electronForgeCli = path.join(
  process.cwd(),
  'node_modules',
  '@electron-forge',
  'cli',
  'dist',
  'electron-forge.js'
);

const start = async (): Promise<void> => {
  const port = await findAvailablePort();
  const electronArgs = process.argv.slice(2);
  const forgeArgs = ['start'];

  if (electronArgs.length > 0) {
    forgeArgs.push('--', ...electronArgs);
  }

  console.log(`Starting Electron Forge webpack dev server on port ${port}`);

  const child = spawn(process.execPath, [electronForgeCli, ...forgeArgs], {
    env: {
      ...process.env,
      DEBUG_SERVER_PORT: String(port),
    },
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  child.on('error', (error) => {
    console.error(error);
    process.exit(1);
  });
};

start().catch((error: Error) => {
  console.error(error);
  process.exit(1);
});
