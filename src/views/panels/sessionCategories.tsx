import { SvgIcon } from '@mui/material';
import React from 'react';
import { type EventCatalogCategory, type EventCatalogSession, getSessionAssignedCategoryIds } from '../../catalog/eventCatalog.js';
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
          ariaLabel: `Remove ${category.name} from session`,
          icon: <SvgIcon fontSize="small"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5-1-1h-5l-1 1H5v2h14V4z" /></SvgIcon>,
          label: 'Remove from session',
          onClick: () => props.onRemoveCategoryFromSession(category.id),
          title: 'Remove from session',
        };
      }}
      categories={props.selectedSession ? assignedCategories : []}
      emptyText={props.selectedSession ? 'No categories are currently assigned to this session.' : 'Select a session to view assigned categories.'}
      selectedCategoryIds={Array.from(assignedCategoryIds)}
      title="Session Categories"
    />
  );
};
