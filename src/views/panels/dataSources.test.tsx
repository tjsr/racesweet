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
  {
    enabled: true,
    id: 'source-mr-scats',
    mrScatsConfig: {
      files: [],
    },
    name: 'MR-SCATS Source',
    type: 'file-mr-scats-data',
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

  it('persists the selected Dorian CTC Import or Update mode', async () => {
    const onSaveSource = vi.fn();
    const onSelectDorianCtcTrackConfigFile = vi.fn(async () => 'C:/RaceTime/timing/TRACK.CFG');
    const ctcSource: DataSourceConfig = {
      enabled: true,
      fileConfig: {
        filePath: 'C:/RaceTime/timing/INDY500.ERF',
        importMode: 'import',
      },
      id: 'source-dorian-ctc',
      name: 'CTC Source',
      type: 'file-dorian-ctc-srt',
    };
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    flushSync(() => {
      root?.render(
        <DataSourcesPanel
          dataSources={[...dataSources, ctcSource]}
          onCreateSource={vi.fn()}
          onDeleteSource={vi.fn()}
          onFetchApicalDataNow={vi.fn()}
          onLoadApicalEvents={vi.fn()}
          onReprocessApicalData={vi.fn()}
          onSaveSource={onSaveSource}
          onSelectDorianCtcTrackConfigFile={onSelectDorianCtcTrackConfigFile}
        />,
      );
    });

    const ctcRow = Array.from(container.querySelectorAll('tbody tr')).find((row) => row.textContent?.includes('CTC Source'));
    flushSync(() => {
      ctcRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const updateRadio = Array.from(container.querySelectorAll('input[type="radio"]')).find((input) => input.parentElement?.textContent?.includes('Update'));

    expect(updateRadio).toBeTruthy();
    flushSync(() => {
      updateRadio?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSaveSource).toHaveBeenCalledWith('source-dorian-ctc', {
      fileConfig: {
        filePath: 'C:/RaceTime/timing/INDY500.ERF',
        importMode: 'update',
      },
    });

    const placeholderCheckbox = Array.from(container.querySelectorAll('label'))
      .find((label) => label.textContent?.includes('Import placeholder entrant for unknown transmitters'))
      ?.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    expect(placeholderCheckbox).toBeTruthy();
    flushSync(() => {
      placeholderCheckbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onSaveSource).toHaveBeenCalledWith('source-dorian-ctc', {
      fileConfig: {
        filePath: 'C:/RaceTime/timing/INDY500.ERF',
        importMode: 'import',
        importPlaceholderEntrantsForUnknownTransmitters: true,
      },
    });

    const trackConfigInput = container.querySelector('input[aria-label="Dorian CTC TRACK.CFG File Path source-dorian-ctc"]') as HTMLInputElement;
    expect(trackConfigInput).toBeTruthy();
    expect(trackConfigInput.placeholder).toBe('No TRACK.CFG selected');
    const trackConfigButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Edit TRACK.CFG');
    expect(trackConfigButton).toBeDefined();
    trackConfigButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    expect(onSelectDorianCtcTrackConfigFile).toHaveBeenCalled();
    expect(onSaveSource).toHaveBeenCalledWith('source-dorian-ctc', {
      fileConfig: {
        filePath: 'C:/RaceTime/timing/INDY500.ERF',
        importMode: 'import',
        trackConfigFilePath: 'C:/RaceTime/timing/TRACK.CFG',
      },
    });
  });

  it('displays parsed Dorian CTC TRACK.CFG networks, lines, and loop mappings', () => {
    const ctcSource: DataSourceConfig = {
      enabled: true,
      fileConfig: {
        ctcTrackConfig: {
          eventDescriptions: {},
          filePath: 'C:/RaceTime/timing/TRACK.CFG',
          networks: [{
            lines: [{
              line: 5,
              loops: [
                { card: 1, comPort: 2, loopNumber: 1, siteAddress: 35 },
                { card: 1, comPort: 2, loopNumber: 2, siteAddress: 35 },
                { card: 2, comPort: 2, loopNumber: 5, siteAddress: 35 },
              ],
              name: 'Pit Exit : Pits',
            }],
            name: 'South Network',
          }],
        },
        filePath: 'C:/RaceTime/timing/INDY500.ERF',
        importMode: 'import',
        trackConfigFilePath: 'C:/RaceTime/timing/TRACK.CFG',
      },
      id: 'source-dorian-ctc',
      name: 'CTC Source',
      type: 'file-dorian-ctc-srt',
    };
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    flushSync(() => {
      root?.render(
        <DataSourcesPanel
          dataSources={[...dataSources, ctcSource]}
          onCreateSource={vi.fn()}
          onDeleteSource={vi.fn()}
          onFetchApicalDataNow={vi.fn()}
          onLoadApicalEvents={vi.fn()}
          onReprocessApicalData={vi.fn()}
          onSaveSource={vi.fn()}
        />,
      );
    });

    const ctcRow = Array.from(container.querySelectorAll('tbody tr')).find((row) => row.textContent?.includes('CTC Source'));
    flushSync(() => {
      ctcRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('TRACK.CFG metadata: 1 network, 1 line, 3 loops');
    const metadataTable = container.querySelector('table[aria-label="Dorian CTC TRACK.CFG Metadata source-dorian-ctc"]');
    expect(metadataTable).toBeTruthy();
    const rows = Array.from(metadataTable!.querySelectorAll('tbody tr')).map((row) => Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent));
    expect(rows).toEqual([
      ['South Network', '5', 'Pit Exit : Pits', '1', '35', '1', '2'],
      ['South Network', '5', 'Pit Exit : Pits', '2', '35', '1', '2'],
      ['South Network', '5', 'Pit Exit : Pits', '5', '35', '2', '2'],
    ]);
  });

  it('selects an MR-SCATS data directory and persists the discovered file list', async () => {
    const onSaveSource = vi.fn();
    const onSelectMrScatsDataDirectory = vi.fn(async () => ({
      files: [
        {
          dbf: {
            fields: [{ decimals: 0, length: 4, name: 'CARNUMBER', type: 'N' }],
            headerLength: 226,
            recordCount: 228,
            recordLength: 30,
            version: 3,
          },
          extension: '.dbf',
          kind: 'dbf-table' as const,
          meetingCode: 'W9721',
          name: 'W9721Q01.DBF',
          relativePath: 'W9721Q01.DBF',
          sessionCode: 'Q',
          sessionNumber: 1,
          size: 7067,
        },
      ],
      locationPath: 'C:/RaceTime/timing-data/W9721',
      sourceKind: 'directory' as const,
    }));
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
          onSaveSource={onSaveSource}
          onSelectMrScatsDataDirectory={onSelectMrScatsDataDirectory}
        />,
      );
    });

    const mrScatsRow = Array.from(container.querySelectorAll('tbody tr')).find((row) => row.textContent?.includes('MR-SCATS Source'));
    expect(mrScatsRow).toBeDefined();
    flushSync(() => {
      mrScatsRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('MR-SCATS Data');
    const locationInput = container.querySelector('input[aria-label="MR-SCATS Data Files Location source-mr-scats"]') as HTMLInputElement;
    expect(locationInput).toBeTruthy();
    expect(locationInput.placeholder).toBe('No file or directory selected');
    const ignoreLineOneCheckbox = container.querySelector('input[aria-label="MR-SCATS Ignore Line 1 NO1 Crossings source-mr-scats"]') as HTMLInputElement;
    expect(ignoreLineOneCheckbox?.checked).toBe(true);
    ignoreLineOneCheckbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    expect(onSaveSource).toHaveBeenCalledWith('source-mr-scats', {
      mrScatsConfig: {
        files: [],
        ignoreLineOneNo1CrossingsWhenDbfPresent: false,
      },
    });
    const disabledLoadEventButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Load event') as HTMLButtonElement | undefined;
    expect(disabledLoadEventButton?.disabled).toBe(true);

    const selectDirectoryButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Select Directory');
    const selectArchiveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Select Archive');
    expect(selectDirectoryButton).toBeDefined();
    expect(selectArchiveButton).toBeDefined();
    selectDirectoryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(onSelectMrScatsDataDirectory).toHaveBeenCalled();
    expect(onSaveSource).toHaveBeenCalledWith('source-mr-scats', {
      mrScatsConfig: {
        dataLocationPath: 'C:/RaceTime/timing-data/W9721',
        files: [
          expect.objectContaining({
            dbf: expect.objectContaining({ recordCount: 228 }),
            relativePath: 'W9721Q01.DBF',
          }),
        ],
        ignoreLineOneNo1CrossingsWhenDbfPresent: true,
        sourceKind: 'directory',
      },
    });
  });

  it('loads an MR-SCATS event from a selected data location', async () => {
    let resolveLoadEvent: (() => void) | undefined;
    const loadEventPromise = new Promise<void>((resolve) => {
      resolveLoadEvent = resolve;
    });
    const onLoadMrScatsEvent = vi.fn((_sourceId: string, onProgress?: (progress: { callerName?: string; completed: number; total: number }) => void) => {
      onProgress?.({ callerName: 'mockLoadMrScatsEvent', completed: 2, total: 7 });
      return loadEventPromise;
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    flushSync(() => {
      root?.render(
        <DataSourcesPanel
          dataSources={dataSources.map((source) => source.id === 'source-mr-scats'
            ? {
              ...source,
              mrScatsConfig: {
                dataLocationPath: 'C:/RaceTime/timing-data/W9721',
                files: [
                  {
                    dbf: {
                      fields: [{ decimals: 0, length: 4, name: 'CARNUMBER', type: 'N' }],
                      headerLength: 65,
                      recordCount: 4,
                      recordLength: 5,
                      version: 3,
                    },
                    extension: '.dbf',
                    kind: 'dbf-table' as const,
                    name: 'W9721R01.DBF',
                    relativePath: 'W9721R01.DBF',
                    size: 85,
                  },
                ],
                sourceKind: 'directory',
              },
            }
            : source)}
          onCreateSource={vi.fn()}
          onDeleteSource={vi.fn()}
          onFetchApicalDataNow={vi.fn()}
          onLoadApicalEvents={vi.fn()}
          onLoadMrScatsEvent={onLoadMrScatsEvent}
          onReprocessApicalData={vi.fn()}
          onSaveSource={vi.fn()}
        />,
      );
    });

    const mrScatsRow = Array.from(container.querySelectorAll('tbody tr')).find((row) => row.textContent?.includes('MR-SCATS Source'));
    expect(mrScatsRow).toBeDefined();
    flushSync(() => {
      mrScatsRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const loadEventButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Load event') as HTMLButtonElement | undefined;
    expect(loadEventButton).toBeDefined();
    expect(loadEventButton?.disabled).toBe(false);
    flushSync(() => {
      loadEventButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(loadEventButton?.disabled).toBe(true);
    const initialLoadEventIndicator = container.querySelector('[role="status"][aria-label="Loading MR-SCATS event"]');
    expect(initialLoadEventIndicator).not.toBeNull();
    expect(initialLoadEventIndicator?.textContent).not.toContain('/');
    expect(initialLoadEventIndicator?.textContent).toContain('handleLoadEvent');

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(onLoadMrScatsEvent).toHaveBeenCalledWith('source-mr-scats', expect.any(Function));
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    const loadEventIndicator = container.querySelector('[role="status"][aria-label="Loading MR-SCATS event"]');
    expect(loadEventIndicator).not.toBeNull();
    expect(loadEventIndicator?.textContent).toContain('2/7');
    expect(loadEventIndicator?.textContent).toContain('mockLoadMrScatsEvent');

    resolveLoadEvent?.();
    await loadEventPromise;
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(container.querySelector('[role="status"][aria-label="Loading MR-SCATS event"]')).toBeNull();
  });

  it('groups MR-SCATS data files into an open General section and collapsed per-session sections', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    flushSync(() => {
      root?.render(
        <DataSourcesPanel
          dataSources={dataSources.map((source) => source.id === 'source-mr-scats'
            ? {
              ...source,
              mrScatsConfig: {
                dataLocationPath: 'C:/RaceTime/timing-data/T9743',
                files: [
                  {
                    dbf: {
                      fields: [{ decimals: 0, length: 4, name: 'CARNUMBER', type: 'N' }],
                      headerLength: 65,
                      recordCount: 1,
                      recordLength: 5,
                      version: 3,
                    },
                    extension: '.dbf',
                    kind: 'dbf-table' as const,
                    name: 'DRIVERS.DBF',
                    relativePath: 'DRIVERS.DBF',
                    size: 120,
                  },
                  {
                    extension: '.dbt',
                    kind: 'dbt-memo' as const,
                    name: 'PRGMME.DBT',
                    relativePath: 'PRGMME.DBT',
                    size: 240,
                  },
                  {
                    dbf: {
                      fields: [{ decimals: 0, length: 4, name: 'CARNUMBER', type: 'N' }],
                      headerLength: 65,
                      recordCount: 3,
                      recordLength: 5,
                      version: 3,
                    },
                    extension: '.dbf',
                    kind: 'dbf-table' as const,
                    meetingCode: 'T9743',
                    name: 'T9743S01.DBF',
                    relativePath: 'T9743S01.DBF',
                    sessionCode: 'S',
                    sessionNumber: 1,
                    size: 360,
                  },
                  {
                    extension: '.pit',
                    kind: 'pit' as const,
                    meetingCode: 'T9743',
                    name: 'T9743S01.PIT',
                    relativePath: 'T9743S01.PIT',
                    sessionCode: 'S',
                    sessionNumber: 1,
                    size: 36,
                  },
                  {
                    extension: '.no1',
                    kind: 'no1-report' as const,
                    meetingCode: 'T9743',
                    name: 'T9743R03.NO1',
                    relativePath: 'T9743R03.NO1',
                    sessionCode: 'R',
                    sessionNumber: 3,
                    size: 420,
                  },
                ],
                sourceKind: 'directory',
              },
            }
            : source)}
          onCreateSource={vi.fn()}
          onDeleteSource={vi.fn()}
          onFetchApicalDataNow={vi.fn()}
          onLoadApicalEvents={vi.fn()}
          onReprocessApicalData={vi.fn()}
          onSaveSource={vi.fn()}
        />,
      );
    });

    const mrScatsRow = Array.from(container.querySelectorAll('tbody tr')).find((row) => row.textContent?.includes('MR-SCATS Source'));
    expect(mrScatsRow).toBeDefined();
    flushSync(() => {
      mrScatsRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const details = Array.from(container.querySelectorAll('details'));
    const generalDetails = details.find((item) => item.querySelector('summary')?.textContent?.includes('General')) as HTMLDetailsElement | undefined;
    const sessionOneDetails = details.find((item) => item.querySelector('summary')?.textContent?.includes('T9743 S01')) as HTMLDetailsElement | undefined;
    const sessionTwoDetails = details.find((item) => item.querySelector('summary')?.textContent?.includes('T9743 R03')) as HTMLDetailsElement | undefined;

    expect(generalDetails).toBeDefined();
    expect(generalDetails?.open).toBe(true);
    expect(generalDetails?.textContent).toContain('DRIVERS.DBF');
    expect(generalDetails?.textContent).toContain('PRGMME.DBT');

    expect(sessionOneDetails).toBeDefined();
    expect(sessionOneDetails?.open).toBe(false);
    expect(sessionOneDetails?.textContent).toContain('T9743S01.DBF');
    expect(sessionOneDetails?.textContent).toContain('T9743S01.PIT');

    expect(sessionTwoDetails).toBeDefined();
    expect(sessionTwoDetails?.open).toBe(false);
    expect(sessionTwoDetails?.textContent).toContain('T9743R03.NO1');
  });

  it('opens an MR-SCATS file preview dialog from the file inventory table', async () => {
    const onPreviewMrScatsDataFile = vi.fn(async () => ({
      calculatedCells: [{ column: 'Time of day', rowIndex: 0 }],
      columns: ['CARNUMBER', 'Time of day', 'DRIVER'],
      displayedRowCount: 1,
      fileKind: 'dbf-table' as const,
      fileName: 'DRIVERS.DBF',
      parser: 'dbf' as const,
      recordCount: 1,
      rows: [{ CARNUMBER: 42, DRIVER: 'Alice Rider', 'Time of day': '01:20.3311 (12:52:00.3311)' }],
      warnings: [],
    }));
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    flushSync(() => {
      root?.render(
        <DataSourcesPanel
          dataSources={dataSources.map((source) => source.id === 'source-mr-scats'
            ? {
              ...source,
              mrScatsConfig: {
                dataLocationPath: 'C:/RaceTime/timing-data/W9721',
                files: [
                  {
                    dbf: {
                      fields: [
                        { decimals: 0, length: 4, name: 'CARNUMBER', type: 'N' },
                        { decimals: 0, length: 20, name: 'DRIVER', type: 'C' },
                      ],
                      headerLength: 97,
                      recordCount: 1,
                      recordLength: 25,
                      version: 3,
                    },
                    extension: '.dbf',
                    kind: 'dbf-table' as const,
                    name: 'DRIVERS.DBF',
                    relativePath: 'DRIVERS.DBF',
                    size: 122,
                  },
                ],
                sourceKind: 'directory',
              },
            }
            : source)}
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

    const mrScatsRow = Array.from(container.querySelectorAll('tbody tr')).find((row) => row.textContent?.includes('MR-SCATS Source'));
    expect(mrScatsRow).toBeDefined();
    flushSync(() => {
      mrScatsRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const previewFileButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'DRIVERS.DBF');
    expect(previewFileButton).toBeDefined();
    previewFileButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(onPreviewMrScatsDataFile).toHaveBeenCalledWith('source-mr-scats', expect.objectContaining({
      relativePath: 'DRIVERS.DBF',
    }));
    const previewDialog = container.querySelector('[role="dialog"]');
    expect(previewDialog?.classList.contains('mr-scats-preview-dialog')).toBe(true);
    expect(previewDialog?.querySelector('.mr-scats-preview-content')).toBeTruthy();
    expect(previewDialog?.textContent).toContain('DRIVERS.DBF');
    expect(previewDialog?.textContent).toContain('Alice Rider');
    expect(previewDialog?.querySelector('.mr-scats-preview-calculated-cell')?.textContent).toBe('01:20.3311 (12:52:00.3311)');
  });
});
