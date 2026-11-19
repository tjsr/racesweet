import type { UserConsoleLog } from 'vitest';
import type { Reporter } from 'vitest/node';

const formatEntityName = (log: UserConsoleLog): string => {
  const name: string | undefined = log.origin;
  return name ? ` in ${name}` : '';
};

export const failOnStderrReporter = (): Reporter => ({
  onUserConsoleLog: (log: UserConsoleLog): void => {
    if (log.type !== 'stderr') {
      return;
    }

    process.exitCode = 1;
    process.stderr.write(`Unexpected stderr output${formatEntityName(log)}:\n${log.content}\n`);
  },
});
