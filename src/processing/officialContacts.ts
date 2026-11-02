import type { EventCatalogState } from '../catalog/eventCatalog.js';
import type { OfficialAssignment, OfficialAvailabilitySlot, OfficialProfile } from '../model/official.js';
import type { EventId, SessionId } from '../model/raceevent.js';

export interface OfficialContactRow {
  archived: boolean;
  assignmentId: string;
  availability: string;
  displayName: string;
  email: string;
  eventName: string;
  notes: string;
  officialId: string;
  phone: string;
  position: string;
  responsibilities: string;
  role: string;
  sessionName: string;
}

export interface OfficialContactFilter {
  eventId: EventId;
  includeArchived?: boolean;
  query?: string;
  sessionId?: SessionId;
}

export const summarizeOfficialAvailability = (slots: OfficialAvailabilitySlot[]): string =>
  slots.map((slot: OfficialAvailabilitySlot): string => {
    const range: string = [slot.startAt, slot.endAt].filter(Boolean).join(' to ');
    return `${slot.status}${range ? `: ${range}` : ''}`;
  }).join('; ');

export const getOfficialContactRows = (
  catalog: EventCatalogState,
  filter: OfficialContactFilter,
): OfficialContactRow[] => {
  const eventName: string = catalog.events.find((event): boolean => event.id === filter.eventId)?.name || '';
  const query: string = filter.query?.trim().toLocaleLowerCase() || '';
  const officials: Map<string, OfficialProfile> = new Map(
    (catalog.officials || []).map((official: OfficialProfile): [string, OfficialProfile] => [official.id, official]),
  );
  return (catalog.officialAssignments || [])
    .filter((assignment: OfficialAssignment): boolean =>
      !assignment.removed && assignment.eventId === filter.eventId &&
      (!filter.sessionId || !assignment.sessionId || assignment.sessionId === filter.sessionId))
    .flatMap((assignment: OfficialAssignment): OfficialContactRow[] => {
      const official: OfficialProfile | undefined = officials.get(assignment.officialId);
      if (!official || (official.archived && !filter.includeArchived)) return [];
      const sessionName: string = assignment.sessionId
        ? catalog.sessions.find((session): boolean => session.id === assignment.sessionId)?.name || ''
        : 'Event-wide';
      const responsibilities: string = assignment.responsibilityOverride || official.responsibilities.join('; ');
      const row: OfficialContactRow = {
        archived: official.archived,
        assignmentId: assignment.id,
        availability: summarizeOfficialAvailability(official.availability),
        displayName: official.displayName,
        email: official.email || '',
        eventName,
        notes: [official.notes, assignment.notes].filter(Boolean).join('; '),
        officialId: official.id,
        phone: official.phone || '',
        position: official.position,
        responsibilities,
        role: assignment.role,
        sessionName,
      };
      const searchable: string = [row.displayName, row.position, row.role, row.email, row.phone,
        row.responsibilities].join(' ').toLocaleLowerCase();
      return !query || searchable.includes(query) ? [row] : [];
    })
    .sort((first: OfficialContactRow, second: OfficialContactRow): number =>
      first.displayName.localeCompare(second.displayName) || first.sessionName.localeCompare(second.sessionName) ||
      first.role.localeCompare(second.role) || first.assignmentId.localeCompare(second.assignmentId));
};
