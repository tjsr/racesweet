// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EventCatalogState } from '../../app/eventCatalog.js';
import type { SystemConfiguration } from '../../app/systemConfig.js';
import { createDefaultSystemConfiguration } from '../../app/systemConfig.js';
import { useUiConsoleGuards } from '../../testing/uiConsoleGuards.js';
import { SystemPage } from './systemPage.js';

const catalog: EventCatalogState = {
  activeEventId: 'event-1',
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
      sessionIds: ['session-1'],
    },
  ],
  sessions: [
    {
      eventId: 'event-1',
      id: 'session-1',
      kind: 'race',
      name: 'Feature Race',
      notes: '',
      scheduledStart: '2026-06-12T10:00:00.000Z',
      status: 'scheduled',
    },
  ],
};

const config: SystemConfiguration = {
  ...createDefaultSystemConfiguration(),
  dataSources: [
    {
      apiConfig: {
        apicalEventId: 1001,
        authHeaderName: 'Authorization',
        authHeaderValue: 'Bearer token',
        baseUrl: 'https://apicalracetiming.com.au',
        companyId: 2,
        httpTimeoutSeconds: 10,
        live: true,
        pollIntervalSeconds: 30,
        selectedEventIds: [1001],
      },
      enabled: true,
      id: 'source-apical',
      listedEvents: [{ id: 1001, name: 'Round 1' }],
      name: 'Apical Source',
      type: 'api-apical-data-file',
    },
  ],
  eventSourceAssignments: {
    'event-1': ['source-apical'],
  },
  sessionSourceAssignments: {
    'session-1': {
      mode: 'default',
      sourceIds: [],
    },
  },
};

describe('SystemPage integration', () => {
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

  it('renders source controls and dispatches event/session assignments and apply action', async () => {
    const onApplySessionSources = vi.fn();
    const onCreateSource = vi.fn();
    const onDeleteSource = vi.fn();
    const onLoadApicalEvents = vi.fn();
    const onSaveApicalSource = vi.fn();
    const onSaveEventAssignment = vi.fn();
    const onSaveSessionAssignment = vi.fn();

    await act(async () => {
      root.render(
        <SystemPage
          catalog={catalog}
          config={config}
          onApplySessionSources={onApplySessionSources}
          onCreateSource={onCreateSource}
          onDeleteSource={onDeleteSource}
          onLoadApicalEvents={onLoadApicalEvents}
          onSaveApicalSource={onSaveApicalSource}
          onSaveEventAssignment={onSaveEventAssignment}
          onSaveSessionAssignment={onSaveSessionAssignment}
        />,
      );
    });

    expect(container.textContent).toContain('System');
    expect(container.textContent).toContain('Apical Source');

    const addMylapsButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Add MyLaps Decoder');
    expect(addMylapsButton).toBeDefined();
    await act(async () => {
      addMylapsButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onCreateSource).toHaveBeenCalledWith('timing-mylaps-decoder');

    const fetchEventsButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Fetch Apical Events');
    expect(fetchEventsButton).toBeDefined();
    await act(async () => {
      fetchEventsButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onLoadApicalEvents).toHaveBeenCalledWith('source-apical');

    const applyButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Apply Assigned Sources To Session');
    expect(applyButton).toBeDefined();
    await act(async () => {
      applyButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onApplySessionSources).toHaveBeenCalledWith('event-1', 'session-1');
  });
});
