import React from 'react';

import {
  getCategoriesForEvent,
  type CategoryDistanceRule,
  type EventCatalogCategory,
  type EventCatalogState,
} from '../../app/eventCatalog.js';
import {
  formatCategorySessionAssignments,
  formatTeamCompositionRules,
  parseCategorySessionAssignments,
  parseTeamCompositionRules,
} from '../../app/categoryRules.js';

interface CategoryEntrantSummary {
  entrantId: string;
  id: string;
  name: string;
}

type CategoryChanges = Partial<Pick<EventCatalogCategory, 'code' | 'description' | 'distanceRule' | 'name' | 'sessionAssignments' | 'teamRules'>>;
type CategoryExitGuard = (action: () => void | Promise<void>) => void;

interface CategoriesPageProps {
  catalog: EventCatalogState;
  entrants: CategoryEntrantSummary[];
  onCreateCategory: (eventId: string) => void | Promise<void>;
  onDeleteCategory: (eventId: string, categoryId: string) => void | Promise<void>;
  onSelectCategory: (categoryId: string) => void;
  onSelectEvent: (eventId: string) => void;
  onUnsavedChangesGuardChange?: (guard: CategoryExitGuard | undefined) => void;
  onUpdateCategory: (categoryId: string, changes: CategoryChanges) => void | Promise<void>;
  selectedCategoryId?: string;
  selectedEventId?: string;
}

interface CategoryDraft {
  code: string;
  description: string;
  distanceRuleKind: CategoryDistanceRule['kind'];
  distanceRuleValue: string;
  maxRiderAge: string;
  maxTeamSize: string;
  minRiderAge: string;
  name: string;
  sessionAssignments: string;
  teamCompositionRules: string;
}

interface PendingCategoryNavigation {
  action: () => void | Promise<void>;
  categoryName: string;
}

const parseInteger = (value: string): number | undefined => {
  if (value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('Age and team-size fields must be whole numbers or blank.');
  }

  return parsed;
};

const getCategorySeriesKey = (category: EventCatalogCategory): string => {
  const code = (category.code || '').trim().toLowerCase();
  const name = (category.name || '').trim().toLowerCase();
  return `${code}|${name}`;
};

const dedupeCategoriesForDisplay = (categories: EventCatalogCategory[]): EventCatalogCategory[] => {
  const bySeriesKey = new Map<string, EventCatalogCategory>();
  categories.forEach((category) => {
    const key = getCategorySeriesKey(category);
    if (!bySeriesKey.has(key)) {
      bySeriesKey.set(key, category);
    }
  });
  return Array.from(bySeriesKey.values());
};

const getCategoryDraft = (category: EventCatalogCategory | undefined): CategoryDraft => ({
  code: category?.code || '',
  description: category?.description || '',
  distanceRuleKind: category?.distanceRule?.kind || 'unspecified',
  distanceRuleValue: category?.distanceRule?.kind === 'unspecified' ? '' : category?.distanceRule?.value?.toString() || '',
  maxRiderAge: category?.teamRules?.maxRiderAge?.toString() || '',
  maxTeamSize: category?.teamRules?.maxTeamSize?.toString() || '',
  minRiderAge: category?.teamRules?.minRiderAge?.toString() || '',
  name: category?.name || '',
  sessionAssignments: formatCategorySessionAssignments(category?.sessionAssignments),
  teamCompositionRules: formatTeamCompositionRules(category?.teamRules?.teamCompositionRules),
});

