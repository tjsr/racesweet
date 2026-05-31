// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EventCatalogState } from '../../app/eventCatalog.js';
import type { SystemConfiguration } from '../../app/systemConfig.js';
import { createDefaultSystemConfiguration } from '../../app/systemConfig.js';
import { useUiConsoleGuards } from '../../testing/uiConsoleGuards.js';
import { EventsScreen } from './events.js';

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
      eventId: 'event-1',
      id: 'cat-1',
      name: 'Premier',
    },
    {
      eventId: 'event-2',
      id: 'cat-2',
      name: 'Development',
    },
  ],
  entrants: [],
  events: [
    {
      categoryIds: ['cat-1'],
      date: '2026-06-12',
      entrantIds: ['ent-1'],
      format: 'race-weekend',
      id: 'event-1',
      name: 'Winter Round',
      sessionIds: ['session-1', 'session-2'],
    },
    {
      categoryIds: ['cat-2'],
      date: '2026-07-10',
      entrantIds: ['ent-2'],
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
  ...createDefaultSystemConfiguration(),
  dataSources: [
    {
      enabled: true,
      id: 'source-a',
      name: 'Apical Source A',
      type: 'api-apical-data-file',
    },
  ],
  eventSourceAssignments: {
    'event-1': [],
    'event-2': ['source-a'],
  },
};

describe('EventsScreen integration', () => {
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

  it('shows event controls and session lists in both center and right panes', async () => {
    const onActivateEvent = vi.fn();
    const onSaveEventAssignment = vi.fn();
    const onSelectEvent = vi.fn();
    const onSelectSession = vi.fn();
    const onUpdateEvent = vi.fn();

    const Harness = () => {
      const [activeEventId, setActiveEventId] = React.useState<string | undefined>('event-1');
      const [selectedEventId, setSelectedEventId] = React.useState<string | undefined>('event-1');
      const [selectedSessionId, setSelectedSessionId] = React.useState<string | undefined>('session-1');

      return (
        <EventsScreen
          catalog={{ ...catalog, activeEventId }}
          config={config}
          onActivateEvent={(eventId) => {
            onActivateEvent(eventId);
            setActiveEventId(eventId);
          }}
          onSaveEventAssignment={onSaveEventAssignment}
          onSelectEvent={(eventId) => {
            onSelectEvent(eventId);
            setSelectedEventId(eventId);
            setSelectedSessionId(catalog.sessions.find((session) => session.eventId === eventId)?.id);
          }}
          onSelectSession={(sessionId) => {
            onSelectSession(sessionId);
            setSelectedSessionId(sessionId);
          }}
          onUpdateEvent={onUpdateEvent}
          selectedEventId={selectedEventId}
          selectedSessionId={selectedSessionId}
        />
      );
    };

    await act(async () => {
      root.render(<Harness />);
    });

    expect(container.querySelector('h1')?.textContent).toBe('Events');
    expect(container.textContent).toContain('Event Details');
    expect(container.textContent).toContain('Sessions');
    expect(container.textContent).toContain('Session Summary');
    expect(container.textContent).toContain('Winter Round');
    expect(container.textContent).toContain('Friday Practice');

    const springTestButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Spring Test'));
    expect(springTestButton).toBeDefined();

    await act(async () => {
      springTestButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSelectEvent).toHaveBeenCalledWith('event-2');

    const eventNameInput = container.querySelector('input[aria-label="Event Name"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(eventNameInput, 'Winter Championship Round');
    });

    const saveEventButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save Event Details');
    expect(saveEventButton).toBeDefined();

    await act(async () => {
      saveEventButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onUpdateEvent).toHaveBeenCalledWith('event-2', expect.objectContaining({ name: 'Winter Championship Round' }));

    const testSessionButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Test Session'));
    expect(testSessionButton).toBeDefined();

    await act(async () => {
      testSessionButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSelectSession).toHaveBeenCalledWith('session-3');
    expect(container.textContent).toContain('Selected session: Test Session');

    const eventSourceCheckbox = container.querySelector('input[aria-label="Event Source event-2 source-a"]') as HTMLInputElement;
    expect(eventSourceCheckbox).toBeDefined();

    await act(async () => {
      eventSourceCheckbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSaveEventAssignment).toHaveBeenCalledWith('event-2', []);

    const activateButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Mark Active');
    expect(activateButton).toBeDefined();

    await act(async () => {
      activateButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onActivateEvent).toHaveBeenCalledWith('event-2');
  });

  it('maintains source assignment independently per event', async () => {
    const Harness = () => {
      const [selectedEventId, setSelectedEventId] = React.useState<string | undefined>('event-1');
      const [selectedSessionId, setSelectedSessionId] = React.useState<string | undefined>('session-1');
      const [configState, setConfigState] = React.useState<SystemConfiguration>(config);

      return (
        <EventsScreen
          catalog={catalog}
          config={configState}
          onActivateEvent={() => undefined}
          onSaveEventAssignment={(eventId, sourceIds) => {
            setConfigState((current) => ({
              ...current,
              eventSourceAssignments: {
                ...current.eventSourceAssignments,
                [eventId]: sourceIds,
              },
            }));
          }}
          onSelectEvent={(eventId) => {
            setSelectedEventId(eventId);
            setSelectedSessionId(catalog.sessions.find((session) => session.eventId === eventId)?.id);
          }}
          onSelectSession={setSelectedSessionId}
          onUpdateEvent={() => undefined}
          selectedEventId={selectedEventId}
          selectedSessionId={selectedSessionId}
        />
      );
    };

    await act(async () => {
      root.render(<Harness />);
    });

    const event1Checkbox = container.querySelector('input[aria-label="Event Source event-1 source-a"]') as HTMLInputElement;
    expect(event1Checkbox).toBeDefined();
    expect(event1Checkbox.checked).toBe(false);

    await act(async () => {
      event1Checkbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const event1CheckboxAfterAssign = container.querySelector('input[aria-label="Event Source event-1 source-a"]') as HTMLInputElement;
    expect(event1CheckboxAfterAssign.checked).toBe(true);

    const springTestButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Spring Test'));
    expect(springTestButton).toBeDefined();

    await act(async () => {
      springTestButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const event2Checkbox = container.querySelector('input[aria-label="Event Source event-2 source-a"]') as HTMLInputElement;
    expect(event2Checkbox).toBeDefined();
    expect(event2Checkbox.checked).toBe(true);

    await act(async () => {
      event2Checkbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const event2CheckboxAfterClear = container.querySelector('input[aria-label="Event Source event-2 source-a"]') as HTMLInputElement;
    expect(event2CheckboxAfterClear.checked).toBe(false);

    const winterRoundButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Winter Round'));
    expect(winterRoundButton).toBeDefined();

    await act(async () => {
      winterRoundButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const event1CheckboxFinal = container.querySelector('input[aria-label="Event Source event-1 source-a"]') as HTMLInputElement;
    expect(event1CheckboxFinal.checked).toBe(true);
  });
});
