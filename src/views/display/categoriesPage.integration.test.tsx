// @vitest-environment jsdom

import { type Root, createRoot } from 'react-dom/client';
import { CategoriesPage } from '../context/Categories.js';
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

const setMultiSelectValues = (select: HTMLSelectElement, values: string[]): void => {
  Array.from(select.options).forEach((option) => {
    option.selected = values.includes(option.value);
  });
  select.dispatchEvent(new Event('change', { bubbles: true }));
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
  deletedEventIds: [],
  entrants: [],
  events: [
    {
      categoryIds: ['cat-1', 'cat-2'],
      date: '2026-06-12',
      entrantIds: ['ent-1', 'ent-2'],
      format: 'race-weekend',
      id: 'event-1',
      name: 'Winter Round',
      sessionIds: ['session-1', 'session-2'],
    },
    {
      categoryIds: ['cat-3'],
      date: '2026-07-10',
      entrantIds: ['ent-3'],
      format: 'test-day',
      id: 'event-2',
      name: 'Spring Test',
      sessionIds: ['session-3'],
    },
  ],
  sessions: [
    {
      eventId: 'event-1',
      id: 'session-1',
      kind: 'race',
      name: 'Feature Race',
      scheduledStart: '2026-06-12T09:00:00.000Z',
      status: 'scheduled',
    },
    {
      eventId: 'event-1',
      id: 'session-2',
      kind: 'practice',
      name: 'Practice',
      scheduledStart: '2026-06-12T08:00:00.000Z',
      status: 'scheduled',
    },
    {
      eventId: 'event-2',
      id: 'session-3',
      kind: 'race',
      name: 'Development Race',
      scheduledStart: '2026-07-10T10:30:00.000Z',
      status: 'scheduled',
    },
  ],
};

