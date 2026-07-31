import { parseTeamCompositionRules } from '../app/categoryRules.js';
import { type CategoryDistanceRule, type EventCatalogCategory, type TimingStartCalculation } from '../catalog/eventCatalog.js';
import { parseInteger } from '../parsers/parseInteger.js';

export type CategoryChanges = Partial<Pick<EventCatalogCategory, 'code' | 'description' | 'distanceRule' | 'elapsedTimeCalculation' | 'excludeFromResults' | 'isPlaceholder' | 'lap1Calculation' | 'name' | 'teamRules'>>;

export interface CategoryDraftInput {
  code: string;
  description: string;
  distanceRuleKind: CategoryDistanceRule['kind'];
  distanceRuleValue: string;
  elapsedTimeCalculation?: string;
  excludeFromResults: boolean;
  identityMode: 'single' | 'multiple';
  isPlaceholder: boolean;
  lap1Calculation?: string;
  maxRiderAge: string;
  maxTeamSize: string;
  minRiderAge: string;
  name: string;
  teamCompositionRules: string;
}

export const buildCategoryChanges = (draft: CategoryDraftInput): CategoryChanges => {
  const getTimingStartCalculation = (value: string | undefined): TimingStartCalculation | null => value === 'first-start' || value === 'category-start' ? value : null;
  let distanceRule: CategoryDistanceRule;
  if (draft.distanceRuleKind === 'unspecified') {
    distanceRule = { kind: 'unspecified' };
  } else if (draft.distanceRuleKind === 'time') {
    if (draft.distanceRuleValue.trim().length === 0) {
      throw new Error('Time distance requires a value in minutes or h:mm format.');
    }
    distanceRule = {
      kind: 'time',
      value: draft.distanceRuleValue.trim(),
    };
  } else {
    const laps: number = Number(draft.distanceRuleValue);
    if (!Number.isInteger(laps) || laps <= 0) {
      throw new Error('Lap distance requires a whole-number lap count.');
    }
    distanceRule = {
      kind: 'laps',
      value: laps,
    };
  }

  return {
    code: draft.code || undefined,
    description: draft.description || undefined,
    distanceRule,
    elapsedTimeCalculation: getTimingStartCalculation(draft.elapsedTimeCalculation),
    excludeFromResults: draft.excludeFromResults,
    isPlaceholder: draft.isPlaceholder,
    lap1Calculation: getTimingStartCalculation(draft.lap1Calculation),
    name: draft.name,
    teamRules: {
      identityMode: draft.identityMode,
      maxRiderAge: parseInteger(draft.maxRiderAge),
      maxTeamSize: parseInteger(draft.maxTeamSize),
      minRiderAge: parseInteger(draft.minRiderAge),
      teamCompositionRules: parseTeamCompositionRules(draft.teamCompositionRules),
    },
  };
};
