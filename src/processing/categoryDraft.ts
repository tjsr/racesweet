import { parseTeamCompositionRules } from '../app/categoryRules.js';
import { type CategoryDistanceRule, type EventCatalogCategory } from '../catalog/eventCatalog.js';
import { parseInteger } from '../parsers/parseInteger.js';

export type CategoryChanges = Partial<Pick<EventCatalogCategory, 'code' | 'description' | 'distanceRule' | 'excludeFromResults' | 'isPlaceholder' | 'name' | 'teamRules'>>;

export interface CategoryDraftInput {
  code: string;
  description: string;
  distanceRuleKind: CategoryDistanceRule['kind'];
  distanceRuleValue: string;
  excludeFromResults: boolean;
  identityMode: 'single' | 'multiple';
  isPlaceholder: boolean;
  maxRiderAge: string;
  maxTeamSize: string;
  minRiderAge: string;
  name: string;
  teamCompositionRules: string;
}

export const buildCategoryChanges = (draft: CategoryDraftInput): CategoryChanges => {
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
    excludeFromResults: draft.excludeFromResults,
    isPlaceholder: draft.isPlaceholder,
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
