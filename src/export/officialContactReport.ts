import type { OfficialContactRow } from '../processing/officialContacts.js';
import type { TabularReport } from './tabularReport.js';

export const createOfficialContactReport = (
  rows: OfficialContactRow[],
  detailed: boolean,
  title: string,
): TabularReport => ({
  columns: [
    'Name', 'Position', 'Role', 'Event', 'Session', 'Email', 'Phone', 'Responsibilities', 'Availability',
    ...(detailed ? ['Notes'] : []),
  ],
  rows: rows.map((row: OfficialContactRow): string[] => [
    `${row.displayName}${row.archived ? ' (archived)' : ''}`, row.position, row.role, row.eventName,
    row.sessionName, row.email, row.phone, row.responsibilities, row.availability,
    ...(detailed ? [row.notes] : []),
  ]),
  title,
});
