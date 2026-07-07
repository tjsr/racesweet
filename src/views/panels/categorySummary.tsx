import React from 'react';
import { type EventCatalogCategory } from '../../catalog/eventCatalog.js';

interface CategorySummaryPanelProps {
  categories: EventCatalogCategory[];
}

export const CategorySummaryPanel = (props: CategorySummaryPanelProps): React.ReactElement => (
  <section className="events-panel category-detail-panel">
    <h2>Category Summary</h2>
    {props.categories.length > 0 ? (
      <ul aria-label="Category summary list">
        {props.categories.map((category) => (
          <li key={category.id}>
            <strong>{category.name}</strong> ({category.id})
          </li>
        ))}
      </ul>
    ) : (
      <p>No categories in this event.</p>
    )}
  </section>
);
