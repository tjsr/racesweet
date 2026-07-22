import React from 'react';
import { type EventCatalogCategory, getCategoriesForEvent, getCategoryAssignedSessionIds, getSessionsForEvent } from '../../catalog/eventCatalog.js';
import { buildCategoryChanges } from '../../processing/categoryDraft.js';
import { CategoriesPageProps, CategoryDraft, dedupeCategoriesForDisplay, getCategoryDraft } from '../display/categoriesPage.js';
import { useUnsavedChangesWarning } from '../display/unsavedChangesWarning.js';
import { CategoryDetailsPanel } from '../panels/categoryDetails.js';
import { CategoryListPanel } from '../panels/categoryList.js';
import { EntrantsInCategoryPanel } from '../panels/entrantsInCategory.js';
import { SessionListPanel } from '../panels/sessionList.js';

type CategoriesContextProps = React.ComponentProps<typeof CategoriesPage>;

export const CategoriesContext = (props: CategoriesContextProps): React.ReactElement => {
  return <CategoriesPage {...props} />;
};

const getAllCategoriesForEvent = (
  catalog: CategoriesPageProps['catalog'],
  eventId: string | undefined
): EventCatalogCategory[] => {
  const event = catalog.events.find((candidate) => candidate.id.toString() === eventId?.toString());
  if (!event) {
    return [];
  }

  const eventCategoryIds = new Set(event.categoryIds.map((categoryId) => categoryId.toString()));
  return catalog.categories.filter((category) => {
    if (category.eventId.toString() !== event.id.toString()) {
      return false;
    }

    return category.deleted === true || eventCategoryIds.has(category.id.toString());
  });
};

export const CategoriesPage = (props: CategoriesPageProps): React.ReactElement => {
  const selectedEvent = props.catalog.events.find((event) => event.id.toString() === props.selectedEventId?.toString()) ??
    props.catalog.events.find((event) => event.id.toString() === props.catalog.activeEventId?.toString()) ??
    props.catalog.events[0];
  const categoriesForEvent = getCategoriesForEvent(props.catalog, selectedEvent?.id?.toString());
  const eventCategories = dedupeCategoriesForDisplay(getAllCategoriesForEvent(props.catalog, selectedEvent?.id?.toString()));
  const activeEventCategories = dedupeCategoriesForDisplay(categoriesForEvent);
  const eventSessions = getSessionsForEvent(props.catalog, selectedEvent?.id?.toString());
  const selectedCategory = eventCategories.find((category) => category.id.toString() === props.selectedCategoryId?.toString()) ?? activeEventCategories[0] ?? eventCategories[0];
  const assignedSessionIdList = Array.from(getCategoryAssignedSessionIds(selectedCategory, eventSessions));
  const assignedSessionIdKey = assignedSessionIdList.slice().sort().join('|');
  const assignedSessionIds = new Set(assignedSessionIdList);
  const categorySessions = eventSessions.filter((session) => assignedSessionIds.has(session.id.toString()));

  const [formError, setFormError] = React.useState<string | undefined>(undefined);
  const [categoryDraft, setCategoryDraft] = React.useState<CategoryDraft>(getCategoryDraft(selectedCategory, assignedSessionIdList));
  const [savedCategoryDraft, setSavedCategoryDraft] = React.useState<CategoryDraft>(getCategoryDraft(selectedCategory, assignedSessionIdList));
  const selectedCategoryDraft = React.useMemo(() => getCategoryDraft(selectedCategory, assignedSessionIdList), [assignedSessionIdKey, selectedCategory]);
  const hasUnsavedChanges = selectedCategory
    ? JSON.stringify(categoryDraft) !== JSON.stringify(savedCategoryDraft)
    : false;

  React.useEffect(() => {
    setCategoryDraft(selectedCategoryDraft);
    setSavedCategoryDraft(selectedCategoryDraft);
    setFormError(undefined);
  }, [selectedCategoryDraft]);

  const saveCategory = async (): Promise<boolean> => {
    if (!selectedCategory) {
      return true;
    }

    try {
      await props.onUpdateCategory(selectedCategory.id, buildCategoryChanges(categoryDraft));
      await props.onUpdateCategorySessionAssignments(selectedCategory.id, categoryDraft.sessionIds);
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
          allowCreateCategory={!!selectedEvent}
          categories={eventCategories}
          enableShowAllCategories
          onCreateCategory={() => selectedEvent && props.onCreateCategory(selectedEvent.id)}
          onSelectCategory={props.onSelectCategory}
          requestFormExit={requestFormExit}
          selectedCategoryId={selectedCategory?.id}
        />
        <CategoryDetailsPanel
          categoryDraft={categoryDraft}
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
        <div className="event-summary-column">
          <SessionListPanel
            emptyText="No sessions are currently assigned to this category."
            sessions={categorySessions}
            title="Sessions for Category"
          />
          <EntrantsInCategoryPanel entrants={props.entrants} />
        </div>
      </div>
    </section>
  );
};

