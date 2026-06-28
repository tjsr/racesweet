// @vitest-environment jsdom

import * as ReactDomClient from 'react-dom/client';
import * as EventCatalog from '../../app/eventCatalog.js';
import * as SystemConfig from '../../app/systemConfig.js';

import React, { act } from 'react';

import { useUiConsoleGuards } from '../../testing/uiConsoleGuards.js';
import { SessionsPage } from './sessionsPage.js';

type EventCatalogState = EventCatalog.EventCatalogState;
type Root = ReturnType<typeof ReactDomClient.createRoot>;
type SystemConfiguration = ReturnType<typeof SystemConfig.createDefaultSystemConfiguration>;

const setInputValue = (input: HTMLInputElement | HTMLTextAreaElement, value: string): void => {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

const catalog: EventCatalogState = {
  activeEventId: 'event-1',
  activeSessionId: 'session-1',
  categories: [
    {
      eventId: 'event-1',
      id: 'category-1',
      name: 'Solo',
    },
    {
      eventId: 'event-1',
      id: 'category-2',
      name: 'Teams',
      sessionAssignments: [
        {
          sessionId: 'session-1',
          startTime: '2026-06-12T09:00:00.000Z',
        },
      ],
    },
    {
      eventId: 'event-2',
      id: 'category-3',
      name: 'Testing',
    },
  ],
  deletedEventIds: [],
  entrants: [],
  events: [
    {
      categoryIds: ['category-1', 'category-2'],
      date: '2026-06-12',
      entrantIds: [],
      format: 'race-weekend',
      id: 'event-1',
      name: 'Winter Round',
      sessionIds: ['session-1', 'session-2'],
    },
    {
      categoryIds: ['category-3'],
      date: '2026-07-10',
      entrantIds: [],
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
      kind: 'practice',
      name: 'Friday Practice',
      notes: 'Track familiarisation.',
      scheduledStart: '2026-06-12T09:00:00.000Z',
      status: 'scheduled',
    },
    {
      eventId: 'event-1',
      id: 'session-2',
      kind: 'race',
      name: 'Feature Race',
      notes: 'Points paying race.',
      scheduledStart: '2026-06-13T14:00:00.000Z',
      status: 'scheduled',
    },
    {
      eventId: 'event-2',
      id: 'session-3',
      kind: 'qualifying',
      name: 'Test Session',
      notes: 'Data collection only.',
      scheduledStart: '2026-07-10T10:30:00.000Z',
      status: 'draft',
    },
  ],
};

const config: SystemConfiguration = {
  ...SystemConfig.createDefaultSystemConfiguration(),
  dataSources: [
    {
      enabled: true,
      id: 'source-a',
      name: 'Apical Source A',
      type: 'api-apical-excel-file',
    },
    {
      enabled: true,
      id: 'source-b',
      name: 'Archive Feed',
      type: 'file-apical-data-file',
    },
  ],
  eventSourceAssignments: {
    'event-1': ['source-a'],
    'event-2': ['source-b'],
  },
  sessionSourceAssignments: {
    'session-3': {
      mode: 'specific',
      sourceIds: ['source-a'],
    },
  },
};

describe('SessionsPage integration', () => {
  let container: HTMLDivElement;
  let root: Root;

  useUiConsoleGuards();

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = ReactDomClient.createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('defaults to the active event, changes event view from dropdown, and saves session edits', async () => {
    const onApplySessionSources = vi.fn();
    const onCreateSession = vi.fn();
    const onDeleteSession = vi.fn();
    const onMakeSessionActive = vi.fn();
    const onMoveSessionToEvent = vi.fn();
    const onSaveSessionAssignment = vi.fn();
    const onSaveSessionCategoryAssignment = vi.fn();
    const onUpdateSession = vi.fn();

    const Harness = () => {
      const [selectedEventId, setSelectedEventId] = React.useState<string | undefined>(catalog.activeEventId);
      const [selectedSessionId, setSelectedSessionId] = React.useState<string | undefined>('session-1');

      return (
        <SessionsPage
          catalog={catalog}
          config={config}
          onApplySessionSources={onApplySessionSources}
          onCreateSession={onCreateSession}
          onDeleteSession={onDeleteSession}
          onMakeSessionActive={onMakeSessionActive}
          onMoveSessionToEvent={onMoveSessionToEvent}
          onSelectEvent={(eventId) => {
            setSelectedEventId(eventId);
            setSelectedSessionId(catalog.sessions.find((session) => session.eventId === eventId)?.id);
          }}
          onSaveSessionCategoryAssignment={onSaveSessionCategoryAssignment}
          onSaveSessionAssignment={onSaveSessionAssignment}
          onSelectSession={setSelectedSessionId}
          onUpdateSession={onUpdateSession}
          selectedEventId={selectedEventId}
          selectedSessionId={selectedSessionId}
        />
      );
    };

    await act(async () => {
      root.render(<Harness />);
    });

    expect(container.querySelector('h1')?.textContent).toBe('Sessions');
    const eventSelect = container.querySelector('select[aria-label="Sessions Event"]') as HTMLSelectElement;
    expect(eventSelect.value).toBe('event-1');
    expect(container.textContent).toContain('Friday Practice');
    expect(container.textContent).toContain('Active Session');

    await act(async () => {
      eventSelect.value = 'event-2';
      eventSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.textContent).toContain('Test Session');
    expect(container.textContent).toContain('Make Active');

    const createButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Create Session');
    expect(createButton).toBeDefined();

    await act(async () => {
      createButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onCreateSession).toHaveBeenCalledWith('event-2');

    const makeActiveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Make Active');
    expect(makeActiveButton).toBeDefined();

    await act(async () => {
      makeActiveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onMakeSessionActive).toHaveBeenCalledWith('event-2', 'session-3');

    const parentEventSelect = container.querySelector('select[aria-label="Sessions Page Parent Event"]') as HTMLSelectElement;
    expect(parentEventSelect.value).toBe('event-2');

    await act(async () => {
      parentEventSelect.value = 'event-1';
      parentEventSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onMoveSessionToEvent).toHaveBeenCalledWith('session-3', 'event-1');

    const sessionNameInput = container.querySelector('input[aria-label="Sessions Page Name"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(sessionNameInput, 'Updated Test Session');
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save Session');
    expect(saveButton).toBeDefined();

    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onUpdateSession).toHaveBeenCalledWith('session-3', expect.objectContaining({ name: 'Updated Test Session' }));

    const sourceModeSelect = container.querySelector('select[aria-label="Sessions Source Mode"]') as HTMLSelectElement;
    expect(sourceModeSelect).toBeDefined();

    await act(async () => {
      sourceModeSelect.value = 'specific';
      sourceModeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onSaveSessionAssignment).toHaveBeenCalledWith('session-3', 'specific', ['source-a']);

    const applySourcesButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Apply Assigned Sources To Session');
    expect(applySourcesButton).toBeDefined();

    await act(async () => {
      applySourcesButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onApplySessionSources).toHaveBeenCalledWith('event-2', 'session-3');

    const categorySelect = container.querySelector('select[aria-label="Session Category"]') as HTMLSelectElement;
    expect(categorySelect).toBeDefined();
    const availableCategoryLabels = Array.from(categorySelect.options).map((option) => option.textContent);
    expect(availableCategoryLabels).toEqual(['Testing']);
    expect(availableCategoryLabels).not.toContain('Solo');
    expect(availableCategoryLabels).not.toContain('Teams');

    await act(async () => {
      categorySelect.value = 'category-3';
      categorySelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const addCategoryButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Add to session');
    expect(addCategoryButton).toBeDefined();

    await act(async () => {
      addCategoryButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSaveSessionCategoryAssignment).toHaveBeenCalledWith('session-3', 'category-3', true);

    const deleteButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Delete Session');
    expect(deleteButton).toBeDefined();

    await act(async () => {
      deleteButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onDeleteSession).toHaveBeenCalledWith('event-2', 'session-3');
  });

  it('prompts before replacing a dirty session form and saves before continuing', async () => {
    const onUpdateSession = vi.fn().mockResolvedValue(undefined);

    const Harness = () => {
      const [selectedSessionId, setSelectedSessionId] = React.useState<string | undefined>('session-1');

      return (
        <SessionsPage
          catalog={catalog}
          config={config}
          onApplySessionSources={() => undefined}
          onCreateSession={() => undefined}
          onDeleteSession={() => undefined}
          onMakeSessionActive={() => undefined}
          onMoveSessionToEvent={() => undefined}
          onSaveSessionCategoryAssignment={() => undefined}
          onSelectEvent={() => undefined}
          onSaveSessionAssignment={() => undefined}
          onSelectSession={setSelectedSessionId}
          onUpdateSession={onUpdateSession}
          selectedEventId="event-1"
          selectedSessionId={selectedSessionId}
        />
      );
    };

    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      setInputValue(container.querySelector('input[aria-label="Sessions Page Name"]') as HTMLInputElement, 'Practice Edited');
    });

    const featureRaceButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Feature Race'));
    expect(featureRaceButton).toBeDefined();

    await act(async () => {
      featureRaceButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('.warning-modal-backdrop')).toBeTruthy();
    expect(container.textContent).toContain('You have unsaved changes to session Friday Practice - save or discard changes?');

    const promptSaveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save');
    expect(promptSaveButton).toBeDefined();

    await act(async () => {
      promptSaveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(onUpdateSession).toHaveBeenCalledWith('session-1', expect.objectContaining({ name: 'Practice Edited' }));
    expect((container.querySelector('input[aria-label="Sessions Page Name"]') as HTMLInputElement).value).toBe('Feature Race');
  });
});
