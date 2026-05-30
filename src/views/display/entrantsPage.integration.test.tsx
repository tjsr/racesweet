// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EventCatalogState } from '../../app/eventCatalog.js';
import { useUiConsoleGuards } from '../../testing/uiConsoleGuards.js';
import { EntrantsPage } from './entrantsPage.js';

const setInputValue = (input: HTMLInputElement | HTMLTextAreaElement, value: string): void => {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

const catalog: EventCatalogState = {
  activeEventId: 'event-1',
  categories: [],
  entrants: [
    {
      categoryIds: ['cat-1'],
      entrantType: 'rider',
      eventId: 'event-1',
      id: 'ent-1',
      memberParticipantIds: ['p-1'],
      name: 'Pat Rider',
      sessionIds: ['session-1'],
    },
    {
      categoryIds: ['cat-2'],
      entrantType: 'team',
      eventId: 'event-2',
      id: 'ent-2',
      memberParticipantIds: ['p-2', 'p-3'],
      name: 'Team Blue',
      sessionIds: ['session-2'],
    },
  ],
  events: [
    {
      categoryIds: ['cat-1'],
      date: '2026-06-12',
      entrantIds: ['ent-1'],
      format: 'race-weekend',
      id: 'event-1',
      name: 'Winter Round',
      sessionIds: ['session-1'],
    },
    {
      categoryIds: ['cat-2'],
      date: '2026-07-10',
      entrantIds: ['ent-2'],
      format: 'test-day',
      id: 'event-2',
      name: 'Spring Test',
      sessionIds: ['session-2'],
    },
  ],
  sessions: [],
};

describe('EntrantsPage integration', () => {
  let container: HTMLDivElement;
  let root: Root;

  useUiConsoleGuards();

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('defaults to active event, allows event switching, and saves entrant edits', async () => {
    const onCreateEntrant = vi.fn();
    const onDeleteEntrant = vi.fn();
    const onUpdateEntrant = vi.fn();

    const Harness = () => {
      const [selectedEventId, setSelectedEventId] = React.useState<string | undefined>(catalog.activeEventId);
      const [selectedEntrantId, setSelectedEntrantId] = React.useState<string | undefined>('ent-1');

      return (
        <EntrantsPage
          catalog={catalog}
          onCreateEntrant={onCreateEntrant}
          onDeleteEntrant={onDeleteEntrant}
          onSelectEntrant={setSelectedEntrantId}
          onSelectEvent={(eventId) => {
            setSelectedEventId(eventId);
            setSelectedEntrantId(catalog.entrants.find((entrant) => entrant.eventId === eventId)?.id);
          }}
          onUpdateEntrant={onUpdateEntrant}
          selectedEntrantId={selectedEntrantId}
          selectedEventId={selectedEventId}
        />
      );
    };

    await act(async () => {
      root.render(<Harness />);
    });

    expect(container.querySelector('h1')?.textContent).toBe('Entrants');
    const eventSelect = container.querySelector('select[aria-label="Entrants Event"]') as HTMLSelectElement;
    expect(eventSelect.value).toBe('event-1');
    expect(container.textContent).toContain('Pat Rider');

    await act(async () => {
      eventSelect.value = 'event-2';
      eventSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.textContent).toContain('Team Blue');

    const createButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Create Entrant');
    expect(createButton).toBeDefined();

    await act(async () => {
      createButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onCreateEntrant).toHaveBeenCalledWith('event-2');

    const entrantNameInput = container.querySelector('input[aria-label="Entrant Name"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(entrantNameInput, 'Team Azure');
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save Entrant');
    expect(saveButton).toBeDefined();

    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onUpdateEntrant).toHaveBeenCalledWith('ent-2', expect.objectContaining({ name: 'Team Azure' }));

    const deleteButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Delete Entrant');
    expect(deleteButton).toBeDefined();

    await act(async () => {
      deleteButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onDeleteEntrant).toHaveBeenCalledWith('event-2', 'ent-2');
  });
});
