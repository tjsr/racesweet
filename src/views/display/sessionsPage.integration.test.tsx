// @vitest-environment jsdom

import React, { act } from 'react';
import * as ReactDomClient from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as EventCatalog from '../../app/eventCatalog.js';
import * as SystemConfig from '../../app/systemConfig.js';
import { SessionsPage } from './sessionsPage.js';
import { useUiConsoleGuards } from '../../testing/uiConsoleGuards.js';

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
  categories: [],
  entrants: [],
  events: [
    {
      categoryIds: [],
      date: '2026-06-12',
      entrantIds: [],
      format: 'race-weekend',
      id: 'event-1',
      name: 'Winter Round',
      sessionIds: ['session-1', 'session-2'],
    },
    {
      categoryIds: [],
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
      type: 'api-apical-data-file',
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
    const onSaveSessionAssignment = vi.fn();
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
          onSelectEvent={(eventId) => {
            setSelectedEventId(eventId);
            setSelectedSessionId(catalog.sessions.find((session) => session.eventId === eventId)?.id);
          }}
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

    const deleteButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Delete Session');
    expect(deleteButton).toBeDefined();

    await act(async () => {
      deleteButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onDeleteSession).toHaveBeenCalledWith('event-2', 'session-3');
  });
});
