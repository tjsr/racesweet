import React from 'react';
import { type EventCatalogCategory, type EventCatalogSession, getSessionAssignedCategoryIds } from '../../app/eventCatalog.js';
import { type EventCategoryId } from '../../model/eventcategory.js';
import { CategoryListPanel } from './categoryList.js';

interface SessionCategoriesPanelProps {
  categories: EventCatalogCategory[];
  eventSessions: EventCatalogSession[];
  onRemoveCategoryFromSession: (categoryId: EventCategoryId) => void | Promise<void>;
  selectedSession?: EventCatalogSession;
}

export const SessionCategoriesPanel = (props: SessionCategoriesPanelProps): React.ReactElement => {
  const activeCategories = props.categories.filter((category) => category.deleted !== true);
  const assignedCategoryIds = getSessionAssignedCategoryIds(activeCategories, props.selectedSession?.id, props.eventSessions);
  const assignedCategories = activeCategories.filter((category) => assignedCategoryIds.has(category.id));

  return (
    <CategoryListPanel
      categoryAction={(category) => {
        if (!props.selectedSession) {
          return undefined;
        }

        return {
          label: 'Remove from session',
          onClick: () => props.onRemoveCategoryFromSession(category.id),
        };
      }}
      categories={props.selectedSession ? assignedCategories : []}
      emptyText={props.selectedSession ? 'No categories are currently assigned to this session.' : 'Select a session to view assigned categories.'}
      selectedCategoryIds={Array.from(assignedCategoryIds)}
      title="Session Categories"
    />
  );
};
