/**
 * Advance this timestamp whenever a code change requires the Electron or web
 * application process to be restarted. It intentionally remains unchanged
 * during renderer reloads and hot recompilation.
 */
export const RESTART_REQUIRED_AFTER: string = '2026-07-31T09:35:44.000Z';

export const requiresApplicationRestart = (
  launchedVersion: string,
  requiredVersion: string = RESTART_REQUIRED_AFTER,
): boolean => {
  const launchedTime: number = Date.parse(launchedVersion);
  const requiredTime: number = Date.parse(requiredVersion);

  if (!Number.isFinite(launchedTime) || !Number.isFinite(requiredTime)) {
    throw new Error('Application restart versions must be valid ISO date-time values.');
  }

  return requiredTime > launchedTime;
};
