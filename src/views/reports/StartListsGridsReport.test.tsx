// @vitest-environment jsdom

import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventCatalogState } from '../../catalog/eventCatalog.js';
import type { TabularReport } from '../../export/tabularReport.js';
import { createStartListFixture } from '../../testing/startListFixture.js';
import { StartListsGridsReport } from './StartListsGridsReport.js';

const reportExportMocks = vi.hoisted(() => ({
  createReportPdf: vi.fn((_report: TabularReport): Promise<Blob> => Promise.resolve(new Blob(['pdf']))),
  downloadReportBlob: vi.fn(), printReport: vi.fn(),
}));
vi.mock('../../export/tabularReport.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../export/tabularReport.js')>(), ...reportExportMocks,
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('StartListsGridsReport', (): void => {
  let container: HTMLDivElement;
  let root: Root;
  afterEach(async (): Promise<void> => {
    if (root) await act(async (): Promise<void> => root.unmount());
    container?.remove();
    vi.clearAllMocks();
  });
  const render = async (catalog: EventCatalogState, eventId?: string, sessionId?: string): Promise<void> => {
    if (!container?.isConnected) {
      container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); 
    }
    await act(async (): Promise<void> => root.render(<StartListsGridsReport catalog={catalog} eventId={eventId} sessionId={sessionId} />));
  };
  const click = async (label: string): Promise<void> => {
    const button: HTMLButtonElement | undefined = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((candidate: HTMLButtonElement): boolean => candidate.textContent?.trim() === label);
    if (!button) throw new Error(`Missing ${label} button`);
    await act(async (): Promise<void> => button.click());
  };
  const choose = async (label: string, optionText: string): Promise<void> => {
    const control: HTMLElement | undefined = [...container.querySelectorAll<HTMLElement>('[role="combobox"]')]
      .find((candidate: HTMLElement): boolean => candidate.getAttribute('aria-labelledby')?.split(' ').some((id: string): boolean =>
        document.getElementById(id)?.textContent?.startsWith(label) === true) === true);
    if (!control) throw new Error(`Missing ${label}`);
    await act(async (): Promise<void> => {
      control.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); 
    });
    const option: HTMLElement | undefined = [...document.querySelectorAll<HTMLElement>('[role="option"]')]
      .find((candidate: HTMLElement): boolean => candidate.textContent === optionText);
    if (!option) throw new Error(`Missing option ${optionText}`);
    await act(async (): Promise<void> => option.click());
  };

  it('inherits selection, filters/reflows all layouts, exports identical ordered rows and responds to catalog updates without writes', async (): Promise<void> => {
    const catalog: EventCatalogState = createStartListFixture();
    const initial: string = JSON.stringify(catalog);
    await render(catalog, 'event-a', 'session-a');
    expect(container.textContent).toContain('5 start list rows');
    expect(container.textContent).not.toContain('Other person');
    expect(container.textContent).toContain('Duplicate explicit positions');
    await click('Print');
    const printed: TabularReport = reportExportMocks.printReport.mock.calls[0]![0] as TabularReport;
    await click('Download CSV');
    await click('Download PDF');
    expect(reportExportMocks.createReportPdf).toHaveBeenCalledWith(printed);
    expect(reportExportMocks.downloadReportBlob).toHaveBeenCalledTimes(2);
    await choose('Start list category', 'Premier');
    expect(container.textContent).toContain('3 start list rows');
    await choose('Start list layout', 'Race grid');
    expect(container.querySelector('[aria-label="Race grid"]')).toBeTruthy();
    expect(container.textContent).toContain('Entrant ID: owner');
    await choose('Start list layout', 'Compact marshal sheet');
    expect(container.querySelector('table')?.textContent).toContain('Identifiers');
    expect(JSON.stringify(catalog)).toBe(initial);
    const updated: EventCatalogState = { ...catalog, entrants: catalog.entrants.map((entrant) => entrant.id === 'entrant-2'
      ? { ...entrant, name: 'Updated participant' } : entrant) };
    await render(updated, 'event-a', 'session-a');
    expect(container.textContent).toContain('Updated participant');
    await choose('Start group', 'Unassigned');
    expect(container.textContent).toContain('0 start list rows');
    await click('Download CSV');
    expect(document.body.textContent).toContain('Export an empty report?');
    expect(reportExportMocks.downloadReportBlob).toHaveBeenCalledTimes(2);
    await click('Export empty report');
    expect(reportExportMocks.downloadReportBlob).toHaveBeenCalledTimes(3);
  });

  it('disables export without a valid parent selection and reports export failures', async (): Promise<void> => {
    await render(createStartListFixture());
    expect(container.textContent).toContain('Select an event and session');
    expect([...container.querySelectorAll<HTMLButtonElement>('button')].filter((button) => button.textContent === 'Print')[0]?.disabled).toBe(true);
    await render(createStartListFixture(), 'event-a', 'session-a');
    reportExportMocks.createReportPdf.mockRejectedValueOnce(new Error('PDF unavailable'));
    await click('Download PDF');
    expect(container.textContent).toContain('PDF unavailable');
    expect(container.textContent).toContain('5 start list rows');
  });
});
