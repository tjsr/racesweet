import React from 'react';
import { parseTeamCompositionRules } from '../../app/categoryRules.js';
import { type CategoryDistanceRule, getCategoriesForEvent, getSessionsForEvent } from '../../app/eventCatalog.js';
import { EventCategoryId } from '../../model/eventcategory.js';
import { SessionId } from '../../model/raceevent.js';
import { parseInteger } from '../../parsers/parseInteger.js';
import { CategoriesPageProps, CategoryChanges, CategoryDraft, dedupeCategoriesForDisplay, getCategoryDraft } from '../display/categoriesPage.js';
import { useUnsavedChangesWarning } from '../display/unsavedChangesWarning.js';
import { CategoryDetailsPanel } from '../panels/categoryDetails.js';
import { CategoryListPanel } from '../panels/categoryList.js';
import { EntrantsInCategoryPanel } from '../panels/entrantsInCategory.js';

type CategoriesContextProps = React.ComponentProps<typeof CategoriesPage>;

export const CategoriesContext = (props: CategoriesContextProps): React.ReactElement => {
  return <CategoriesPage {...props} />;
};

const formatCategoryParentEventMismatch = (
  categoryId: EventCategoryId,
  event: NonNullable<CategoriesPageProps['catalog']['events'][number]>
): string => {
  return [
    `Category ${categoryId} is displayed for the selected event but is not listed in the parent event ${event.id} categoryIds.`,
    `Parent event: id=${event.id}, name=${event.name}, date=${event.date}, format=${event.format}.`,
    `Parent event categoryIds: ${event.categoryIds.length > 0 ? event.categoryIds.join(', ') : '(none)'}.`,
  ].join(' ');
};

export const CategoriesPage = (props: CategoriesPageProps): React.ReactElement => {
  const selectedEvent = props.catalog.events.find((event) => event.id === props.selectedEventId) ??
    props.catalog.events.find((event) => event.id === props.catalog.activeEventId) ??
    props.catalog.events[0];
  const eventCategories = dedupeCategoriesForDisplay(getCategoriesForEvent(props.catalog, selectedEvent?.id));
  const eventSessions = getSessionsForEvent(props.catalog, selectedEvent?.id);
  const selectedCategory = eventCategories.find((category) => category.id === props.selectedCategoryId) ?? eventCategories[0];
  const categoryParentEventMismatch = selectedEvent && selectedCategory && !selectedEvent.categoryIds.includes(selectedCategory.id)
    ? formatCategoryParentEventMismatch(selectedCategory.id.toString(), selectedEvent)
    : undefined;
  const loggedParentEventMismatchKeys = React.useRef<Set<string>>(new Set());

  const [formError, setFormError] = React.useState<string | undefined>(undefined);
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
  }, [selectedCategoryDraft]);

  React.useEffect(() => {
    if (!categoryParentEventMismatch || !selectedEvent || !selectedCategory) {
      return;
    }

    const mismatchKey = `${selectedEvent.id}:${selectedCategory.id}`;
    if (loggedParentEventMismatchKeys.current.has(mismatchKey)) {
      return;
    }

    loggedParentEventMismatchKeys.current.add(mismatchKey);
    props.onDisplayError?.('Categories', new Error(categoryParentEventMismatch));
  }, [categoryParentEventMismatch, props, selectedCategory, selectedEvent]);

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
    const existingAssignments = selectedCategory?.sessionAssignments || [];
    const sessionAssignments = categoryDraft.sessionIds.map((sessionId: SessionId) => {
      const existing = existingAssignments.find((assignment) => assignment.sessionId === sessionId);
      return {
        sessionId,
        startTime: existing?.startTime || eventSessions.find((session) => session.id === sessionId)?.scheduledStart || '',
      };
    });

    return {
      code: categoryDraft.code || undefined,
      description: categoryDraft.description || undefined,
      distanceRule,
      excludeFromResults: categoryDraft.excludeFromResults,
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
      await props.onUpdateCategory(selectedCategory.id, buildCategoryChanges());
      setSavedCategoryDraft(categoryDraft);
      setFormError(undefined);
      return true;
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : String(error));
      return false;
    }
  };

  const { requestExit: requestFormExit, warningModal } = useUnsavedChangesWarning({
    hasUnsavedChanges: hasUnsavedChanges && !!selectedCategory,
    itemName: selectedCategory?.name || selectedCategory?.id.toString(),
    itemType: 'category',
    onDiscard: () => setFormError(undefined),
    onSave: saveCategory,
    onUnsavedChangesGuardChange: props.onUnsavedChangesGuardChange,
  });
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
          } }
        >
          {props.catalog.events.map((event) => (
            <option key={event.id} value={event.id}>{event.name}</option>
          ))}
        </select>
      </label>
      <div className="events-layout categories-layout">
        <CategoryListPanel
          eventCategories={eventCategories}
          onCreateCategory={() => selectedEvent && props.onCreateCategory(selectedEvent.id)}
          onSelectCategory={props.onSelectCategory}
          requestFormExit={requestFormExit}
          selectedCategoryId={selectedCategory?.id}
          selectedEventId={selectedEvent?.id}
        />
        <CategoryDetailsPanel
          categoryDraft={categoryDraft}
          categoryParentEventMismatch={categoryParentEventMismatch}
          eventSessions={eventSessions}
          formError={formError}
          onDeleteCategory={() => selectedEvent && selectedCategory && requestFormExit(() => props.onDeleteCategory(selectedEvent.id, selectedCategory.id.toString()))}
          onSaveCategory={() => {
            void saveCategory();
          }}
          onSetCategoryDraft={setCategoryDraft}
          selectedCategory={selectedCategory}
          warningModal={warningModal}
        />
        <EntrantsInCategoryPanel entrants={props.entrants} />
      </div>
    </section>
  );
};

