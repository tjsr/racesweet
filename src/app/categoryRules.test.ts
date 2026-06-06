import {
  formatCategoryDistanceRule,
  formatCategorySessionAssignments,
  formatTeamCompositionRules,
  parseCategoryDistanceRule,
  parseCategorySessionAssignments,
  parseTeamCompositionRules,
} from './categoryRules.js';

describe('categoryRules', () => {
  it('parses distance as unspecified, time, or laps', () => {
    expect(parseCategoryDistanceRule('')).toEqual({ kind: 'unspecified' });
    expect(parseCategoryDistanceRule('45')).toEqual({ kind: 'time', value: '45' });
    expect(parseCategoryDistanceRule('1:30')).toEqual({ kind: 'time', value: '1:30' });
    expect(parseCategoryDistanceRule('12')).toEqual({ kind: 'laps', value: 12 });
  });

  it('formats distance rules for UI inputs', () => {
    expect(formatCategoryDistanceRule({ kind: 'unspecified' })).toBe('');
    expect(formatCategoryDistanceRule({ kind: 'time', value: '1:15' })).toBe('1:15');
    expect(formatCategoryDistanceRule({ kind: 'laps', value: 8 })).toBe('8');
  });

  it('parses and formats team composition rules', () => {
    const parsed = parseTeamCompositionRules('female:1:2; male:0:3');
    expect(parsed).toEqual([
      { gender: 'female', max: 2, min: 1 },
      { gender: 'male', max: 3, min: 0 },
    ]);
    expect(formatTeamCompositionRules(parsed)).toBe('female:1:2; male:0:3');
  });

  it('parses and formats category session assignments', () => {
    const parsed = parseCategorySessionAssignments('session-1@2026-06-12T09:00:00.000Z; session-2@2026-06-13T13:00:00.000Z');
    expect(parsed).toEqual([
      { sessionId: 'session-1', startTime: '2026-06-12T09:00:00.000Z' },
      { sessionId: 'session-2', startTime: '2026-06-13T13:00:00.000Z' },
    ]);
    expect(formatCategorySessionAssignments(parsed)).toBe('session-1@2026-06-12T09:00:00.000Z; session-2@2026-06-13T13:00:00.000Z');
  });
});
