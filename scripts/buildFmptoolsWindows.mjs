import { readFile } from 'node:fs/promises';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const executeFile = promisify(execFile);
const windowsTargets = {
  arm64: {
    packageDirectory: 'fmptools-win32-arm64',
    peMachine: 0xaa64,
    targetTriple: 'aarch64-w64-mingw32',
  },
  x64: {
    packageDirectory: 'fmptools-win32-x64',
    peMachine: 0x8664,
    targetTriple: 'x86_64-w64-mingw32',
  },
};

const targetArchitecture = process.argv[2] || 'x64';
const target = windowsTargets[targetArchitecture];

if (!target) {
  throw new Error(`Unsupported Windows architecture "${targetArchitecture}". Use x64 or arm64.`);
}

const workspaceRoot = process.cwd();
const dockerfilePath = path.join(workspaceRoot, 'scripts', 'fmptools', 'Dockerfile.win32');
const outputDirectory = path.join(workspaceRoot, 'packages', target.packageDirectory, 'bin');
const outputFile = path.join(outputDirectory, 'fmp2json.exe');

const verifyWindowsExecutableArchitecture = (executable) => {
  if (executable.subarray(0, 2).toString('ascii') !== 'MZ') {
    throw new Error(`${outputFile} is not a Windows executable.`);
  }
  const peHeaderOffset = executable.readUInt32LE(0x3c);
  if (executable.subarray(peHeaderOffset, peHeaderOffset + 4).toString('ascii') !== 'PE\0\0') {
    throw new Error(`${outputFile} does not contain a valid PE header.`);
  }
  const peMachine = executable.readUInt16LE(peHeaderOffset + 4);
  if (peMachine !== target.peMachine) {
    throw new Error(`${outputFile} was built for PE machine 0x${peMachine.toString(16)}, expected ${targetArchitecture} (0x${target.peMachine.toString(16)}).`);
  }
};

await rm(outputFile, { force: true });
await mkdir(outputDirectory, { recursive: true });

try {
  await executeFile('docker', [
    'build',
    '--build-arg', `WINDOWS_TARGET_TRIPLE=${target.targetTriple}`,
    '--file', dockerfilePath,
    '--output', `type=local,dest=${outputDirectory}`,
    '--target', 'artifact',
    workspaceRoot,
  ], { windowsHide: true });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`Could not build the isolated Windows ${targetArchitecture} fmp2json package. Start Docker Desktop and retry npm run build:fmptools:win32:${targetArchitecture}. ${message}`);
}

const executable = await readFile(outputFile).catch(() => {
  throw new Error(`Docker completed without creating ${outputFile}.`);
});
verifyWindowsExecutableArchitecture(executable);
