import { describe, expect, it } from 'vitest';
import { buildStartListReport, type StartListReportRow } from '../processing/startListReport.js';
import { createStartListFixture } from '../testing/startListFixture.js';
import { createStartListExport, type StartListLayout } from './startListReport.js';
import { toReportCsv, toReportPrintHtml, type TabularReport } from './tabularReport.js';

describe('start list exports', (): void => {
  it('keeps the projection order and layout columns identical across print, CSV and PDF input', (): void => {
    const rows: StartListReportRow[] = buildStartListReport(createStartListFixture(), 'event-a', 'session-a').rows;
    const layouts: StartListLayout[] = ['start-list', 'race-grid', 'marshal-sheet'];
    layouts.forEach((layout: StartListLayout): void => {
      const report: TabularReport = createStartListExport(rows, layout, 'Start <list>');
      expect(report.rows).toHaveLength(rows.length);
      expect(report.rows.map((row: string[]): string => row[report.columns.indexOf('Name')]!)).toEqual(rows.map((row): string => row.entrantName));
      expect(toReportCsv(report)).toContain('"Car, ""One"""');
      expect(toReportPrintHtml(report)).toContain('Start &lt;list&gt;');
      expect(toReportPrintHtml(report)).toContain('Car, &quot;One&quot;');
      expect(report.columns).toContain('Entrant ID');
    });
  });
});
