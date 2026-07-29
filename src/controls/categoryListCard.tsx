import { IconButton } from '@mui/material';
import React from 'react';
import { type EventCatalogCategory } from '../catalog/eventCatalog.js';

interface CategoryListCardProps {
  actionAriaLabel?: string;
  actionIcon?: React.ReactNode;
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
    'object-card',
    props.isSelected ? 'selected' : '',
  ].filter((value) => value.length > 0).join(' ');

  const content = (
    <>
      <div className="category-card-heading">
        <strong className="categoryName">{props.category.name}</strong>
        {props.actionIcon && props.onActionClick ? (
          <IconButton
            aria-label={props.actionAriaLabel || props.actionTitle || 'Remove category'}
            onClick={() => {
              void props.onActionClick?.();
            }}
            size="small"
            title={props.actionTitle}
          >
            {props.actionIcon}
          </IconButton>
        ) : null}
      </div>
      {props.category.code !== props.category.name ? <span className="categoryCode">{props.category.code}</span> : null}
      {props.category.description ? <span className="categoryDescription">{props.category.description}</span> : null}
      {!props.actionIcon && props.actionLabel && props.onActionClick ? (
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
