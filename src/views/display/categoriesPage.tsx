import {
  formatTeamCompositionRules,
} from '../../app/categoryRules.js';
import {
  type CategoryDistanceRule,
  type EventCatalogCategory,
  type EventCatalogEntrant,
  type EventCatalogState,
} from '../../catalog/eventCatalog.js';
import { EventCategoryId } from '../../model/eventcategory.js';
import { EventId } from '../../model/raceevent.js';
import { type UnsavedChangesGuard } from './unsavedChangesWarning.js';

export type CategoryChanges = Partial<Pick<EventCatalogCategory, 'code' | 'description' | 'distanceRule' | 'elapsedTimeCalculation' | 'excludeFromResults' | 'isPlaceholder' | 'lap1Calculation' | 'name' | 'teamRules'>>;

export interface CategoriesPageProps {
  catalog: EventCatalogState;
  entrants: EventCatalogEntrant[];
  onCreateCategory: (eventId: EventId) => void | Promise<void>;
  onDeleteCategory: (eventId: EventId, categoryId: EventCategoryId) => void | Promise<void>;
  onDisplayError?: (source: string, error: unknown) => void;
  onSelectCategory: (categoryId: EventCategoryId) => void;
  onSelectEvent: (eventId: EventId) => void;
  onUnsavedChangesGuardChange?: (guard: UnsavedChangesGuard | undefined) => void;
  onUpdateCategory: (categoryId: EventCategoryId, changes: CategoryChanges) => void | Promise<void>;
  onUpdateCategorySessionAssignments: (categoryId: EventCategoryId, sessionIds: string[]) => void | Promise<void>;
  selectedCategoryId?: EventCategoryId;
  selectedEventId?: EventId;
}

export interface CategoryDraft {
  code: string;
  description: string;
  distanceRuleKind: CategoryDistanceRule['kind'];
  distanceRuleValue: string;
  elapsedTimeCalculation: string;
  excludeFromResults: boolean;
  isPlaceholder: boolean;
  lap1Calculation: string;
  identityMode: 'single' | 'multiple';
  maxRiderAge: string;
  maxTeamSize: string;
  minRiderAge: string;
  name: string;
  sessionIds: string[];
  teamCompositionRules: string;
}

export const dedupeCategoriesForDisplay = (categories: EventCatalogCategory[]): EventCatalogCategory[] => {
  const byCategoryId = new Map<string, EventCatalogCategory>();
  categories.forEach((category) => {
    byCategoryId.set(category.id.toString(), category);
  });
  return Array.from(byCategoryId.values());
};

export const getCategoryDraft = (category: EventCatalogCategory | undefined, sessionIds: string[] = []): CategoryDraft => ({
  code: category?.code || '',
  description: category?.description || '',
  distanceRuleKind: category?.distanceRule?.kind || 'unspecified',
  distanceRuleValue: category?.distanceRule?.kind === 'unspecified' ? '' : category?.distanceRule?.value?.toString() || '',
  elapsedTimeCalculation: category?.elapsedTimeCalculation || '',
  excludeFromResults: category?.excludeFromResults || false,
  identityMode: category?.teamRules?.identityMode || 'single',
  isPlaceholder: category?.isPlaceholder === true,
  lap1Calculation: category?.lap1Calculation || '',
  maxRiderAge: category?.teamRules?.maxRiderAge?.toString() || '',
  maxTeamSize: category?.teamRules?.maxTeamSize?.toString() || '',
  minRiderAge: category?.teamRules?.minRiderAge?.toString() || '',
  name: category?.name || '',
  sessionIds,
  teamCompositionRules: formatTeamCompositionRules(category?.teamRules?.teamCompositionRules),
});


