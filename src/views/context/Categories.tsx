import React from 'react';
import { parseTeamCompositionRules } from '../../app/categoryRules.js';
import { type CategoryDistanceRule, getCategoriesForEvent, getSessionsForEvent } from '../../app/eventCatalog.js';
import { SessionId } from '../../model/raceevent.js';
import { parseInteger } from '../../parsers/parseInteger.js';
import { CategoriesPageProps, CategoryChanges, CategoryDraft, dedupeCategoriesForDisplay, getCategoryDraft } from '../display/categoriesPage.js';
import { useUnsavedChangesWarning } from '../display/unsavedChangesWarning.js';

type CategoriesContextProps = React.ComponentProps<typeof CategoriesPage>;

export const CategoriesContext = (props: CategoriesContextProps): React.ReactElement => {
  return <CategoriesPage {...props} />;
};

export const CategoriesPage = (props: CategoriesPageProps): React.ReactElement => {
  const selectedEvent = props.catalog.events.find((event) => event.id === props.selectedEventId) ??
    props.catalog.events.find((event) => event.id === props.catalog.activeEventId) ??
    props.catalog.events[0];
  const eventCategories = dedupeCategoriesForDisplay(getCategoriesForEvent(props.catalog, selectedEvent?.id));
  const eventSessions = getSessionsForEvent(props.catalog, selectedEvent?.id);
  const selectedCategory = eventCategories.find((category) => category.id === props.selectedCategoryId) ?? eventCategories[0];

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

  const { requestExit: requestFormExit, warningModal } = useUnsavedChangesWarning({
    hasUnsavedChanges: hasUnsavedChanges && !!selectedCategory,
    itemName: selectedCategory?.name || selectedCategory?.id.toString(),
    itemType: 'category',
    onDiscard: () => setFormError(undefined),
    onSave: saveCategory,
    onUnsavedChangesGuardChange: props.onUnsavedChangesGuardChange,
  });
  const teamEntrants = props.entrants.filter((entrant) => entrant.entrantType === 'team');
  const riderEntrants = props.entrants.filter((entrant) => entrant.entrantType === 'rider');
  const individualEntrants = riderEntrants.filter((entrant) => !entrant.teamEntrantId);

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
                  } }
                  aria-selected={isSelected}
                >
                  <strong className="categoryName">{category.name}</strong>
                  {category.code !== category.name ? <span className="categoryCode">{category.code}</span> : <></>}
                  {category.description ? <span className="categoryDescription">{category.description}</span> : <></>}
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
                  onChange={(event) => setCategoryDraft((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label>
                Category Code
                <input
                  aria-label="Category Code"
                  type="text"
                  value={categoryDraft.code}
                  onChange={(event) => setCategoryDraft((current) => ({ ...current, code: event.target.value }))} />
              </label>
              <label>
                Description
                <textarea
                  aria-label="Category Description"
                  value={categoryDraft.description}
                  onChange={(event) => setCategoryDraft((current) => ({ ...current, description: event.target.value }))} />
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
                    placeholder={categoryDraft.distanceRuleKind === 'time' ? '45 or 1:30' : '12'} />
                </label>
              ) : null}
              <label>
                Max Team Size
                <input
                  aria-label="Category Max Team Size"
                  type="number"
                  value={categoryDraft.maxTeamSize}
                  onChange={(event) => setCategoryDraft((current) => ({ ...current, maxTeamSize: event.target.value }))} />
              </label>
              <label>
                Minimum Rider Age
                <input
                  aria-label="Category Min Rider Age"
                  type="number"
                  value={categoryDraft.minRiderAge}
                  onChange={(event) => setCategoryDraft((current) => ({ ...current, minRiderAge: event.target.value }))} />
              </label>
              <label>
                Maximum Rider Age
                <input
                  aria-label="Category Max Rider Age"
                  type="number"
                  value={categoryDraft.maxRiderAge}
                  onChange={(event) => setCategoryDraft((current) => ({ ...current, maxRiderAge: event.target.value }))} />
              </label>
              <label>
                Team Gender Rules
                <textarea
                  aria-label="Category Team Gender Rules"
                  value={categoryDraft.teamCompositionRules}
                  onChange={(event) => setCategoryDraft((current) => ({ ...current, teamCompositionRules: event.target.value }))}
                  placeholder="female:1:2; male:1:3" />
              </label>
              <label>
                Session Assignments
                <select
                  aria-label="Category Session Assignments"
                  multiple
                  value={categoryDraft.sessionIds}
                  onChange={(event) => {
                    const sessionIds = Array.from(event.currentTarget.selectedOptions).map((option) => option.value);
                    setCategoryDraft((current) => ({ ...current, sessionIds }));
                  } }
                >
                  {eventSessions.map((session) => (
                    <option key={session.id} value={session.id}>{session.name}</option>
                  ))}
                </select>
              </label>
              <div className="events-actions">
                <div className="category-save-status">
                  <button
                    type="button"
                    onClick={() => {
                      void saveCategory();
                    } }
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
              {warningModal}
            </>
          ) : (
            <p>No categories are defined for this event.</p>
          )}
        </section>
        <section className="events-panel">
          <h2>Entrants In Category</h2>
          {props.entrants.length > 0 ? (
            <div className="entrant-summary-list">
              {teamEntrants.length > 0 ? (
                <section>
                  <h3>Teams</h3>
                  <ul>
                    {teamEntrants.map((team) => {
                      const teamMembers = riderEntrants.filter((entrant) => entrant.teamEntrantId === team.id);
                      return (
                        <li key={team.id}>
                          <strong>{team.name}</strong>
                          {teamMembers.length > 0 ? (
                            <ul>
                              {teamMembers.map((member) => (
                                <li key={member.id}>{member.name}</li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}
              {individualEntrants.length > 0 ? (
                <section>
                  <h3>Individual Entrants</h3>
                  <ul>
                    {individualEntrants.map((entrant) => (
                      <li key={entrant.id}>{entrant.name}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          ) : (
            <p>No entrants are currently assigned to this category.</p>
          )}
        </section>
      </div>
    </section>
  );
};

