import { describe, expect, it } from 'vitest';
import type { EventCatalogState } from '../catalog/eventCatalog.js';
import { createStartListFixture } from '../testing/startListFixture.js';
import { buildStartListReport, filterStartListRows, type StartListReportProjection } from './startListReport.js';

describe('start list projection', (): void => {
  it('isolates catalog event/session, resolves entry members, uses only explicit positions and stable numeric ordering', (): void => {
    const catalog: EventCatalogState = createStartListFixture();
    const before: string = JSON.stringify(catalog);
    const report: StartListReportProjection = buildStartListReport(catalog, 'event-a', 'session-a');
    expect(report.rows.map((row): string => row.entryId || row.entrantId)).toEqual(['entry-a', 'entrant-2', 'entrant-10', 'unpositioned', 'uncategorized']);
    expect(report.rows[0]).toMatchObject({ entrantId: 'owner', entrantName: 'Car, "One"', gridPosition: 1,
      participantNames: ['Alex Driver'], raceNumber: '7', startGroupId: 'wave:wave-a', teamName: 'Race Team', vehicle: 'Roadster' });
    expect(report.rows[1]?.duplicatePosition).toBe(true);
    expect(report.rows[2]?.duplicatePosition).toBe(true);
    expect(report.rows[3]).toMatchObject({ gridPosition: undefined, startGroup: 'Unassigned' });
    expect(report.rows[4]?.completeness).toEqual(['Missing category', 'Missing identifier', 'Unassigned start position']);
    expect(filterStartListRows(report.rows, { categoryId: 'cat-a' })).toHaveLength(3);
    expect(filterStartListRows(report.rows, { startGroupId: 'unassigned' })).toHaveLength(2);
    expect(filterStartListRows(report.rows, { categoryId: 'cat-a', startGroupId: 'unassigned' })).toEqual([]);
    expect(buildStartListReport(catalog, 'event-a', 'session-b').rows).toEqual([]);
    expect(buildStartListReport(catalog, undefined, undefined).rows).toEqual([]);
    expect(JSON.stringify(catalog)).toBe(before);
  });

  it('skips dangling owners, warns about missing references, and respects explicit session membership', (): void => {
    const catalog: EventCatalogState = createStartListFixture();
    catalog.entries!.push({ entrantId: 'other-person', eventId: 'event-a', id: 'foreign-owner', identifiers: [], participantIds: [] });
    catalog.entries!.push({ entrantId: 'missing', eventId: 'event-a', id: 'missing-owner', identifiers: [], participantIds: [] });
    catalog.entrants.push({ categoryIds: ['missing-category'], entrantType: 'rider', eventId: 'event-a', id: 'dangling',
      memberParticipantIds: [], name: 'Dangling', sessionIds: ['session-a'], teamEntrantId: 'missing-team' });
    catalog.entrants.push({ categoryIds: ['cat-a'], entrantType: 'rider', eventId: 'event-a', id: 'wrong-session',
      memberParticipantIds: [], name: 'Wrong session', sessionIds: ['session-b'] });
    const report: StartListReportProjection = buildStartListReport(catalog, 'event-a', 'session-a');
    expect(report.rows.some((row): boolean => row.entrantId === 'wrong-session' || row.entrantId === 'other-person')).toBe(false);
    expect(report.warnings).toEqual(expect.arrayContaining([
      'Entry foreign-owner references a missing entrant.', 'Entry missing-owner references a missing entrant.',
      'Missing category reference for dangling.', 'Missing team reference for dangling.',
    ]));
    expect(report.rows.find((row): boolean => row.entrantId === 'dangling')?.completeness).toContain('Missing team');
  });
});
