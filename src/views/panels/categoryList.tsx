import React from 'react';
import { type EventCatalogCategory } from '../../app/eventCatalog.js';
import { type EventCategoryId } from '../../model/eventcategory.js';
import { type EventId } from '../../model/raceevent.js';

interface CategoryListPanelProps {
  selectedEventId?: EventId;
  eventCategories: EventCatalogCategory[];
  onCreateCategory: () => void | Promise<void>;
  onSelectCategory: (categoryId: EventCategoryId) => void | Promise<void>;
  requestFormExit: (action: () => void | Promise<void>) => void;
  selectedCategoryId?: EventCategoryId;
}

export const CategoryListPanel = (props: CategoryListPanelProps): React.ReactElement => (
  <section className="events-panel">
    <h2>Category List</h2>
    <div className="events-actions">
      <button
        type="button"
        onClick={() => {
          if (!props.selectedEventId) {
            return;
          }
          props.requestFormExit(() => props.onCreateCategory());
        }}
        disabled={!props.selectedEventId}
      >
        Create Category
      </button>
    </div>
    <div className="events-list" role="listbox" aria-label="Categories for selected event">
      {props.eventCategories.map((category) => {
        const isSelected = category.id === props.selectedCategoryId;
        return (
          <button
            key={category.id}
            type="button"
            className={`events-list-item${isSelected ? ' selected' : ''}`}
            onClick={() => {
              if (!isSelected) {
                props.requestFormExit(() => props.onSelectCategory(category.id));
              }
            }}
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
);
