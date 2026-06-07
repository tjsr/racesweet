import type { Reporter } from 'vitest/reporters';
import { UserConsoleLog } from 'vitest';

const formatEntityName = (log: UserConsoleLog): string => {
  const name = log.origin;
  return name ? ` in ${name}` : '';
};

export const failOnStderrReporter = (): Reporter => ({
  onUserConsoleLog: (log) => {
    if (log.type !== 'stderr') {
      return;
    }

    process.exitCode = 1;
    process.stderr.write(`Unexpected stderr output${formatEntityName(log)}:\n${log.content}\n`);
  },
});
