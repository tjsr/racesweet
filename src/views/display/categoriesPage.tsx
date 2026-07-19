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

export type CategoryChanges = Partial<Pick<EventCatalogCategory, 'code' | 'description' | 'distanceRule' | 'excludeFromResults' | 'isPlaceholder' | 'name' | 'teamRules'>>;

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
  excludeFromResults: boolean;
  isPlaceholder: boolean;
  identityMode: 'single' | 'multiple';
  maxRiderAge: string;
  maxTeamSize: string;
  minRiderAge: string;
  name: string;
  sessionIds: string[];
  teamCompositionRules: string;
}

const getCategorySeriesKey = (category: EventCatalogCategory): string => {
  const code = (category.code || '').trim().toLowerCase();
  const name = (category.name || '').trim().toLowerCase();
  return `${code}|${name}`;
};

export const dedupeCategoriesForDisplay = (categories: EventCatalogCategory[]): EventCatalogCategory[] => {
  const bySeriesKey = new Map<string, EventCatalogCategory>();
  categories.forEach((category) => {
    const key = getCategorySeriesKey(category);
    const existingCategory: EventCatalogCategory | undefined = bySeriesKey.get(key);
    if (
      existingCategory === undefined ||
      (existingCategory.deleted === true && category.deleted !== true)
    ) {
      bySeriesKey.set(key, category);
    }
  });
  return Array.from(bySeriesKey.values());
};

export const getCategoryDraft = (category: EventCatalogCategory | undefined, sessionIds: string[] = []): CategoryDraft => ({
  code: category?.code || '',
  description: category?.description || '',
  distanceRuleKind: category?.distanceRule?.kind || 'unspecified',
  distanceRuleValue: category?.distanceRule?.kind === 'unspecified' ? '' : category?.distanceRule?.value?.toString() || '',
  excludeFromResults: category?.excludeFromResults || false,
  identityMode: category?.teamRules?.identityMode || 'single',
  isPlaceholder: category?.isPlaceholder === true,
  maxRiderAge: category?.teamRules?.maxRiderAge?.toString() || '',
  maxTeamSize: category?.teamRules?.maxTeamSize?.toString() || '',
  minRiderAge: category?.teamRules?.minRiderAge?.toString() || '',
  name: category?.name || '',
  sessionIds,
  teamCompositionRules: formatTeamCompositionRules(category?.teamRules?.teamCompositionRules),
});


