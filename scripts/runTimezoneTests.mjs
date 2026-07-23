import { spawnSync } from 'node:child_process';

const defaultTimezones = [
  'Australia/Sydney',
  'America/Indianapolis',
  'UTC',
];

const timezones = process.argv.slice(2);
const testTimezones = timezones.length > 0 ? timezones : defaultTimezones;

for (const timezone of testTimezones) {
  console.log(`\nRunning Vitest with TZ=${timezone}`);

  const result = spawnSync(
    process.execPath,
    ['./node_modules/vitest/vitest.mjs', 'run'],
    {
      env: {
        ...process.env,
        TZ: timezone,
      },
      stdio: 'inherit',
    },
  );

  if (result.error) {
    console.error(`Failed to run Vitest with TZ=${timezone}`);
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`Vitest failed with TZ=${timezone}`);
    process.exit(result.status ?? 1);
  }
}
