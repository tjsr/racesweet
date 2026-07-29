import { requiresApplicationRestart } from './restartVersion.js';

describe('requiresApplicationRestart', () => {
  it('requires a restart only when the code version is later than the launched version', () => {
    expect(requiresApplicationRestart('2026-07-29T00:00:00.000Z', '2026-07-29T00:00:01.000Z')).toBe(true);
    expect(requiresApplicationRestart('2026-07-29T00:00:01.000Z', '2026-07-29T00:00:01.000Z')).toBe(false);
    expect(requiresApplicationRestart('2026-07-29T00:00:02.000Z', '2026-07-29T00:00:01.000Z')).toBe(false);
  });

  it('rejects invalid launch and required versions', () => {
    expect((): boolean => requiresApplicationRestart('invalid', '2026-07-29T00:00:01.000Z')).toThrow(
      'Application restart versions must be valid ISO date-time values.',
    );
    expect((): boolean => requiresApplicationRestart('2026-07-29T00:00:01.000Z', 'invalid')).toThrow(
      'Application restart versions must be valid ISO date-time values.',
    );
  });
});
