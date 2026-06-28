import React from 'react';
import { type EventCatalogCategory } from '../app/eventCatalog.js';

interface CategoryListCardProps {
  actionLabel?: string;
  actionTitle?: string;
  category: EventCatalogCategory;
  isSelected?: boolean;
  onActionClick?: () => void | Promise<void>;
  onClick?: () => void | Promise<void>;
}

export const CategoryListCard = (props: CategoryListCardProps): React.ReactElement => {
  const className = [
    'events-list-item',
    props.isSelected ? 'selected' : '',
  ].filter((value) => value.length > 0).join(' ');

  const content = (
    <>
      <strong className="categoryName">{props.category.name}</strong>
      {props.category.code !== props.category.name ? <span className="categoryCode">{props.category.code}</span> : null}
      {props.category.description ? <span className="categoryDescription">{props.category.description}</span> : null}
      {props.actionLabel && props.onActionClick ? (
        <button
          title={props.actionTitle}
          type="button"
          onClick={() => {
            void props.onActionClick?.();
          }}
        >
          {props.actionLabel}
        </button>
      ) : null}
    </>
  );

  if (!props.onClick) {
    return (
      <div className={className}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        void props.onClick?.();
      }}
      aria-selected={props.isSelected}
    >
      {content}
    </button>
  );
};
