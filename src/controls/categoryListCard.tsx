import { Button, type ButtonProps, IconButton, Tooltip } from '@mui/material';
import React from 'react';
import { type EventCatalogCategory } from '../catalog/eventCatalog.js';

interface CategoryListCardProps {
  actionColor?: ButtonProps['color'];
  actionAriaLabel?: string;
  actionIcon?: React.ReactNode;
  actionLabel?: string;
  actionSize?: ButtonProps['size'];
  actionTitle?: string;
  actionVariant?: ButtonProps['variant'];
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
          <Tooltip title={props.actionTitle || props.actionAriaLabel || 'Remove category'}><IconButton
            aria-label={props.actionAriaLabel || props.actionTitle || 'Remove category'}
            onClick={() => {
              void props.onActionClick?.();
            }}
            size="small"
            title={props.actionTitle}
          >
            {props.actionIcon}
          </IconButton></Tooltip>
        ) : null}
      </div>
      {props.category.code !== props.category.name ? <span className="categoryCode">{props.category.code}</span> : null}
      {props.category.description ? <span className="categoryDescription">{props.category.description}</span> : null}
      {!props.actionIcon && props.actionLabel && props.onActionClick ? (
        <Tooltip title={props.actionTitle || props.actionLabel}>
          <Button
            aria-label={props.actionAriaLabel}
            color={props.actionColor}
            size={props.actionSize}
            type="button"
            variant={props.actionVariant}
            onClick={() => {
              void props.onActionClick?.();
            }}
          >
            {props.actionLabel}
          </Button>
        </Tooltip>
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
    <Button
      sx={{ alignItems: 'stretch', display: 'flex', flexDirection: 'column', textAlign: 'left', textTransform: 'none' }}
      type="button"
      className={className}
      onClick={() => {
        void props.onClick?.();
      }}
      aria-selected={props.isSelected}
    >
      {content}
    </Button>
  );
};
