// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';

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
    {
      enabled: true,
      fileConfig: {
        filePath: '',
      },
      id: 'source-rfid-csv',
      name: 'RFID CSV Source',
      type: 'file-rfid-timing-csv',
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

  useUiConsoleGuards({
    allowErrorPatterns: [/Error loading Apical events for source/],
  });

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
    const onSaveSource = vi.fn();

    await act(async () => {
      root.render(
        <SystemPage
          config={config}
          onCreateSource={onCreateSource}
          onDeleteSource={onDeleteSource}
          onLoadApicalEvents={onLoadApicalEvents}
          onSaveSource={onSaveSource}
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
    const onSaveSource = vi.fn();

    await act(async () => {
      root.render(
        <SystemPage
          config={config}
          onCreateSource={onCreateSource}
          onDeleteSource={onDeleteSource}
          onLoadApicalEvents={onLoadApicalEvents}
          onSaveSource={onSaveSource}
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

    expect(onSaveSource).toHaveBeenCalledWith('source-apical', expect.objectContaining({
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
    const onSaveSource = vi.fn();

    await act(async () => {
      root.render(
        <SystemPage
          config={config}
          onCreateSource={onCreateSource}
          onDeleteSource={onDeleteSource}
          onLoadApicalEvents={onLoadApicalEvents}
          onSaveSource={onSaveSource}
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

  it('opens a local file picker and saves the RFID Timing CSV file path', async () => {
    const sampleFilePath = path.join(process.cwd(), 'src', 'testdata', '2026-05-30.csv');
    const onCreateSource = vi.fn();
    const onDeleteSource = vi.fn();
    const onLoadApicalEvents = vi.fn();
    const onSaveSource = vi.fn();
    const onSelectLocalFile = vi.fn(async () => sampleFilePath);

    await act(async () => {
      root.render(
        <SystemPage
          config={config}
          onCreateSource={onCreateSource}
          onDeleteSource={onDeleteSource}
          onLoadApicalEvents={onLoadApicalEvents}
          onSaveSource={onSaveSource}
          onSelectLocalFile={onSelectLocalFile}
        />,
      );
    });

    const rfidRow = Array.from(container.querySelectorAll('tbody tr')).find((row) => row.textContent?.includes('RFID CSV Source'));
    expect(rfidRow).toBeDefined();

    await act(async () => {
      rfidRow!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('RFID Timing CSV File');
    const filePathInput = container.querySelector('input[aria-label="RFID Timing CSV File Path source-rfid-csv"]') as HTMLInputElement;
    expect(filePathInput).toBeDefined();
    expect(filePathInput.placeholder).toBe('No file selected');

    const editFileButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Edit File');
    expect(editFileButton).toBeDefined();

    await act(async () => {
      editFileButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSelectLocalFile).toHaveBeenCalled();
    expect(onSaveSource).toHaveBeenCalledWith('source-rfid-csv', {
      fileConfig: {
        filePath: sampleFilePath,
      },
    });
  });
});
