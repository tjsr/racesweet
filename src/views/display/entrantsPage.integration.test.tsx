// @vitest-environment jsdom

import { type Root, createRoot } from 'react-dom/client';
import { EntrantsPage } from './entrantsPage.js';
import type { EventCatalogState } from '../../app/eventCatalog.js';
import React from 'react';
import { act } from 'react';
import { useUiConsoleGuards } from '../../testing/uiConsoleGuards.js';

const setInputValue = (input: HTMLInputElement | HTMLTextAreaElement, value: string): void => {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

const setSelectValue = (select: HTMLSelectElement, value: string): void => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  descriptor?.set?.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
};

const catalog: EventCatalogState = {
  activeEventId: 'event-1',
  categories: [
    {
      eventId: 'event-1',
      id: 'cat-1',
      name: 'Premier',
      teamRules: { teamCompositionRules: [] },
    },
    {
      eventId: 'event-2',
      id: 'cat-2',
      name: 'Teams',
      teamRules: { maxTeamSize: 2, teamCompositionRules: [] },
    },
    {
      eventId: 'event-2',
      id: 'cat-pro',
      name: 'Pro',
      teamRules: { teamCompositionRules: [] },
    },
  ],
  entrants: [
    {
      categoryId: 'cat-1',
      categoryIds: ['cat-1'],
      dateOfBirth: '2000-01-02',
      entrantType: 'rider',
      eventId: 'event-1',
      firstName: 'Pat',
      gender: 'female',
      id: 'ent-1',
      lastName: 'Rider',
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
      teamMembers: [
        {
          categoryId: 'cat-2',
          firstName: 'Blue',
          lastName: 'One',
          participantId: 'p-2',
        },
        {
          categoryId: 'cat-2',
          firstName: 'Blue',
          lastName: 'Two',
          participantId: 'p-3',
        },
      ],
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
  sessions: [
    {
      eventId: 'event-1',
      id: 'session-1',
      kind: 'race',
      name: 'Premier Race',
      scheduledStart: '2026-06-12T09:00:00.000Z',
      status: 'scheduled',
    },
    {
      eventId: 'event-2',
      id: 'session-2',
      kind: 'race',
      name: 'Teams Race',
      scheduledStart: '2026-07-10T09:00:00.000Z',
      status: 'scheduled',
    },
  ],
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
    const entrantList = container.querySelector('[aria-label="Entrants for selected event"]');
    expect(entrantList?.textContent).not.toContain('ent-1');
    expect(entrantList?.querySelector('.entrant-list-type')?.textContent).toBe('rider');

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

    expect(onCreateEntrant).toHaveBeenCalledWith('event-2', 'rider');

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

  it('edits rider profile fields and updates team composition payloads', async () => {
    const onCreateEntrant = vi.fn();
    const onDeleteEntrant = vi.fn();
    const onSelectEntrant = vi.fn();
    const onSelectEvent = vi.fn();
    const onUpdateEntrant = vi.fn();

    await act(async () => {
      root.render(
        <EntrantsPage
          catalog={catalog}
          onCreateEntrant={onCreateEntrant}
          onDeleteEntrant={onDeleteEntrant}
          onSelectEntrant={onSelectEntrant}
          onSelectEvent={onSelectEvent}
          onUpdateEntrant={onUpdateEntrant}
          selectedEntrantId="ent-1"
          selectedEventId="event-1"
        />,
      );
    });

    const firstNameInput = container.querySelector('input[aria-label="Entrant First Name"]') as HTMLInputElement;
    const surnameInput = container.querySelector('input[aria-label="Entrant Surname"]') as HTMLInputElement;
    const genderInput = container.querySelector('select[aria-label="Entrant Gender"]') as HTMLSelectElement;
    const dobInput = container.querySelector('input[aria-label="Entrant Date Of Birth"]') as HTMLInputElement;
    const categoryInput = container.querySelector('select[aria-label="Entrant Category"]') as HTMLSelectElement;
    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save Entrant');

    await act(async () => {
      setInputValue(firstNameInput, 'Jordan');
      setInputValue(surnameInput, 'Taylor');
      setSelectValue(genderInput, 'female');
      setInputValue(dobInput, '1998-12-24');
      setSelectValue(categoryInput, 'cat-1');
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onUpdateEntrant).toHaveBeenCalledWith('ent-1', expect.objectContaining({
      categoryId: 'cat-1',
      dateOfBirth: '1998-12-24',
      firstName: 'Jordan',
      gender: 'female',
      lastName: 'Taylor',
    }));

    await act(async () => {
      root.render(
        <EntrantsPage
          catalog={catalog}
          onCreateEntrant={onCreateEntrant}
          onDeleteEntrant={onDeleteEntrant}
          onSelectEntrant={onSelectEntrant}
          onSelectEvent={onSelectEvent}
          onUpdateEntrant={onUpdateEntrant}
          selectedEntrantId="ent-2"
          selectedEventId="event-2"
        />,
      );
    });

    const teamCategoryInput = container.querySelector('select[aria-label="Entrant Category"]') as HTMLSelectElement;
    const teamSaveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save Entrant');
    expect(container.textContent).toContain('Team Members');
    expect(container.querySelector('textarea[aria-label="Entrant Team Members"]')).toBeNull();

    await act(async () => {
      setSelectValue(teamCategoryInput, 'cat-pro');
      teamSaveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onUpdateEntrant).toHaveBeenLastCalledWith('ent-2', expect.objectContaining({
      categoryId: 'cat-pro',
    }));
  });
});
