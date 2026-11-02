import { describe, expect, it } from 'vitest';
import type { OfficialContactRow } from '../processing/officialContacts.js';
import { createOfficialContactReport } from './officialContactReport.js';
import { createReportPdf, toReportCsv, toReportPrintHtml } from './tabularReport.js';

const row: OfficialContactRow = {
  archived: false, assignmentId: 'assignment-1', availability: 'available', displayName: 'Alex, "A"',
  email: 'alex@example.org', eventName: 'Round 1', notes: 'Private <note>', officialId: 'official-1',
  phone: '+61 400 000 000', position: 'Marshal', responsibilities: 'Pit lane', role: 'Start',
  sessionName: 'Practice',
};

describe('official contact outputs', () => {
  it('uses the same ordered rows and hides notes in the default layout', () => {
    const normal = createOfficialContactReport([row], false, 'Officials');
    const detailed = createOfficialContactReport([row], true, 'Officials');
    expect(normal.columns).not.toContain('Notes');
    expect(toReportCsv(normal)).not.toContain('Private');
    expect(toReportCsv(detailed)).toContain('"Alex, ""A"""');
    expect(toReportCsv(detailed)).toContain('Private <note>');
    expect(toReportPrintHtml(detailed)).toContain('Private &lt;note&gt;');
    expect(toReportPrintHtml(normal)).not.toContain('Private');
    expect(detailed.rows[0]?.slice(0, normal.columns.length)).toEqual(normal.rows[0]);
  });

  it('generates a PDF from the shared report data', async () => {
    const report = createOfficialContactReport([row], false, 'Officials');
    const pdf: Blob = await createReportPdf(report);
    expect(pdf.type).toBe('application/pdf');
    expect(pdf.size).toBeGreaterThan(500);
    const magic: string = new TextDecoder().decode((await pdf.arrayBuffer()).slice(0, 5));
    expect(magic).toBe('%PDF-');
  });
});
