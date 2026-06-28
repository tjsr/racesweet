// @vitest-environment jsdom

import { flushSync } from 'react-dom';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionListCard } from './sessionListCard.js';

describe('SessionListCard', () => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(() => {
    root?.unmount();
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it('renders selected and active states', () => {
    const onClick = vi.fn();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    flushSync(() => {
      root?.render(
        <SessionListCard
          activeSessionId="session-1"
          onClick={onClick}
          selected
          session={{
            eventId: 'event-1',
            id: 'session-1',
            kind: 'race',
            name: 'Feature Race',
            notes: '',
            scheduledStart: '2026-06-13T14:00:00.000Z',
            status: 'scheduled',
          }}
        />,
      );
    });

    const card = container.querySelector('button.session-list-card') as HTMLButtonElement;
    expect(card).toBeTruthy();
    expect(card.classList.contains('selected')).toBe(true);
    expect(card.classList.contains('active')).toBe(true);
    expect(container.textContent).toContain('Feature Race');
    expect(container.textContent).toContain('Active');
  });
});
