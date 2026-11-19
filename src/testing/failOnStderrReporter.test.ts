import type { MockInstance, UserConsoleLog } from 'vitest';
import type { Reporter } from 'vitest/node';

import { failOnStderrReporter } from './failOnStderrReporter.js';

const createConsoleLog = (
  type: UserConsoleLog['type'],
  content: string,
  origin?: string,
): UserConsoleLog => ({ content, origin, size: 1, taskId: 'test-id', time: 0, type });

describe('failOnStderrReporter', (): void => {
  const originalExitCode: typeof process.exitCode = process.exitCode;

  afterEach((): void => {
    process.exitCode = originalExitCode;
  });

  it('marks the run failed when Vitest captures stderr without an origin', (): void => {
    const writeSpy: MockInstance<typeof process.stderr.write> = vi.spyOn(process.stderr, 'write')
      .mockImplementation((): boolean => true);
    const reporter: Reporter = failOnStderrReporter();
    const log: UserConsoleLog = createConsoleLog('stderr', 'bad output');

    reporter.onUserConsoleLog?.(log);

    expect(process.exitCode).toBe(1);
    expect(writeSpy).toHaveBeenCalledWith('Unexpected stderr output:\nbad output\n');
  });

  it('includes the origin of captured stderr', (): void => {
    const writeSpy: MockInstance<typeof process.stderr.write> = vi.spyOn(process.stderr, 'write')
      .mockImplementation((): boolean => true);
    const reporter: Reporter = failOnStderrReporter();
    const log: UserConsoleLog = createConsoleLog('stderr', 'bad output', 'noisy test');

    reporter.onUserConsoleLog?.(log);

    expect(process.exitCode).toBe(1);
    expect(writeSpy).toHaveBeenCalledWith('Unexpected stderr output in noisy test:\nbad output\n');
  });

  it('ignores stdout', (): void => {
    const writeSpy: MockInstance<typeof process.stderr.write> = vi.spyOn(process.stderr, 'write')
      .mockImplementation((): boolean => true);
    const reporter: Reporter = failOnStderrReporter();
    const log: UserConsoleLog = createConsoleLog('stdout', 'debug output', 'chatty test');

    reporter.onUserConsoleLog?.(log);

    expect(process.exitCode).toBe(originalExitCode);
    expect(writeSpy).not.toHaveBeenCalled();
  });
});
