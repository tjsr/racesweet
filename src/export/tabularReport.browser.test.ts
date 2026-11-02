// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TabularReport } from './tabularReport.js';
import { downloadReportBlob, printReport } from './tabularReport.js';

const report: TabularReport = { columns: ['Name'], rows: [['Alex']], title: 'Officials' };

describe('browser report actions', () => {
  afterEach((): void => {
    vi.restoreAllMocks();
  });

  it('downloads a generated Blob and revokes its object URL', () => {
    const createObjectURL = vi.fn((_blob: Blob): string => 'blob:officials');
    const revokeObjectURL = vi.fn((_url: string): void => undefined);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation((): void => undefined);
    vi.useFakeTimers();
    const blob: Blob = new Blob(['Name'], { type: 'text/csv' });
    downloadReportBlob(blob, 'officials.csv');
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:officials');
    vi.useRealTimers();
  });

  it('prints the report and reports blocked popups', () => {
    const write = vi.fn((_html: string): void => undefined);
    const close = vi.fn((): void => undefined);
    const focus = vi.fn((): void => undefined);
    const print = vi.fn((): void => undefined);
    const popup = { document: { close, write }, focus, print } as unknown as Window;
    const open = vi.spyOn(window, 'open').mockReturnValue(popup);
    printReport(report);
    expect(write.mock.calls[0]?.[0]).toContain('Alex');
    expect(print).toHaveBeenCalledTimes(1);
    open.mockReturnValue(null);
    expect((): void => printReport(report)).toThrow(/pop-ups/);
  });
});
