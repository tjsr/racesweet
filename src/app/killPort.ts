import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DEFAULT_PORT = 3488;

type Platform = NodeJS.Platform;

type CommandResult = {
  stdout: string;
};

type CommandRunner = (
  file: string,
  args: readonly string[]
) => Promise<CommandResult>;

type ProcessTerminator = (pid: number) => void;

export const parsePort = (args: readonly string[]): number => {
  const portText = args[0] ?? `${DEFAULT_PORT}`;
  const port = Number(portText);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Expected a TCP port from 1 to 65535, received "${portText}".`);
  }

  return port;
};

export const parseWindowsListeningPids = (netstatOutput: string, port: number): number[] => {
  const portSuffix = `:${port}`;

  return [...new Set(
    netstatOutput
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/))
      .filter((columns) => columns[0]?.toUpperCase() === 'TCP')
      .filter((columns) => columns[1]?.endsWith(portSuffix))
      .filter((columns) => columns[3]?.toUpperCase() === 'LISTENING')
      .map((columns) => Number(columns[4]))
      .filter((pid) => Number.isInteger(pid) && pid > 0)
  )];
};

export const parseLinuxListeningPids = (ssOutput: string): number[] => (
  [...new Set(
    [...ssOutput.matchAll(/pid=(\d+)/g)]
      .map((match) => Number(match[1]))
      .filter((pid) => Number.isInteger(pid) && pid > 0)
  )]
);

export const parseLsofListeningPids = (lsofOutput: string): number[] => (
  [...new Set(
    lsofOutput
      .split(/\r?\n/)
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0)
  )]
);

export const findListeningPids = async (
  port: number,
  platform: Platform = process.platform,
  runCommand: CommandRunner = execFileAsync
): Promise<number[]> => {
  if (platform === 'win32') {
    const { stdout } = await runCommand('netstat', ['-ano', '-p', 'tcp']);

    return parseWindowsListeningPids(stdout, port);
  }

  try {
    const { stdout } = await runCommand('ss', ['-ltnp', `sport = :${port}`]);

    return parseLinuxListeningPids(stdout);
  } catch {
    const { stdout } = await runCommand('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN']);

    return parseLsofListeningPids(stdout);
  }
};

export const terminatePids = (
  pids: readonly number[],
  terminateProcess: ProcessTerminator = (pid) => process.kill(pid)
): void => {
  pids.forEach((pid) => {
    terminateProcess(pid);
  });
};

export const killPort = async (
  args: readonly string[],
  platform: Platform = process.platform,
  runCommand: CommandRunner = execFileAsync,
  terminateProcess?: ProcessTerminator
): Promise<number[]> => {
  const port = parsePort(args);
  const pids = await findListeningPids(port, platform, runCommand);

  terminatePids(pids, terminateProcess);

  return pids;
};

const main = async (): Promise<void> => {
  try {
    const port = parsePort(process.argv.slice(2));
    const pids = await killPort([`${port}`]);

    if (pids.length === 0) {
      console.log(`No process is listening on port ${port}.`);
      return;
    }

    console.log(`Terminated process${pids.length === 1 ? '' : 'es'} on port ${port}: ${pids.join(', ')}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
};

if (require.main === module) {
  void main();
}
