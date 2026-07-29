// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type EventCatalogEntrant } from '../../catalog/eventCatalog.js';
import { type EventEntrantId } from '../../model/entrant.js';
import { EntrantDetailsPanel, type EntrantDraft } from './entrantDetailsPanel.js';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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

const getMuiSelect = (container: HTMLElement, label: string): HTMLElement => {
  const select = container.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  if (!select) {
    throw new Error(`Could not find MUI select with label ${label}.`);
  }
  return select;
};

const getMuiOptionLabels = async (select: HTMLElement): Promise<string[]> => {
  if (select instanceof HTMLSelectElement) {
    return Array.from(select.options).map((option: HTMLOptionElement): string => option.textContent || '');
  }
  await act(async () => {
    select.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  const labels = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).map((option) => option.textContent || '');
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  });
  return labels;
};

const getSelectedOptionLabel = (select: HTMLElement): string => {
  if (select instanceof HTMLSelectElement) {
    return select.selectedOptions[0]?.textContent || '';
  }
  return select.textContent || '';
};

describe('EntrantDetailsPanel', () => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it('renders rider fields and routes save/delete actions', async () => {
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
      startOrder: '',
      teamEntrantId: 'team-1' as EventEntrantId,
      vehicle: '',
    };

    act(() => {
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

    expect(container.textContent).toContain('Driver Details');
    expect(container.textContent).toContain('First Name');
    expect(container.textContent).toContain('Team: Fast Friends');
    expect(await getMuiOptionLabels(getMuiSelect(container, 'Driver Entrant'))).toContain('Fast Friends (team-1)');

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

    act(() => {
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
            startOrder: '',
            teamEntrantId: '' as EventEntrantId,
            vehicle: '',
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

  it('omits deleted categories from the category dropdown', async () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    act(() => {
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
            startOrder: '',
            teamEntrantId: '' as EventEntrantId,
            vehicle: '',
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

    expect(await getMuiOptionLabels(getMuiSelect(container, 'Entrant Category'))).toEqual(['No category', 'Premier']);
  });

  it('keeps motorsport vehicle and category details on the entrant, not the driver', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    act(() => {
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
            startOrder: '3',
            teamEntrantId: 'team-1' as EventEntrantId,
            vehicle: 'Falcon GT',
          }}
          eventCategories={categories}
          isMotorsport
          onDeleteEntrant={() => undefined}
          onSaveEntrant={() => undefined}
          onSetEntrantDraft={() => undefined}
          selectedEntrant={riderEntrant}
          selectedTeamName="Fast Friends"
          showVehicle
          teamEntrants={[teamEntrant]}
          teamMembers={[]}
        />
      );
    });

    expect(container.textContent).toContain('Driver Details');
    expect(container.textContent).toContain('Entrant: Fast Friends');
    expect(container.querySelector('input[aria-label="Entrant Name"]')).toBeNull();
    expect(container.querySelector('[aria-label="Entrant Category"]')).toBeNull();
    expect(container.querySelector('input[aria-label="Entrant Vehicle"]')).toBeNull();
    expect(container.textContent).not.toContain('Team: Fast Friends');
  });

  it('labels the motorsport parent as an entrant and owns vehicle, category, and grid details', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    act(() => {
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
            startOrder: '3',
            teamEntrantId: '' as EventEntrantId,
            vehicle: 'Falcon GT',
          }}
          eventCategories={categories}
          isMotorsport
          onDeleteEntrant={() => undefined}
          onSaveEntrant={() => undefined}
          onSetEntrantDraft={() => undefined}
          selectedEntrant={teamEntrant}
          showVehicle
          teamEntrants={[teamEntrant]}
          teamMembers={['Rider One']}
        />
      );
    });

    expect(container.textContent).toContain('Entrant Details');
    expect(container.textContent).toContain('Entrant Name');
    expect(container.textContent).toContain('Drivers');
    expect(container.textContent).not.toContain('Team Details');
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Entrant Vehicle"]')?.value).toBe('Falcon GT');
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Entrant Start Order"]')?.value).toBe('3');
    expect(getSelectedOptionLabel(getMuiSelect(container, 'Entrant Category'))).toBe('Premier');
  });
});
