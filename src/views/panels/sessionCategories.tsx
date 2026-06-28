import React from 'react';
import { type EventCatalogCategory, type EventCatalogSession } from '../../app/eventCatalog.js';
import { type EventCategoryId } from '../../model/eventcategory.js';

interface SessionCategoriesPanelProps {
  categories: EventCatalogCategory[];
  onAssignCategoryToSession: (categoryId: EventCategoryId) => void | Promise<void>;
  onRemoveCategoryFromSession: (categoryId: EventCategoryId) => void | Promise<void>;
  selectedSession?: EventCatalogSession;
}

const isCategoryAssignedToSession = (
  category: EventCatalogCategory,
  session: EventCatalogSession | undefined
): boolean => {
  if (!session) {
    return false;
  }

  return (category.sessionAssignments || []).some((assignment) => assignment.sessionId === session.id);
};

export const SessionCategoriesPanel = (props: SessionCategoriesPanelProps): React.ReactElement => {
  const assignedCategories = props.categories.filter((category) => isCategoryAssignedToSession(category, props.selectedSession));
  const availableCategories = props.categories.filter((category) => !isCategoryAssignedToSession(category, props.selectedSession));
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<EventCategoryId | ''>(availableCategories[0]?.id || '');

  React.useEffect(() => {
    if (selectedCategoryId && availableCategories.some((category) => category.id === selectedCategoryId)) {
      return;
    }

    setSelectedCategoryId(availableCategories[0]?.id || '');
  }, [availableCategories, selectedCategoryId]);

  return (
    <section className="events-panel">
      <h2>Session Categories</h2>
      {props.selectedSession ? (
        <>
          <div className="events-actions">
            <label>
              Category
              <select
                aria-label="Session Category"
                disabled={availableCategories.length === 0}
                onChange={(event) => setSelectedCategoryId(event.target.value as EventCategoryId)}
                value={selectedCategoryId}
              >
                {availableCategories.length === 0 ? (
                  <option value="">No categories available</option>
                ) : availableCategories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name || category.id}</option>
                ))}
              </select>
            </label>
            <button
              disabled={!selectedCategoryId}
              onClick={() => selectedCategoryId && props.onAssignCategoryToSession(selectedCategoryId)}
              type="button"
            >
              Add to session
            </button>
          </div>
          {assignedCategories.length === 0 ? (
            <p>No categories are assigned to this session.</p>
          ) : (
            <ul>
              {assignedCategories.map((category) => (
                <li key={`session-category-${props.selectedSession?.id}-${category.id}`}>
                  {category.name || category.id}
                  {' '}
                  <button type="button" onClick={() => props.onRemoveCategoryFromSession(category.id)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p>Select a session to assign categories.</p>
      )}
    </section>
  );
};
