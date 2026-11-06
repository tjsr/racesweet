import type { StartListReportRow } from '../processing/startListReport.js';
import type { TabularReport } from './tabularReport.js';

export type StartListLayout = 'start-list' | 'race-grid' | 'marshal-sheet';

export const createStartListExport = (rows: StartListReportRow[], layout: StartListLayout, title: string): TabularReport => {
  const identityColumns: string[] = ['Entrant ID', 'Entry ID'];
  if (layout === 'marshal-sheet') return {
    columns: ['Start group', 'Number', 'Name', 'Class', 'Identifiers', 'Status', ...identityColumns],
    rows: rows.map((row: StartListReportRow): string[] => [row.startGroup, row.raceNumber || 'Missing', row.entrantName,
      row.categoryName, row.identifiers || 'Missing', row.completeness.join('; '), row.entrantId, row.entryId || '']), title,
  };
  if (layout === 'race-grid') return {
    columns: ['Start group', 'Position', 'Number', 'Name', 'Class', 'Status', ...identityColumns],
    rows: rows.map((row: StartListReportRow): string[] => [row.startGroup, row.gridPosition?.toString() || 'Unassigned',
      row.raceNumber || 'Missing', row.entrantName, row.categoryName, row.completeness.join('; '), row.entrantId, row.entryId || '']), title,
  };
  return {
    columns: ['Start group', 'Position', 'Number', 'Name', 'Participants', 'Team', 'Class', 'Session', 'Identifiers', 'Vehicle', 'Status', ...identityColumns],
    rows: rows.map((row: StartListReportRow): string[] => [row.startGroup, row.gridPosition?.toString() || 'Unassigned',
      row.raceNumber || 'Missing', row.entrantName, row.participantNames.join(' / '), row.teamName || 'Individual entry',
      row.categoryName, row.sessionName, row.identifiers || 'Missing', row.vehicle, row.completeness.join('; '), row.entrantId, row.entryId || '']), title,
  };
};
