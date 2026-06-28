// @vitest-environment jsdom

import { flushSync } from 'react-dom';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CategoryListCard } from './categoryListCard.js';

describe('CategoryListCard', () => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(() => {
    root?.unmount();
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it('renders selected interactive and readonly variants', () => {
    const onClick = vi.fn();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    flushSync(() => {
      root?.render(
        <CategoryListCard
          category={{
            code: 'PW',
            eventId: 'event-1',
            id: 'cat-1',
            name: 'Premier',
            teamRules: { teamCompositionRules: [] },
          }}
          isSelected
          onClick={onClick}
        />,
      );
    });

    const card = container.querySelector('button.events-list-item') as HTMLButtonElement;
    expect(card).toBeTruthy();
    expect(card.classList.contains('selected')).toBe(true);
    expect(card.getAttribute('aria-selected')).toBe('true');
    expect(container.textContent).toContain('Premier');
    expect(container.textContent).toContain('PW');

    root?.unmount();
    root = createRoot(container);

    flushSync(() => {
      root?.render(
        <CategoryListCard
          category={{
            code: 'CLB',
            description: 'Club class',
            eventId: 'event-1',
            id: 'cat-2',
            name: 'Clubman',
            teamRules: { teamCompositionRules: [] },
          }}
        />,
      );
    });

    const readonlyCard = container.querySelector('div.events-list-item') as HTMLDivElement;
    expect(readonlyCard).toBeTruthy();
    expect(readonlyCard.classList.contains('selected')).toBe(false);
    expect(container.textContent).toContain('Clubman');
    expect(container.textContent).toContain('CLB');
    expect(container.textContent).toContain('Club class');
  });
});
