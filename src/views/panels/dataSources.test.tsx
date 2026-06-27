// @vitest-environment jsdom

import { flushSync } from 'react-dom';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type DataSourceConfig } from '../../app/systemConfig.js';
import { DataSourcesPanel } from './dataSources.js';

const dataSources: DataSourceConfig[] = [
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
    listedEvents: [
      { id: 1001, name: 'Round 1' },
      { id: 1002, name: 'Round 2' },
    ],
    name: 'Apical Source',
    type: 'api-apical-excel-file',
  },
];

describe('DataSourcesPanel', () => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(() => {
    root?.unmount();
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it('renders the configured data sources section and source type chooser', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    flushSync(() => {
      root?.render(
        <DataSourcesPanel
          dataSources={dataSources}
          onCreateSource={vi.fn()}
          onDeleteSource={vi.fn()}
          onFetchApicalDataNow={vi.fn()}
          onLoadApicalEvents={vi.fn()}
          onReprocessApicalData={vi.fn()}
          onSaveSource={vi.fn()}
        />,
      );
    });

    const headings = Array.from(container.querySelectorAll('h2, h3')).map((heading) => heading.textContent);
    expect(headings).toContain('Configured Data Sources');
    expect(headings).toContain('Apical Source');
    expect(container.querySelector('select[aria-label="New Data Source Type"]')).toBeTruthy();
    expect(container.querySelector('table[aria-label="Configured data sources table"]')).toBeTruthy();
    expect(container.textContent).toContain('Add Data Source');
  });
});
