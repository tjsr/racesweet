import { describe, expect, it, vi } from 'vitest';

import {
  findListeningPids,
  killPort,
  parseLinuxListeningPids,
  parseLsofListeningPids,
  parsePort,
  parseWindowsListeningPids,
  terminatePids,
} from './killPort';

describe('killPort', () => {
  it('uses 3488 as the default port', () => {
    expect(parsePort([])).toBe(3488);
  });

  it('accepts a supplied port', () => {
    expect(parsePort(['3000'])).toBe(3000);
  });

  it('rejects invalid ports', () => {
    expect(() => parsePort(['0'])).toThrow('Expected a TCP port');
    expect(() => parsePort(['65536'])).toThrow('Expected a TCP port');
    expect(() => parsePort(['abc'])).toThrow('Expected a TCP port');
  });

  it('parses Windows netstat listening process IDs for the requested port', () => {
    const netstatOutput = [
      'Proto  Local Address          Foreign Address        State           PID',
      'TCP    0.0.0.0:3488           0.0.0.0:0              LISTENING       1234',
      'TCP    [::]:3488              [::]:0                 LISTENING       1234',
      'TCP    127.0.0.1:3489         0.0.0.0:0              LISTENING       9999',
      'TCP    127.0.0.1:3488         127.0.0.1:51000        ESTABLISHED     8888',
    ].join('\n');

    expect(parseWindowsListeningPids(netstatOutput, 3488)).toEqual([1234]);
  });

  it('parses Linux ss listening process IDs', () => {
    const ssOutput = [
      'State  Recv-Q Send-Q Local Address:Port Peer Address:PortProcess',
      'LISTEN 0      511          0.0.0.0:3488      0.0.0.0:*    users:(("node",pid=4321,fd=21))',
      'LISTEN 0      511             [::]:3488         [::]:*    users:(("node",pid=4321,fd=22))',
    ].join('\n');

    expect(parseLinuxListeningPids(ssOutput)).toEqual([4321]);
  });

  it('parses lsof fallback process IDs', () => {
    expect(parseLsofListeningPids('9876\n9876\n5432\n')).toEqual([9876, 5432]);
  });

  it('finds listening process IDs on Windows', async () => {
    const runCommand = vi.fn().mockResolvedValue({
      stdout: 'TCP    0.0.0.0:3488           0.0.0.0:0              LISTENING       1234',
    });

    await expect(findListeningPids(3488, 'win32', runCommand)).resolves.toEqual([1234]);
    expect(runCommand).toHaveBeenCalledWith('netstat', ['-ano', '-p', 'tcp']);
  });

  it('falls back to lsof on Linux when ss is unavailable', async () => {
    const runCommand = vi.fn()
      .mockRejectedValueOnce(new Error('ss missing'))
      .mockResolvedValueOnce({ stdout: '2468\n' });

    await expect(findListeningPids(3488, 'linux', runCommand)).resolves.toEqual([2468]);
    expect(runCommand).toHaveBeenLastCalledWith('lsof', ['-ti', 'tcp:3488', '-sTCP:LISTEN']);
  });

  it('terminates every listening process found for the port', async () => {
    const runCommand = vi.fn().mockResolvedValue({
      stdout: 'State  Recv-Q Send-Q Local Address:Port Peer Address:PortProcess\n' +
        'LISTEN 0      511          0.0.0.0:3488      0.0.0.0:*    users:(("node",pid=1357,fd=21))',
    });
    const terminateProcess = vi.fn();

    await expect(killPort([], 'linux', runCommand, terminateProcess)).resolves.toEqual([1357]);
    expect(terminateProcess).toHaveBeenCalledWith(1357);
  });

  it('does not terminate anything when no process is listening', () => {
    const terminateProcess = vi.fn();

    terminatePids([], terminateProcess);

    expect(terminateProcess).not.toHaveBeenCalled();
  });
});
