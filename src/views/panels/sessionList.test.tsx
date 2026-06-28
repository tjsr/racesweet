// @vitest-environment jsdom

import { flushSync } from 'react-dom';
import { type Root, createRoot } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type EventCatalogSession } from '../../app/eventCatalog.js';
import { SessionListPanel } from './sessionList.js';

const session: EventCatalogSession = {
  eventId: 'event-1',
  id: 'session-1',
  kind: 'race',
  name: 'Feature Race',
  scheduledStart: '2026-06-12T09:00:00.000Z',
  status: 'scheduled',
};

describe('SessionListPanel', () => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(() => {
    root?.unmount();
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it('renders interactive and readonly session lists', async () => {
    const onCreateSession = vi.fn();
    const onSelectSession = vi.fn();
    const requestFormExit = vi.fn((action: () => void | Promise<void>) => action());

    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    flushSync(() => {
      root?.render(
        <SessionListPanel
          allowCreateSession
          onCreateSession={onCreateSession}
          onSelectSession={onSelectSession}
          requestFormExit={requestFormExit}
          selectedSession={undefined}
          sessions={[session]}
        />,
      );
    });

    expect(container.textContent).toContain('Session List');
    expect(container.textContent).toContain('Create Session');
    const createButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Create Session');
    expect(createButton).toBeDefined();

    const sessionButton = container.querySelector('button.session-list-card') as HTMLButtonElement;
    expect(sessionButton).toBeTruthy();
    expect(sessionButton.getAttribute('aria-selected')).toBe('false');

    await act(async () => {
      sessionButton.click();
    });

    expect(onSelectSession).toHaveBeenCalledWith(session.id);

    await act(async () => {
      createButton!.click();
    });

    expect(onCreateSession).toHaveBeenCalledOnce();

    root?.unmount();
    root = createRoot(container);

    flushSync(() => {
      root?.render(
        <SessionListPanel
          sessions={[session]}
          title="Sessions for Category"
        />,
      );
    });

    expect(container.textContent).toContain('Sessions for Category');
    expect(container.querySelector('div.session-list-card.readonly')).toBeTruthy();
    expect(container.querySelector('button.session-list-card')).toBeNull();
    expect(container.textContent).toContain('Feature Race');
  });
});
