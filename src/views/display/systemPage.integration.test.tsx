// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SystemConfiguration } from '../../app/systemConfig.js';
import { createDefaultSystemConfiguration } from '../../app/systemConfig.js';
import { useUiConsoleGuards } from '../../testing/uiConsoleGuards.js';
import { SystemPage } from './systemPage.js';

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

  it('renders source controls and dispatches dropdown add and source config actions', async () => {
    const onCreateSource = vi.fn();
    const onDeleteSource = vi.fn();
    const onLoadApicalEvents = vi.fn();
    const onSaveApicalSource = vi.fn();

    await act(async () => {
      root.render(
        <SystemPage
          config={config}
          onCreateSource={onCreateSource}
          onDeleteSource={onDeleteSource}
          onLoadApicalEvents={onLoadApicalEvents}
          onSaveApicalSource={onSaveApicalSource}
        />,
      );
    });

    expect(container.textContent).toContain('System');
    expect(container.textContent).toContain('Apical Source');

    const sourceTypeSelect = container.querySelector('select[aria-label="New Data Source Type"]') as HTMLSelectElement;
    expect(sourceTypeSelect).toBeDefined();

    await act(async () => {
      sourceTypeSelect.value = 'timing-mylaps-decoder';
      sourceTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const addSourceButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Add Data Source');
    expect(addSourceButton).toBeDefined();

    await act(async () => {
      addSourceButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onCreateSource).toHaveBeenCalledWith('timing-mylaps-decoder');

    const fetchEventsButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Fetch Apical Events');
    expect(fetchEventsButton).toBeDefined();
    await act(async () => {
      fetchEventsButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onLoadApicalEvents).toHaveBeenCalledWith('source-apical');
  });

  it('shows fetched Apical events in dropdown and saves selected event id', async () => {
    const onCreateSource = vi.fn();
    const onDeleteSource = vi.fn();
    const onLoadApicalEvents = vi.fn();
    const onSaveApicalSource = vi.fn();

    await act(async () => {
      root.render(
        <SystemPage
          config={config}
          onCreateSource={onCreateSource}
          onDeleteSource={onDeleteSource}
          onLoadApicalEvents={onLoadApicalEvents}
          onSaveApicalSource={onSaveApicalSource}
        />,
      );
    });

    const eventSelect = container.querySelector('select[aria-label="Apical Selected Event source-apical"]') as HTMLSelectElement;
    expect(eventSelect).toBeDefined();
    expect(eventSelect.options.length).toBe(1);
    expect(eventSelect.value).toBe('1001');

    await act(async () => {
      eventSelect.value = '1001';
      eventSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onSaveApicalSource).toHaveBeenCalledWith('source-apical', expect.objectContaining({
      apiConfig: expect.objectContaining({
        apicalEventId: 1001,
        selectedEventIds: [1001],
      }),
    }));
  });

  it('shows inline error details when fetching Apical events fails', async () => {
    const onCreateSource = vi.fn();
    const onDeleteSource = vi.fn();
    const onLoadApicalEvents = vi.fn(async () => {
      throw new Error('HTTP 401 Unauthorized');
    });
    const onSaveApicalSource = vi.fn();

    await act(async () => {
      root.render(
        <SystemPage
          config={config}
          onCreateSource={onCreateSource}
          onDeleteSource={onDeleteSource}
          onLoadApicalEvents={onLoadApicalEvents}
          onSaveApicalSource={onSaveApicalSource}
        />,
      );
    });

    const fetchEventsButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Fetch Apical Events');
    expect(fetchEventsButton).toBeDefined();

    await act(async () => {
      fetchEventsButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Failed to fetch Apical events: HTTP 401 Unauthorized');
  });
});
