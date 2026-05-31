// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EventCatalogState } from '../../app/eventCatalog.js';
import { useUiConsoleGuards } from '../../testing/uiConsoleGuards.js';
import { CategoriesPage } from './categoriesPage.js';

const setInputValue = (input: HTMLInputElement | HTMLTextAreaElement, value: string): void => {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

const catalog: EventCatalogState = {
  activeEventId: 'event-1',
  categories: [
    {
      code: 'PW',
      distanceRule: { kind: 'laps', value: 8 },
      eventId: 'event-1',
      id: 'cat-1',
      name: 'Premier',
      sessionAssignments: [{ sessionId: 'session-1', startTime: '2026-06-12T09:00:00.000Z' }],
      teamRules: {
        maxRiderAge: 60,
        maxTeamSize: 2,
        minRiderAge: 16,
        teamCompositionRules: [{ gender: 'female', max: 2, min: 0 }],
      },
    },
    {
      code: 'CLB',
      distanceRule: { kind: 'time', value: '45' },
      eventId: 'event-1',
      id: 'cat-2',
      name: 'Clubman',
      sessionAssignments: [],
      teamRules: { teamCompositionRules: [] },
    },
    {
      code: 'CLB',
      distanceRule: { kind: 'time', value: '45' },
      eventId: 'event-1',
      id: 'cat-2-duplicate',
      name: 'Clubman',
      sessionAssignments: [],
      teamRules: { teamCompositionRules: [] },
    },
    {
      code: 'DEV',
      distanceRule: { kind: 'unspecified' },
      eventId: 'event-2',
      id: 'cat-3',
      name: 'Development',
      sessionAssignments: [],
      teamRules: { teamCompositionRules: [] },
    },
  ],
  entrants: [],
  events: [
    {
      categoryIds: ['cat-1', 'cat-2'],
      date: '2026-06-12',
      entrantIds: ['ent-1', 'ent-2'],
      format: 'race-weekend',
      id: 'event-1',
      name: 'Winter Round',
      sessionIds: [],
    },
    {
      categoryIds: ['cat-3'],
      date: '2026-07-10',
      entrantIds: ['ent-3'],
      format: 'test-day',
      id: 'event-2',
      name: 'Spring Test',
      sessionIds: [],
    },
  ],
  sessions: [],
};

const entrantsByCategory: Record<string, Array<{ entrantId: string; id: string; name: string }>> = {
  'cat-1': [
    { entrantId: 'ent-1', id: 'p-1', name: 'Pat Rider' },
    { entrantId: 'ent-2', id: 'p-2', name: 'Quinn Rider' },
  ],
  'cat-2': [
    { entrantId: 'ent-2', id: 'p-3', name: 'Taylor Rider' },
  ],
  'cat-3': [
    { entrantId: 'ent-3', id: 'p-4', name: 'Jordan Rider' },
  ],
};

describe('CategoriesPage integration', () => {
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

  it('defaults to active event, shows category entrant summary, and saves category rules', async () => {
    const onCreateCategory = vi.fn();
    const onDeleteCategory = vi.fn();
    const onUpdateCategory = vi.fn();

    const Harness = () => {
      const [selectedEventId, setSelectedEventId] = React.useState<string | undefined>(catalog.activeEventId);
      const [selectedCategoryId, setSelectedCategoryId] = React.useState<string | undefined>('cat-1');

      return (
        <CategoriesPage
          catalog={catalog}
          entrants={entrantsByCategory[selectedCategoryId || ''] || []}
          onCreateCategory={onCreateCategory}
          onDeleteCategory={onDeleteCategory}
          onSelectCategory={setSelectedCategoryId}
          onSelectEvent={(eventId) => {
            setSelectedEventId(eventId);
            setSelectedCategoryId(catalog.categories.find((category) => category.eventId === eventId)?.id);
          }}
          onUpdateCategory={onUpdateCategory}
          selectedCategoryId={selectedCategoryId}
          selectedEventId={selectedEventId}
        />
      );
    };

    await act(async () => {
      root.render(<Harness />);
    });

    expect(container.querySelector('h1')?.textContent).toBe('Categories');
    const eventSelect = container.querySelector('select[aria-label="Categories Event"]') as HTMLSelectElement;
    expect(eventSelect.value).toBe('event-1');
    expect(container.textContent).toContain('Pat Rider');
    expect(container.textContent).toContain('Quinn Rider');

    const clubmanButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Clubman'));
    expect(clubmanButton).toBeDefined();
    expect(Array.from(container.querySelectorAll('button')).filter((button) => button.textContent?.includes('Clubman'))).toHaveLength(1);

    await act(async () => {
      clubmanButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Taylor Rider');
    expect(container.textContent).not.toContain('Pat Rider');

    await act(async () => {
      eventSelect.value = 'event-2';
      eventSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.textContent).toContain('Development');
    expect(container.textContent).toContain('Jordan Rider');

    const createButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Create Category');
    expect(createButton).toBeDefined();

    await act(async () => {
      createButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onCreateCategory).toHaveBeenCalledWith('event-2');

    const categoryNameInput = container.querySelector('input[aria-label="Category Name"]') as HTMLInputElement;
    const distanceRuleTypeInput = container.querySelector('select[aria-label="Category Distance Rule Type"]') as HTMLSelectElement;
    const maxTeamSizeInput = container.querySelector('input[aria-label="Category Max Team Size"]') as HTMLInputElement;
    const minRiderAgeInput = container.querySelector('input[aria-label="Category Min Rider Age"]') as HTMLInputElement;
    const maxRiderAgeInput = container.querySelector('input[aria-label="Category Max Rider Age"]') as HTMLInputElement;
    const teamGenderRulesInput = container.querySelector('textarea[aria-label="Category Team Gender Rules"]') as HTMLTextAreaElement;
    const sessionAssignmentsInput = container.querySelector('textarea[aria-label="Category Session Assignments"]') as HTMLTextAreaElement;
    await act(async () => {
      setInputValue(categoryNameInput, 'Development Cup');
      distanceRuleTypeInput.value = 'time';
      distanceRuleTypeInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const distanceRuleValueInput = container.querySelector('input[aria-label="Category Distance Rule Value"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(distanceRuleValueInput, '1:30');
      setInputValue(maxTeamSizeInput, '3');
      setInputValue(minRiderAgeInput, '15');
      setInputValue(maxRiderAgeInput, '55');
      setInputValue(teamGenderRulesInput, 'female:1:2; male:1:3');
      setInputValue(sessionAssignmentsInput, 'session-3@2026-07-10T10:30:00.000Z');
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save Category');
    expect(saveButton).toBeDefined();

    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onUpdateCategory).toHaveBeenCalledWith('cat-3', expect.objectContaining({
      distanceRule: { kind: 'time', value: '1:30' },
      name: 'Development Cup',
      sessionAssignments: [{ sessionId: 'session-3', startTime: '2026-07-10T10:30:00.000Z' }],
      teamRules: {
        maxRiderAge: 55,
        maxTeamSize: 3,
        minRiderAge: 15,
        teamCompositionRules: [
          { gender: 'female', max: 2, min: 1 },
          { gender: 'male', max: 3, min: 1 },
        ],
      },
    }));

    const deleteButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Delete Category');
    expect(deleteButton).toBeDefined();

    await act(async () => {
      deleteButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onDeleteCategory).toHaveBeenCalledWith('event-2', 'cat-3');
  });
});
