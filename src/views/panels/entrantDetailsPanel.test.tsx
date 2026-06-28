// @vitest-environment jsdom

import React from 'react';
import { flushSync } from 'react-dom';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type EventCatalogEntrant } from '../../app/eventCatalog.js';
import { type EventEntrantId } from '../../model/entrant.js';
import { EntrantDetailsPanel, type EntrantDraft } from './entrantDetailsPanel.js';

const riderEntrant: EventCatalogEntrant = {
  categoryId: 'category-1',
  categoryIds: ['category-1'],
  dateOfBirth: '2000-01-01',
  entrantType: 'rider',
  eventId: 'event-1',
  firstName: 'Rider',
  gender: 'male',
  id: 'rider-1',
  lastName: 'One',
  memberParticipantIds: [],
  name: 'Rider One',
  notes: 'Notes',
  sessionIds: ['session-1'],
  teamEntrantId: 'team-1',
};

const teamEntrant: EventCatalogEntrant = {
  categoryId: 'category-1',
  categoryIds: ['category-1'],
  entrantType: 'team',
  eventId: 'event-1',
  id: 'team-1',
  memberParticipantIds: ['rider-1'],
  name: 'Fast Friends',
  notes: 'Team notes',
  sessionIds: ['session-1'],
};

const categories = [{ id: 'category-1', name: 'Premier' }];
const categoriesWithDeleted = [
  ...categories,
  { deleted: true, id: 'category-deleted', name: 'Deleted Category' },
];

describe('EntrantDetailsPanel', () => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(() => {
    root?.unmount();
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it('renders rider fields and routes save/delete actions', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const onDeleteEntrant = vi.fn();
    const onSaveEntrant = vi.fn();
    const entrantDraft: EntrantDraft = {
      categoryId: 'category-1',
      dateOfBirth: '2000-01-01',
      firstName: 'Rider',
      gender: 'male',
      lastName: 'One',
      name: 'Rider One',
      notes: 'Notes',
      teamEntrantId: 'team-1' as EventEntrantId,
    };

    flushSync(() => {
      root?.render(
        <EntrantDetailsPanel
          entrantDraft={entrantDraft}
          eventCategories={categories}
          onDeleteEntrant={onDeleteEntrant}
          onSaveEntrant={onSaveEntrant}
          onSetEntrantDraft={() => undefined}
          selectedEntrant={riderEntrant}
          selectedTeamName="Fast Friends"
          teamEntrants={[teamEntrant]}
          teamMembers={[]}
        />
      );
    });

    expect(container.textContent).toContain('Entrant Details');
    expect(container.textContent).toContain('First Name');
    expect(container.textContent).toContain('Team: Fast Friends');

    const nameInput = container.querySelector<HTMLInputElement>('input[aria-label="Entrant Name"]');
    expect(nameInput?.value).toBe('Rider One');

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save Entrant');
    const deleteButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Delete Entrant');
    saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    deleteButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSaveEntrant).toHaveBeenCalledTimes(1);
    expect(onDeleteEntrant).toHaveBeenCalledTimes(1);
  });

  it('renders team members for team entrants', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    flushSync(() => {
      root?.render(
        <EntrantDetailsPanel
          entrantDraft={{
            categoryId: 'category-1',
            dateOfBirth: '',
            firstName: '',
            gender: 'unspecified',
            lastName: '',
            name: 'Fast Friends',
            notes: '',
            teamEntrantId: '' as EventEntrantId,
          }}
          eventCategories={categories}
          onDeleteEntrant={() => undefined}
          onSaveEntrant={() => undefined}
          onSetEntrantDraft={() => undefined}
          selectedEntrant={teamEntrant}
          teamEntrants={[teamEntrant]}
          teamMembers={['Rider One']}
        />
      );
    });

    expect(container.textContent).toContain('Team Details');
    expect(container.textContent).toContain('Team Members');
    expect(container.textContent).toContain('Rider One');
  });

  it('omits deleted categories from the category dropdown', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    flushSync(() => {
      root?.render(
        <EntrantDetailsPanel
          entrantDraft={{
            categoryId: 'category-1',
            dateOfBirth: '2000-01-01',
            firstName: 'Rider',
            gender: 'male',
            lastName: 'One',
            name: 'Rider One',
            notes: '',
            teamEntrantId: '' as EventEntrantId,
          }}
          eventCategories={categoriesWithDeleted}
          onDeleteEntrant={() => undefined}
          onSaveEntrant={() => undefined}
          onSetEntrantDraft={() => undefined}
          selectedEntrant={riderEntrant}
          teamEntrants={[]}
          teamMembers={[]}
        />
      );
    });

    const categorySelect = container.querySelector('select[aria-label="Entrant Category"]') as HTMLSelectElement;
    expect(Array.from(categorySelect.options).map((option) => option.textContent)).toEqual(['No category', 'Premier']);
  });
});