const entrantsByCategory: Record<string, EventCatalogState['entrants']> = {
  'cat-1': [
    {
      categoryId: 'cat-1',
      categoryIds: ['cat-1'],
      entrantType: 'team',
      eventId: 'event-1',
      id: 'team-1',
      memberParticipantIds: ['p-1', 'p-2'],
      name: 'Team Red',
      sessionIds: ['session-1'],
    },
    {
      categoryId: 'cat-1',
      categoryIds: ['cat-1'],
      entrantType: 'rider',
      eventId: 'event-1',
      id: 'p-1',
      memberParticipantIds: ['p-1'],
      name: 'Pat Rider',
      sessionIds: ['session-1'],
      teamEntrantId: 'team-1',
    },
    {
      categoryId: 'cat-1',
      categoryIds: ['cat-1'],
      entrantType: 'rider',
      eventId: 'event-1',
      id: 'p-2',
      memberParticipantIds: ['p-2'],
      name: 'Quinn Rider',
      sessionIds: ['session-1'],
      teamEntrantId: 'team-1',
    },
  ],
  'cat-2': [
    {
      categoryId: 'cat-2',
      categoryIds: ['cat-2'],
      entrantType: 'rider',
      eventId: 'event-1',
      id: 'p-3',
      memberParticipantIds: ['p-3'],
      name: 'Taylor Rider',
      sessionIds: ['session-2'],
    },
  ],
  'cat-3': [
    {
      categoryId: 'cat-3',
      categoryIds: ['cat-3'],
      entrantType: 'rider',
      eventId: 'event-2',
      id: 'p-4',
      memberParticipantIds: ['p-4'],
      name: 'Jordan Rider',
      sessionIds: ['session-3'],
    },
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
    expect(container.textContent).toContain('Team Red');
    expect(container.textContent).toContain('Teams');
    expect(container.textContent).not.toContain('Individual Entrants');

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
    const excludeFromResultsInput = container.querySelector('input[aria-label="Category Exclude From Results"]') as HTMLInputElement;
    const teamGenderRulesInput = container.querySelector('textarea[aria-label="Category Team Gender Rules"]') as HTMLTextAreaElement;
    const sessionAssignmentsInput = container.querySelector('select[aria-label="Category Session Assignments"]') as HTMLSelectElement;
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
      excludeFromResultsInput.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      setInputValue(teamGenderRulesInput, 'female:1:2; male:1:3');
      setMultiSelectValues(sessionAssignmentsInput, ['session-3']);
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save Category');
    expect(saveButton).toBeDefined();

    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onUpdateCategory).toHaveBeenCalledWith('cat-3', expect.objectContaining({
      distanceRule: { kind: 'time', value: '1:30' },
      excludeFromResults: true,
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
    expect(container.textContent).toContain('Category ID: cat-3');

    await act(async () => {
      deleteButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onDeleteCategory).toHaveBeenCalledWith('event-2', 'cat-3');
  });

  it('shows category save failures inline without hiding page content', async () => {
    const onCreateCategory = vi.fn();
    const onDeleteCategory = vi.fn();
    const onUpdateCategory = vi.fn().mockRejectedValue(new Error('Category cat-1 does not exist.'));

    await act(async () => {
      root.render(
        <CategoriesPage
          catalog={catalog}
          entrants={entrantsByCategory['cat-1']}
          onCreateCategory={onCreateCategory}
          onDeleteCategory={onDeleteCategory}
          onSelectCategory={vi.fn()}
          onSelectEvent={vi.fn()}
          onUpdateCategory={onUpdateCategory}
          selectedCategoryId="cat-1"
          selectedEventId="event-1"
        />
      );
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save Category');
    expect(saveButton).toBeDefined();

    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    const errorPane = container.querySelector('.category-save-error.error');
    expect(errorPane).toBeTruthy();
    expect(errorPane?.getAttribute('role')).toBe('alert');
    expect(errorPane?.textContent).toContain('!');
    expect(errorPane?.textContent).toContain('Category cat-1 does not exist.');
    expect(container.textContent).toContain('Category Details');
    expect(container.textContent).toContain('Entrants In Category');
    expect(container.textContent).not.toContain('Error loading content');
  });

  it('shows and logs parent event details when the displayed category is missing from the parent event category list', async () => {
    const onDisplayError = vi.fn();
    const mismatchedCatalog: EventCatalogState = {
      ...catalog,
      categories: [
        ...catalog.categories,
        {
          code: 'ORP',
          distanceRule: { kind: 'unspecified' },
          eventId: 'event-1',
          id: 'cat-orphan',
          name: 'Orphan',
          sessionAssignments: [],
          teamRules: { teamCompositionRules: [] },
        },
      ],
    };

    await act(async () => {
      root.render(
        <CategoriesPage
          catalog={mismatchedCatalog}
          entrants={[]}
          onCreateCategory={vi.fn()}
          onDeleteCategory={vi.fn()}
          onDisplayError={onDisplayError}
          onSelectCategory={vi.fn()}
          onSelectEvent={vi.fn()}
          onUpdateCategory={vi.fn()}
          selectedCategoryId="cat-orphan"
          selectedEventId="event-1"
        />
      );
    });

    const parentEventError = container.querySelector('.category-parent-event-error');
    expect(container.textContent).toContain('Category ID: cat-orphan');
    expect(parentEventError?.getAttribute('role')).toBe('alert');
    expect(parentEventError?.textContent).toContain('Category cat-orphan is displayed for the selected event');
    expect(parentEventError?.textContent).toContain('Parent event: id=event-1, name=Winter Round, date=2026-06-12, format=race-weekend.');
    expect(parentEventError?.textContent).toContain('Parent event categoryIds: cat-1, cat-2.');
    expect(onDisplayError).toHaveBeenCalledWith('Categories', expect.any(Error));
    const loggedError = onDisplayError.mock.calls[0]?.[1] as Error;
    expect(loggedError.message).toContain('Category cat-orphan is displayed for the selected event');
    expect(loggedError.message).toContain('Parent event: id=event-1, name=Winter Round, date=2026-06-12, format=race-weekend.');
  });

  it('prompts before replacing a dirty category form and handles save discard and cancel', async () => {
    const onCreateCategory = vi.fn();
    const onDeleteCategory = vi.fn();
    const onUpdateCategory = vi.fn().mockResolvedValue(undefined);

    const Harness = () => {
      const [selectedCategoryId, setSelectedCategoryId] = React.useState<string | undefined>('cat-1');

      return (
        <CategoriesPage
          catalog={catalog}
          entrants={entrantsByCategory[selectedCategoryId || ''] || []}
          onCreateCategory={onCreateCategory}
          onDeleteCategory={onDeleteCategory}
          onSelectCategory={setSelectedCategoryId}
          onSelectEvent={vi.fn()}
          onUpdateCategory={onUpdateCategory}
          selectedCategoryId={selectedCategoryId}
          selectedEventId="event-1"
        />
      );
    };

    await act(async () => {
      root.render(<Harness />);
    });

    const categoryNameInput = container.querySelector('input[aria-label="Category Name"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(categoryNameInput, 'Premier Edited');
    });

    const clubmanButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Clubman'));
    expect(clubmanButton).toBeDefined();

    await act(async () => {
      clubmanButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('.warning-modal-backdrop')).toBeTruthy();
    expect(container.querySelector('.warning-modal')).toBeTruthy();
    expect(container.textContent).toContain('You have unsaved changes to category Premier - save or discard changes?');

    const cancelButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Cancel');
    expect(cancelButton).toBeDefined();

    await act(async () => {
      cancelButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onUpdateCategory).not.toHaveBeenCalled();
    expect((container.querySelector('input[aria-label="Category Name"]') as HTMLInputElement).value).toBe('Premier Edited');
    expect(container.textContent).toContain('Pat Rider');
    expect(container.textContent).not.toContain('You have unsaved changes');

    await act(async () => {
      clubmanButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const promptSaveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save');
    expect(promptSaveButton).toBeDefined();

    await act(async () => {
      promptSaveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(onUpdateCategory).toHaveBeenCalledWith('cat-1', expect.objectContaining({ name: 'Premier Edited' }));
    expect(container.textContent).toContain('Taylor Rider');
    expect((container.querySelector('input[aria-label="Category Name"]') as HTMLInputElement).value).toBe('Clubman');

    await act(async () => {
      setInputValue(container.querySelector('input[aria-label="Category Name"]') as HTMLInputElement, 'Clubman Edited');
    });

    const premierButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Premier'));
    expect(premierButton).toBeDefined();

    await act(async () => {
      premierButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const discardButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Discard');
    expect(discardButton).toBeDefined();

    await act(async () => {
      discardButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onUpdateCategory).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Pat Rider');
    expect((container.querySelector('input[aria-label="Category Name"]') as HTMLInputElement).value).toBe('Premier');
  });

  it('registers an unsaved-change guard for external page navigation', async () => {
    let guard: ((action: () => void | Promise<void>) => void) | undefined;
    let navigationCompleted = false;

    await act(async () => {
      root.render(
        <CategoriesPage
          catalog={catalog}
          entrants={entrantsByCategory['cat-1']}
          onCreateCategory={vi.fn()}
          onDeleteCategory={vi.fn()}
          onSelectCategory={vi.fn()}
          onSelectEvent={vi.fn()}
          onUnsavedChangesGuardChange={(nextGuard) => {
            guard = nextGuard;
          }}
          onUpdateCategory={vi.fn()}
          selectedCategoryId="cat-1"
          selectedEventId="event-1"
        />
      );
    });

    expect(guard).toBeDefined();

    await act(async () => {
      setInputValue(container.querySelector('input[aria-label="Category Name"]') as HTMLInputElement, 'Premier Edited');
    });

    await act(async () => {
      guard!(() => {
        navigationCompleted = true;
      });
    });

    expect(navigationCompleted).toBe(false);
    expect(container.querySelector('.warning-modal-backdrop')).toBeTruthy();
    expect(container.querySelector('.warning-modal')).toBeTruthy();
    expect(container.textContent).toContain('You have unsaved changes to category Premier - save or discard changes?');

    const discardButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Discard');
    expect(discardButton).toBeDefined();

    await act(async () => {
      discardButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(navigationCompleted).toBe(true);
  });
});
