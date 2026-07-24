import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const executeFile = promisify(execFile);
const workspaceRoot = process.cwd();
const dockerfilePath = path.join(workspaceRoot, 'scripts', 'fmptools', 'Dockerfile.win32');
const outputDirectory = path.join(workspaceRoot, 'packages', 'fmptools-win32-x64', 'bin');
const outputFile = path.join(outputDirectory, 'fmp2json.exe');

await rm(outputFile, { force: true });
await mkdir(outputDirectory, { recursive: true });

try {
  await executeFile('docker', [
    'build',
    '--file', dockerfilePath,
    '--output', `type=local,dest=${outputDirectory}`,
    '--target', 'artifact',
    workspaceRoot,
  ], { windowsHide: true });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`Could not build the isolated Windows fmp2json package. Start Docker Desktop and retry npm run build:fmptools:win32. ${message}`);
}

if (!existsSync(outputFile)) {
  throw new Error(`Docker completed without creating ${outputFile}.`);
}