export const CategoriesPage = (props: CategoriesPageProps): React.ReactElement => {
  const selectedEvent = props.catalog.events.find((event) => event.id === props.selectedEventId)
    ?? props.catalog.events.find((event) => event.id === props.catalog.activeEventId)
    ?? props.catalog.events[0];
  const eventCategories = dedupeCategoriesForDisplay(getCategoriesForEvent(props.catalog, selectedEvent?.id));
  const selectedCategory = eventCategories.find((category) => category.id === props.selectedCategoryId) ?? eventCategories[0];

  const [formError, setFormError] = React.useState<string | undefined>(undefined);
  const [pendingNavigation, setPendingNavigation] = React.useState<PendingCategoryNavigation | undefined>(undefined);
  const [categoryDraft, setCategoryDraft] = React.useState<CategoryDraft>(getCategoryDraft(selectedCategory));
  const [savedCategoryDraft, setSavedCategoryDraft] = React.useState<CategoryDraft>(getCategoryDraft(selectedCategory));
  const selectedCategoryDraft = React.useMemo(() => getCategoryDraft(selectedCategory), [selectedCategory]);
  const hasUnsavedChanges = selectedCategory
    ? JSON.stringify(categoryDraft) !== JSON.stringify(savedCategoryDraft)
    : false;

  React.useEffect(() => {
    setCategoryDraft(selectedCategoryDraft);
    setSavedCategoryDraft(selectedCategoryDraft);
    setFormError(undefined);
    setPendingNavigation(undefined);
  }, [selectedCategoryDraft]);

  const buildCategoryChanges = (): CategoryChanges => {
    let distanceRule: CategoryDistanceRule;
    if (categoryDraft.distanceRuleKind === 'unspecified') {
      distanceRule = { kind: 'unspecified' };
    } else if (categoryDraft.distanceRuleKind === 'time') {
      if (categoryDraft.distanceRuleValue.trim().length === 0) {
        throw new Error('Time distance requires a value in minutes or h:mm format.');
      }
      distanceRule = {
        kind: 'time',
        value: categoryDraft.distanceRuleValue.trim(),
      };
    } else {
      const laps = Number(categoryDraft.distanceRuleValue);
      if (!Number.isInteger(laps) || laps <= 0) {
        throw new Error('Lap distance requires a whole-number lap count.');
      }
      distanceRule = {
        kind: 'laps',
        value: laps,
      };
    }
    const teamCompositionRules = parseTeamCompositionRules(categoryDraft.teamCompositionRules);
    const sessionAssignments = parseCategorySessionAssignments(categoryDraft.sessionAssignments);

    return {
      code: categoryDraft.code || undefined,
      description: categoryDraft.description || undefined,
      distanceRule,
      name: categoryDraft.name,
      sessionAssignments,
      teamRules: {
        maxRiderAge: parseInteger(categoryDraft.maxRiderAge),
        maxTeamSize: parseInteger(categoryDraft.maxTeamSize),
        minRiderAge: parseInteger(categoryDraft.minRiderAge),
        teamCompositionRules,
      },
    };
  };

  const saveCategory = async (): Promise<boolean> => {
    if (!selectedCategory) {
      return true;
    }

    try {
      await props.onUpdateCategory(selectedCategory.id.toString(), buildCategoryChanges());
      setSavedCategoryDraft(categoryDraft);
      setFormError(undefined);
      return true;
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : String(error));
      return false;
    }
  };

  const requestFormExit = React.useCallback((action: () => void | Promise<void>): void => {
    if (hasUnsavedChanges && selectedCategory) {
      setPendingNavigation({
        action,
        categoryName: selectedCategory.name || selectedCategory.id.toString(),
      });
      return;
    }

    void action();
  }, [hasUnsavedChanges, selectedCategory]);

  React.useEffect(() => {
    props.onUnsavedChangesGuardChange?.(requestFormExit);
    return () => {
      props.onUnsavedChangesGuardChange?.(undefined);
    };
  }, [props.onUnsavedChangesGuardChange, requestFormExit]);

  const saveAndContinuePendingNavigation = async (): Promise<void> => {
    if (!pendingNavigation) {
      return;
    }

    const saved = await saveCategory();
    if (!saved) {
      return;
    }

    const action = pendingNavigation.action;
    setPendingNavigation(undefined);
    await action();
  };

  const discardAndContinuePendingNavigation = (): void => {
    if (!pendingNavigation) {
      return;
    }

    const action = pendingNavigation.action;
    setPendingNavigation(undefined);
    setFormError(undefined);
    void action();
  };

  return (
    <section className="events-screen">
      <h1>Categories</h1>
      <label className="page-filter-label">
        Event
        <select
          aria-label="Categories Event"
          value={selectedEvent?.id || ''}
          onChange={(event) => {
            const eventId = event.target.value;
            requestFormExit(() => props.onSelectEvent(eventId));
          }}
        >
          {props.catalog.events.map((event) => (
            <option key={event.id} value={event.id}>{event.name}</option>
          ))}
        </select>
      </label>
      <div className="events-layout categories-layout">
        <section className="events-panel">
          <h2>Category List</h2>
          <div className="events-actions">
            <button
              type="button"
              onClick={() => selectedEvent && requestFormExit(() => props.onCreateCategory(selectedEvent.id))}
              disabled={!selectedEvent}
            >
              Create Category
            </button>
          </div>
          <div className="events-list" role="listbox" aria-label="Categories for selected event">
            {eventCategories.map((category) => {
              const isSelected = category.id === selectedCategory?.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  className={`events-list-item${isSelected ? ' selected' : ''}`}
                  onClick={() => {
                    if (!isSelected) {
                      requestFormExit(() => props.onSelectCategory(category.id.toString()));
                    }
                  }}
                  aria-selected={isSelected}
                >
                  <strong>{category.name}</strong>
                  <span>{category.code || 'No code'}</span>
                  <span>{category.description || 'No description'}</span>
                </button>
              );
            })}
          </div>
        </section>
        <section className="events-panel">
          <h2>Category Details</h2>
          {selectedCategory ? (
            <>
              <label>
                Category Name
                <input
                  aria-label="Category Name"
                  type="text"
                  value={categoryDraft.name}
                  onChange={(event) => setCategoryDraft((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label>
                Category Code
                <input
                  aria-label="Category Code"
                  type="text"
                  value={categoryDraft.code}
                  onChange={(event) => setCategoryDraft((current) => ({ ...current, code: event.target.value }))}
                />
              </label>
              <label>
                Description
                <textarea
                  aria-label="Category Description"
                  value={categoryDraft.description}
                  onChange={(event) => setCategoryDraft((current) => ({ ...current, description: event.target.value }))}
                />
              </label>
              <label>
                Distance Type
                <select
                  aria-label="Category Distance Rule Type"
                  value={categoryDraft.distanceRuleKind}
                  onChange={(event) => setCategoryDraft((current) => ({ ...current, distanceRuleKind: event.target.value as CategoryDistanceRule['kind'] }))}
                >
                  <option value="unspecified">Unspecified</option>
                  <option value="time">Time</option>
                  <option value="laps">Laps</option>
                </select>
              </label>
              {categoryDraft.distanceRuleKind !== 'unspecified' ? (
                <label>
                  Distance Value
                  <input
                    aria-label="Category Distance Rule Value"
                    type="text"
                    value={categoryDraft.distanceRuleValue}
                    onChange={(event) => setCategoryDraft((current) => ({ ...current, distanceRuleValue: event.target.value }))}
                    placeholder={categoryDraft.distanceRuleKind === 'time' ? '45 or 1:30' : '12'}
                  />
                </label>
              ) : null}
              <label>
                Max Team Size
                <input
                  aria-label="Category Max Team Size"
                  type="number"
                  value={categoryDraft.maxTeamSize}
                  onChange={(event) => setCategoryDraft((current) => ({ ...current, maxTeamSize: event.target.value }))}
                />
              </label>
              <label>
                Minimum Rider Age
                <input
                  aria-label="Category Min Rider Age"
                  type="number"
                  value={categoryDraft.minRiderAge}
                  onChange={(event) => setCategoryDraft((current) => ({ ...current, minRiderAge: event.target.value }))}
                />
              </label>
              <label>
                Maximum Rider Age
                <input
                  aria-label="Category Max Rider Age"
                  type="number"
                  value={categoryDraft.maxRiderAge}
                  onChange={(event) => setCategoryDraft((current) => ({ ...current, maxRiderAge: event.target.value }))}
                />
              </label>
              <label>
                Team Gender Rules
                <textarea
                  aria-label="Category Team Gender Rules"
                  value={categoryDraft.teamCompositionRules}
                  onChange={(event) => setCategoryDraft((current) => ({ ...current, teamCompositionRules: event.target.value }))}
                  placeholder="female:1:2; male:1:3"
                />
              </label>
              <label>
                Session Assignments
                <textarea
                  aria-label="Category Session Assignments"
                  value={categoryDraft.sessionAssignments}
                  onChange={(event) => setCategoryDraft((current) => ({ ...current, sessionAssignments: event.target.value }))}
                  placeholder="session-1@2026-06-12T09:00:00.000Z; session-2@2026-06-13T13:00:00.000Z"
                />
              </label>
              <div className="events-actions">
                <div className="category-save-status">
                  <button
                    type="button"
                    onClick={() => {
                      void saveCategory();
                    }}
                  >
                    Save Category
                  </button>
                  {formError ? (
                    <div className="error category-save-error" role="alert">
                      <span className="warning-icon" aria-hidden="true">!</span>
                      <p>{formError}</p>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => selectedEvent && requestFormExit(() => props.onDeleteCategory(selectedEvent.id, selectedCategory.id.toString()))}
                >
                  Delete Category
                </button>
              </div>
              {pendingNavigation ? (
                <div className="unsaved-changes-prompt" role="dialog" aria-modal="true" aria-label="Unsaved category changes">
                  <p>You have unsaved changes to category {pendingNavigation.categoryName} - save or discard changes?</p>
                  <div className="events-actions">
                    <button
                      type="button"
                      onClick={() => {
                        void saveAndContinuePendingNavigation();
                      }}
                    >
                      Save
                    </button>
                    <button type="button" onClick={discardAndContinuePendingNavigation}>
                      Discard
                    </button>
                    <button type="button" onClick={() => setPendingNavigation(undefined)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <p>No categories are defined for this event.</p>
          )}
        </section>
        <section className="events-panel">
          <h2>Entrants In Category</h2>
          {props.entrants.length > 0 ? (
            <ul className="entrant-summary-list">
              {props.entrants.map((entrant) => (
                <li key={entrant.id}>{entrant.name} ({entrant.entrantId})</li>
              ))}
            </ul>
          ) : (
            <p>No entrants are currently assigned to this category.</p>
          )}
        </section>
      </div>
    </section>
  );
};
