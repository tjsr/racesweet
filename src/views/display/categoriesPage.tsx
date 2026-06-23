import {
  type CategoryDistanceRule,
  type EventCatalogCategory,
  type EventCatalogEntrant,
  type EventCatalogState,
} from '../../app/eventCatalog.js';
import { type UnsavedChangesGuard } from './unsavedChangesWarning.js';
import {
  formatTeamCompositionRules,
} from '../../app/categoryRules.js';

export type CategoryChanges = Partial<Pick<EventCatalogCategory, 'code' | 'description' | 'distanceRule' | 'name' | 'sessionAssignments' | 'teamRules'>>;

export interface CategoriesPageProps {
  catalog: EventCatalogState;
  entrants: EventCatalogEntrant[];
  onCreateCategory: (eventId: string) => void | Promise<void>;
  onDeleteCategory: (eventId: string, categoryId: string) => void | Promise<void>;
  onSelectCategory: (categoryId: string) => void;
  onSelectEvent: (eventId: string) => void;
  onUnsavedChangesGuardChange?: (guard: UnsavedChangesGuard | undefined) => void;
  onUpdateCategory: (categoryId: string, changes: CategoryChanges) => void | Promise<void>;
  selectedCategoryId?: string;
  selectedEventId?: string;
}

export interface CategoryDraft {
  code: string;
  description: string;
  distanceRuleKind: CategoryDistanceRule['kind'];
  distanceRuleValue: string;
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
    if (!bySeriesKey.has(key)) {
      bySeriesKey.set(key, category);
    }
  });
  return Array.from(bySeriesKey.values());
};

export const getCategoryDraft = (category: EventCatalogCategory | undefined): CategoryDraft => ({
  code: category?.code || '',
  description: category?.description || '',
  distanceRuleKind: category?.distanceRule?.kind || 'unspecified',
  distanceRuleValue: category?.distanceRule?.kind === 'unspecified' ? '' : category?.distanceRule?.value?.toString() || '',
  maxRiderAge: category?.teamRules?.maxRiderAge?.toString() || '',
  maxTeamSize: category?.teamRules?.maxTeamSize?.toString() || '',
  minRiderAge: category?.teamRules?.minRiderAge?.toString() || '',
  name: category?.name || '',
  sessionIds: category?.sessionAssignments?.map((assignment) => assignment.sessionId).filter((sessionId) => sessionId.length > 0) || [],
  teamCompositionRules: formatTeamCompositionRules(category?.teamRules?.teamCompositionRules),
});


