import { Button, Checkbox, FormControlLabel } from '@mui/material';
import React from 'react';
import { type EventCatalogCategory } from '../../catalog/eventCatalog.js';
import { type EventCategoryId } from '../../model/eventcategory.js';
import { CategoryListCard } from '../../controls/categoryListCard.js';

interface CategoryListPanelProps {
  allowCreateCategory?: boolean;
  categoryAction?: (category: EventCatalogCategory) => {
    ariaLabel?: string;
    icon?: React.ReactNode;
    label: string;
    onClick: () => void | Promise<void>;
    title?: string;
  } | undefined;
  categories: EventCatalogCategory[];
  className?: string;
  emptyText?: string;
  enableShowAllCategories?: boolean;
  onCreateCategory?: () => void | Promise<void>;
  onSelectCategory?: (categoryId: EventCategoryId) => void | Promise<void>;
  requestFormExit?: (action: () => void | Promise<void>) => void;
  selectedCategoryId?: EventCategoryId;
  selectedCategoryIds?: EventCategoryId[];
  title?: string;
}

const isActiveCategory = (category: EventCatalogCategory): boolean => category.deleted !== true;

export const CategoryListPanel = (props: CategoryListPanelProps): React.ReactElement => {
  const [showAllCategories, setShowAllCategories] = React.useState(false);
  const visibleCategories = showAllCategories ? props.categories : props.categories.filter(isActiveCategory);

  return (
    <section className={['events-panel', props.className || ''].filter((value) => value.length > 0).join(' ')}>
      <h2>{props.title || 'Category List'}</h2>
      <div className="events-actions">
        {props.allowCreateCategory && props.onCreateCategory ? (
          <Button
            onClick={() => {
              const onCreateCategory = props.onCreateCategory!;
              if (props.requestFormExit) {
                props.requestFormExit(() => onCreateCategory());
                return;
              }

              void onCreateCategory();
            }}
            size="medium"
            sx={{
              alignSelf: 'center',
              flex: '0 0 auto',
              minWidth: 0,
              whiteSpace: 'nowrap',
            }}
            variant="contained">
            Create Category
          </Button>
        ) : null}
        {props.enableShowAllCategories ? (
          <FormControlLabel control={<Checkbox checked={showAllCategories} slotProps={{ input: { 'aria-label': 'Show all categories' } }} onChange={(event) => setShowAllCategories(event.target.checked)} />} label="Show all" />
        ) : null}
      </div>
      <div className="events-list" role={props.onSelectCategory ? 'listbox' : 'list'} aria-label="Categories for selected event">
        {visibleCategories.length > 0 ? visibleCategories.map((category) => {
          const isSelected = category.id === props.selectedCategoryId || (props.selectedCategoryIds || []).includes(category.id);
          const action = props.categoryAction?.(category);

          if (!props.onSelectCategory) {
            return (
              <CategoryListCard
                actionLabel={action?.label}
                actionAriaLabel={action?.ariaLabel}
                actionIcon={action?.icon}
                actionTitle={action?.title}
                key={category.id}
                category={category}
                isSelected={isSelected}
                onActionClick={action?.onClick}
              />
            );
          }

          return (
            <CategoryListCard
              key={category.id}
              category={category}
              actionAriaLabel={action?.ariaLabel}
              actionIcon={action?.icon}
              isSelected={isSelected}
              onClick={() => {
                if (isSelected) {
                  return;
                }

                const onSelectCategory = props.onSelectCategory!;
                if (props.requestFormExit) {
                  props.requestFormExit(() => onSelectCategory(category.id));
                  return;
                }

                void onSelectCategory(category.id);
              }}
            />
          );
        }) : (
          <p>{props.emptyText || 'No categories are available.'}</p>
        )}
      </div>
    </section>
  );
};
