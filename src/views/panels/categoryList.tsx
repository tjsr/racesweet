import React from 'react';
import { type EventCatalogCategory } from '../../app/eventCatalog.js';
import { type EventCategoryId } from '../../model/eventcategory.js';
import { CategoryListCard } from '../../controls/categoryListCard.js';

interface CategoryListPanelProps {
  allowCreateCategory?: boolean;
  categoryAction?: (category: EventCatalogCategory) => {
    label: string;
    onClick: () => void | Promise<void>;
    title?: string;
  } | undefined;
  categories: EventCatalogCategory[];
  className?: string;
  emptyText?: string;
  onCreateCategory?: () => void | Promise<void>;
  onSelectCategory?: (categoryId: EventCategoryId) => void | Promise<void>;
  requestFormExit?: (action: () => void | Promise<void>) => void;
  selectedCategoryId?: EventCategoryId;
  selectedCategoryIds?: EventCategoryId[];
  title?: string;
}

export const CategoryListPanel = (props: CategoryListPanelProps): React.ReactElement => (
  <section className={['events-panel', props.className || ''].filter((value) => value.length > 0).join(' ')}>
    <h2>{props.title || 'Category List'}</h2>
    <div className="events-actions">
      {props.allowCreateCategory && props.onCreateCategory ? (
        <button
          type="button"
          onClick={() => {
            const onCreateCategory = props.onCreateCategory!;
            if (props.requestFormExit) {
              props.requestFormExit(() => onCreateCategory());
              return;
            }

            void onCreateCategory();
          }}
        >
          Create Category
        </button>
      ) : null}
    </div>
    <div className="events-list" role={props.onSelectCategory ? 'listbox' : 'list'} aria-label="Categories for selected event">
      {props.categories.length > 0 ? props.categories.map((category) => {
        const isSelected = category.id === props.selectedCategoryId || (props.selectedCategoryIds || []).includes(category.id);
        const action = props.categoryAction?.(category);

        if (!props.onSelectCategory) {
          return (
            <CategoryListCard
              actionLabel={action?.label}
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
