// @vitest-environment jsdom

import { flushSync } from 'react-dom';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type DataSourceConfig } from '../../app/systemConfig.js';
import { DataSourcesPanel } from './dataSources.js';

describe('MR-SCATS TRACK.CFG preview', () => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(() => {
    root?.unmount();
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it('opens a TRACK.CFG preview dialog from the MR-SCATS file inventory table', async () => {
    const onPreviewMrScatsDataFile = vi.fn(async () => ({
      columns: ['Network', 'Line', 'Line name', 'Loop', 'Site address', 'Card', 'Com port'],
      displayedRowCount: 2,
      fileKind: 'track-config' as const,
      fileName: 'TRACK.CFG',
      parser: 'text' as const,
      recordCount: 2,
      rows: [
        {
          Card: 1,
          'Com port': 2,
          Line: 5,
          'Line name': 'Pit Exit : Pits',
          Loop: 1,
          Network: 'South Network',
          'Site address': 35,
        },
        {
          Card: 1,
          'Com port': 2,
          Line: 5,
          'Line name': 'Pit Exit : Pits',
          Loop: 2,
          Network: 'South Network',
          'Site address': 35,
        },
      ],
      warnings: ['TRACK.CFG preview: 1 network, 1 line, 2 loops.'],
    }));
    const source: DataSourceConfig = {
      enabled: true,
      id: 'source-mr-scats',
      mrScatsConfig: {
        dataLocationPath: 'C:/RaceTime/timing-data/W9721',
        files: [
          {
            extension: '.cfg',
            kind: 'track-config',
            name: 'TRACK.CFG',
            relativePath: 'TRACK.CFG',
            size: 128,
          },
        ],
        sourceKind: 'directory',
      },
      name: 'MR-SCATS Source',
      type: 'file-mr-scats-data',
    };

    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    flushSync(() => {
      root?.render(
        <DataSourcesPanel
          dataSources={[source]}
          onCreateSource={vi.fn()}
          onDeleteSource={vi.fn()}
          onFetchApicalDataNow={vi.fn()}
          onLoadApicalEvents={vi.fn()}
          onPreviewMrScatsDataFile={onPreviewMrScatsDataFile}
          onReprocessApicalData={vi.fn()}
          onSaveSource={vi.fn()}
        />,
      );
    });

    const sourceRow = Array.from(container.querySelectorAll('tbody tr')).find((row) => row.textContent?.includes('MR-SCATS Source'));
    expect(sourceRow).toBeDefined();
    flushSync(() => {
      sourceRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const previewButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'TRACK.CFG');
    expect(previewButton).toBeDefined();
    previewButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(onPreviewMrScatsDataFile).toHaveBeenCalledWith('source-mr-scats', expect.objectContaining({
      relativePath: 'TRACK.CFG',
    }));
    const previewDialog = container.querySelector('[role="dialog"]');
    expect(previewDialog?.classList.contains('mr-scats-preview-dialog')).toBe(true);
    expect(previewDialog?.textContent).toContain('TRACK.CFG');
    expect(previewDialog?.textContent).toContain('South Network');
    expect(previewDialog?.textContent).toContain('Pit Exit : Pits');
  });
});
