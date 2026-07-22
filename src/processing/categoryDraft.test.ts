import { describe, expect, it } from 'vitest';
import { buildCategoryChanges } from './categoryDraft.js';

describe('buildCategoryChanges', () => {
  it('preserves the category command mapping used by the category editor', () => {
    expect(buildCategoryChanges({
      code: 'P',
      description: 'Premier',
      distanceRuleKind: 'laps',
      distanceRuleValue: '12',
      excludeFromResults: false,
      identityMode: 'multiple',
      isPlaceholder: false,
      maxRiderAge: '45',
      maxTeamSize: '4',
      minRiderAge: '18',
      name: 'Premier',
      teamCompositionRules: '2 riders',
    })).toEqual(expect.objectContaining({
      code: 'P',
      distanceRule: { kind: 'laps', value: 12 },
      name: 'Premier',
      teamRules: expect.objectContaining({
        maxRiderAge: 45,
        maxTeamSize: 4,
        minRiderAge: 18,
      }),
    }));
  });

  it('retains the existing invalid lap-distance error', () => {
    expect(() => buildCategoryChanges({
      code: '',
      description: '',
      distanceRuleKind: 'laps',
      distanceRuleValue: '1.5',
      excludeFromResults: false,
      identityMode: 'single',
      isPlaceholder: false,
      maxRiderAge: '',
      maxTeamSize: '',
      minRiderAge: '',
      name: 'Premier',
      teamCompositionRules: '',
    })).toThrow('Lap distance requires a whole-number lap count.');
  });
});
