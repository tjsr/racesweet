import React from 'react';
import { getCategoriesForEvent, getCategoryAssignedSessionIds, getSessionsForEvent, } from '../../catalog/eventCatalog.js';
import { SelectTextField } from '../../controls/selectTextField.js';
import { buildCategoryChanges } from '../../processing/categoryDraft.js';
import { CategoriesPageProps, CategoryDraft, dedupeCategoriesForDisplay, getCategoryDraft, } from '../display/categoriesPage.js';
import { useUnsavedChangesWarning } from '../display/unsavedChangesWarning.js';
import { CategoryDetailsPanel } from '../panels/categoryDetails.js';
import { CategoryListPanel } from '../panels/categoryList.js';
import { EntrantsInCategoryPanel } from '../panels/entrantsInCategory.js';
import { SessionListPanel } from '../panels/sessionList.js';

type CategoriesContextProps = React.ComponentProps<typeof CategoriesPage>;

export const CategoriesContext = (props: CategoriesContextProps,): React.ReactElement => {
  return <CategoriesPage {...props} />;
};

export const CategoriesPage = (props: CategoriesPageProps,): React.ReactElement => {
  const selectedEvent = props.catalog.events.find((event) => event.id.toString() === props.selectedEventId?.toString(),) ??
    props.catalog.events.find((event) => event.id.toString() === props.catalog.activeEventId?.toString(),) ??
    props.catalog.events[0];
  const categoriesForEvent = getCategoriesForEvent(props.catalog, selectedEvent?.id?.toString(),);
  const activeEventCategories = dedupeCategoriesForDisplay(categoriesForEvent);
  const eventSessions = getSessionsForEvent(props.catalog, selectedEvent?.id?.toString(),);
  const selectedCategory = activeEventCategories.find((category) => category.id.toString() === props.selectedCategoryId?.toString(),) ?? activeEventCategories[0];
  const assignedSessionIdList = Array.from(getCategoryAssignedSessionIds(selectedCategory, eventSessions),);
  const assignedSessionIdKey = assignedSessionIdList.slice().sort().join('|');
  const assignedSessionIds = new Set(assignedSessionIdList);
  const categorySessions = eventSessions.filter((session) => assignedSessionIds.has(session.id.toString()),);

  const [formError, setFormError] = React.useState<string | undefined>(undefined,);
  const [deleteCategoryId, setDeleteCategoryId] = React.useState<string | undefined>(undefined);
  const [deleteError, setDeleteError] = React.useState<string | undefined>(undefined,);
  const [deleteStatus, setDeleteStatus] = React.useState<'idle' | 'pending' | 'succeeded' | 'failed'>('idle');
  const [categoryDraft, setCategoryDraft] = React.useState<CategoryDraft>(getCategoryDraft(selectedCategory, assignedSessionIdList),);
  const [savedCategoryDraft, setSavedCategoryDraft] = React.useState<CategoryDraft>(getCategoryDraft(selectedCategory, assignedSessionIdList),);
  const selectedCategoryDraft = React.useMemo(() => getCategoryDraft(selectedCategory, assignedSessionIdList), [assignedSessionIdKey, selectedCategory],);
  const hasUnsavedChanges = selectedCategory
    ? JSON.stringify(categoryDraft) !== JSON.stringify(savedCategoryDraft)
    : false;

  React.useEffect(() => {
    setCategoryDraft(selectedCategoryDraft);
    setSavedCategoryDraft(selectedCategoryDraft);
    setFormError(undefined);
  }, [selectedCategoryDraft]);

  React.useEffect(() => {
    if (selectedCategory && selectedCategory.id.toString() !== props.selectedCategoryId?.toString()) {
      props.onSelectCategory(selectedCategory.id);
    }
  }, [props.onSelectCategory, props.selectedCategoryId, selectedCategory]);

  const saveCategory = async (): Promise<boolean> => {
    if (!selectedCategory) {
      return true;
    }

    try {
      await props.onUpdateCategory(selectedCategory.id, buildCategoryChanges(categoryDraft),);
      await props.onUpdateCategorySessionAssignments(selectedCategory.id, categoryDraft.sessionIds,);
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
  const deleteCategory = async (): Promise<void> => {
    if (!selectedEvent || !selectedCategory) {
      return;
    }

    setDeleteCategoryId(selectedCategory.id.toString());
    setDeleteStatus('pending');
    setDeleteError(undefined);
    try {
      await props.onDeleteCategory(selectedEvent.id, selectedCategory.id.toString(),);
      setDeleteStatus('succeeded');
    } catch (error: unknown) {
      setDeleteError(error instanceof Error ? error.message : String(error));
      setDeleteStatus('failed');
    }
  };
  const isDeletingSelectedCategory = deleteCategoryId === selectedCategory?.id.toString();
  return (
    <section className="events-screen">
      <h1>Categories</h1>
      <SelectTextField
        className="page-filter-label"
        label="Event"
        slotProps={{ select: { 'aria-label': 'Categories Event', native: true }, }}
        value={selectedEvent?.id || ""}
        onChange={(event) => {
          const eventId = event.target.value;
          requestFormExit(() => props.onSelectEvent(eventId));
        } }
      >
        {props.catalog.events.map((event) => ( <option key={event.id} value={event.id}>{event.name}</option>))}
      </SelectTextField>
      <div className="events-layout categories-layout">
        <CategoryListPanel
          allowCreateCategory={!!selectedEvent}
          categories={activeEventCategories}
          onCreateCategory={() => selectedEvent && props.onCreateCategory(selectedEvent.id)}
          onSelectCategory={props.onSelectCategory}
          requestFormExit={requestFormExit}
          selectedCategoryId={selectedCategory?.id}
        />
        <CategoryDetailsPanel
          categoryDraft={categoryDraft}
          deleteError={isDeletingSelectedCategory ? deleteError : undefined}
          deleteStatus={isDeletingSelectedCategory ? deleteStatus : 'idle'}
          eventSessions={eventSessions}
          formError={formError}
          onDeleteCategory={() => requestFormExit(deleteCategory)}
          onSaveCategory={saveCategory}
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
