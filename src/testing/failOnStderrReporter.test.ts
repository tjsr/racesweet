import { failOnStderrReporter } from './failOnStderrReporter';

describe('failOnStderrReporter', () => {
  const originalExitCode = process.exitCode;

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it('marks the run failed when Vitest captures stderr', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const reporter = failOnStderrReporter();

    reporter.onUserConsoleLog?.({
      content: 'bad output',
      task: { name: 'noisy test' },
      type: 'stderr',
    } as Parameters<NonNullable<typeof reporter.onUserConsoleLog>>[0]);

    expect(process.exitCode).toBe(1);
    expect(writeSpy).toHaveBeenCalledWith('Unexpected stderr output in noisy test:\nbad output\n');
  });

  it('ignores stdout', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const reporter = failOnStderrReporter();

    reporter.onUserConsoleLog?.({
      content: 'debug output',
      task: { name: 'chatty test' },
      type: 'stdout',
    } as Parameters<NonNullable<typeof reporter.onUserConsoleLog>>[0]);

    expect(process.exitCode).toBe(originalExitCode);
    expect(writeSpy).not.toHaveBeenCalled();
  });
});
