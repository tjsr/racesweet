import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const findTestFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return findTestFiles(entryPath);
    }

    const isIntegrationTest =
      entry.name.endsWith('.integration.test.ts') ||
      entry.name.endsWith('.integration.test.tsx') ||
      entry.name.endsWith('.live.integration.test.ts') ||
      entry.name.endsWith('.live.integration.test.tsx');

    return entry.isFile() && isIntegrationTest ? [entryPath] : [];
  }));

  return nestedFiles.flat();
};

const vitestBin = path.resolve('node_modules/vitest/vitest.mjs');
const testFiles = await findTestFiles('src');
const vitestArgs = [
  vitestBin,
  'run',
  ...testFiles,
];

const child = spawn(process.execPath, vitestArgs, {
  env: {
    ...process.env,
    RACESWEET_LIVE_APICAL: '1',
  },
  shell: false,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`Integration test run terminated by signal ${signal}`);
    process.exitCode = 1;
    return;
  }

  process.exitCode = code ?? 1;
});
