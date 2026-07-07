// @vitest-environment jsdom

import { flushSync } from 'react-dom';
import { type Root, createRoot } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type EventCatalogCategory } from '../../catalog/eventCatalog.js';
import { CategoryListPanel } from './categoryList.js';

const category: EventCatalogCategory = {
  code: 'PW',
  eventId: 'event-1',
  id: 'cat-1',
  name: 'Premier',
  teamRules: { teamCompositionRules: [] },
};
const deletedCategory: EventCatalogCategory = {
  code: 'DEL',
  deleted: true,
  eventId: 'event-1',
  id: 'cat-deleted',
  name: 'Deleted Category',
  teamRules: { teamCompositionRules: [] },
};

describe('CategoryListPanel', () => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(() => {
    root?.unmount();
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it('renders interactive and readonly category lists', async () => {
    const onCreateCategory = vi.fn();
    const onSelectCategory = vi.fn();
    const requestFormExit = vi.fn((action: () => void | Promise<void>) => action());

    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    flushSync(() => {
      root?.render(
        <CategoryListPanel
          allowCreateCategory
          categories={[category]}
          onCreateCategory={onCreateCategory}
          onSelectCategory={onSelectCategory}
          requestFormExit={requestFormExit}
          selectedCategoryId={undefined}
        />,
      );
    });

    expect(container.textContent).toContain('Category List');
    expect(container.textContent).toContain('Create Category');
    const createButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Create Category');
    expect(createButton).toBeDefined();

    const categoryButton = container.querySelector('button.events-list-item') as HTMLButtonElement;
    expect(categoryButton).toBeTruthy();
    expect(categoryButton.getAttribute('aria-selected')).toBe('false');

    await act(async () => {
      categoryButton.click();
    });

    expect(onSelectCategory).toHaveBeenCalledWith(category.id);

    await act(async () => {
      createButton!.click();
    });

    expect(onCreateCategory).toHaveBeenCalledOnce();

    root?.unmount();
    root = createRoot(container);

    flushSync(() => {
      root?.render(
        <CategoryListPanel
          categories={[category]}
        />,
      );
    });

    expect(container.querySelector('div.events-list-item')).toBeTruthy();
    expect(container.textContent).toContain('Premier');

    const onAction = vi.fn();
    root?.unmount();
    root = createRoot(container);

    flushSync(() => {
      root?.render(
        <CategoryListPanel
          categoryAction={() => ({ label: 'Add to session', onClick: onAction })}
          categories={[category]}
          selectedCategoryIds={[category.id]}
        />,
      );
    });

    expect(container.querySelector('div.events-list-item.selected')).toBeTruthy();
    const actionButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Add to session');
    expect(actionButton).toBeDefined();

    await act(async () => {
      actionButton!.click();
    });

    expect(onAction).toHaveBeenCalledOnce();
  });

  it('hides deleted categories by default and reveals them only when enabled show all is checked', async () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    flushSync(() => {
      root?.render(
        <CategoryListPanel
          categories={[category, deletedCategory]}
        />,
      );
    });

    expect(container.querySelector('input[aria-label="Show all categories"]')).toBeNull();
    expect(container.textContent).toContain('Premier');
    expect(container.textContent).not.toContain('Deleted Category');

    root?.unmount();
    root = createRoot(container);

    flushSync(() => {
      root?.render(
        <CategoryListPanel
          categories={[category, deletedCategory]}
          enableShowAllCategories
        />,
      );
    });

    const showAllCheckbox = container.querySelector('input[aria-label="Show all categories"]') as HTMLInputElement;
    expect(showAllCheckbox).toBeTruthy();
    expect(showAllCheckbox.checked).toBe(false);
    expect(container.textContent).not.toContain('Deleted Category');

    flushSync(() => {
      showAllCheckbox.click();
    });

    expect(showAllCheckbox.checked).toBe(true);
    expect(container.textContent).toContain('Deleted Category');
  });
});
