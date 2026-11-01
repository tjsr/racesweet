import type { EventCatalogState } from '../catalog/eventCatalog.js';
import type { DisplayComponent } from '../model/displayScreen.js';
import type { EventId, SessionId } from '../model/raceevent.js';
import type { RaceState } from '../model/racestate.js';
import { RECORD_TX_CROSSING, type ParticipantPassingRecord, type TimeRecord } from '../model/timerecord.js';

export interface DisplayResultRow {
  categoryId?: string;
  categoryName: string;
  entrantId: string;
  entrantName: string;
  elapsedMilliseconds?: number;
  lastCrossingTime?: string;
  laps: number;
  position: number;
}

export interface DisplayProjection {
  eventName: string;
  eventTimeZone: string;
  generatedAt: string;
  rows: DisplayResultRow[];
  sessionName?: string;
}

export interface DisplaySnapshot {
  items: DisplayComponent[];
  projection: DisplayProjection;
  revision: number;
}

export const buildDisplayProjection = (
  catalog: EventCatalogState,
  eventId: EventId,
  sessionId: SessionId | undefined,
  getRaceState: (eventId: EventId, sessionId: SessionId) => Partial<RaceState> | undefined,
  generatedAt: string = new Date().toISOString(),
): DisplayProjection => {
  const event = catalog.events.find((candidate) => candidate.id === eventId);
  if (!event) throw new Error('Display event is unavailable.');
  const sessions = catalog.sessions.filter((candidate) => candidate.eventId === eventId &&
    (sessionId === undefined || candidate.id === sessionId));
  if (sessionId && sessions.length === 0) throw new Error('Display session is unavailable.');
  const rowsByEntrant: Map<string, DisplayResultRow> = new Map<string, DisplayResultRow>();
  catalog.entrants.filter((entrant) => entrant.eventId === eventId && !entrant.deleted).forEach((entrant): void => {
    const category = catalog.categories.find((candidate) => candidate.id === entrant.categoryId);
    rowsByEntrant.set(entrant.id, {
      categoryId: entrant.categoryId,
      categoryName: category?.name || '',
      entrantId: entrant.id,
      entrantName: entrant.name,
      laps: 0,
      position: 0,
    });
  });
  sessions.forEach((session): void => {
    const raceState: Partial<RaceState> = getRaceState(eventId, session.id) || {};
    const entrantByParticipant: Map<string, string> = new Map<string, string>(
      (raceState.participants || []).map((participant): [string, string] => [participant.id, participant.entrantId]),
    );
    (raceState.records || []).forEach((record: TimeRecord): void => {
      if ((record.recordType & RECORD_TX_CROSSING) === 0) return;
      const passing: ParticipantPassingRecord = record as ParticipantPassingRecord;
      if (passing.isManuallyExcluded || passing.isExcluded || passing.isValid === false ||
        passing.isLapCompletion === false || (passing.lineNumber !== undefined && passing.lineNumber !== 1)) return;
      const entrantId: string | undefined = passing.entrantId ||
        (passing.participantId ? entrantByParticipant.get(passing.participantId) : undefined);
      const row: DisplayResultRow | undefined = entrantId ? rowsByEntrant.get(entrantId) : undefined;
      if (!row) return;
      row.laps += 1;
      if (typeof passing.elapsedTime === 'number') row.elapsedMilliseconds = passing.elapsedTime;
      if (passing.time) {
        const time: Date = passing.time instanceof Date ? passing.time : new Date(passing.time);
        if (Number.isFinite(time.getTime()) && (!row.lastCrossingTime || time.toISOString() > row.lastCrossingTime)) {
          row.lastCrossingTime = time.toISOString();
        }
      }
    });
  });
  const rows: DisplayResultRow[] = [...rowsByEntrant.values()].sort((left, right): number =>
    right.laps - left.laps ||
    (left.elapsedMilliseconds ?? Number.POSITIVE_INFINITY) - (right.elapsedMilliseconds ?? Number.POSITIVE_INFINITY) ||
    left.entrantName.localeCompare(right.entrantName));
  rows.forEach((row: DisplayResultRow, index: number): void => { row.position = index + 1; });
  return {
    eventName: event.name,
    eventTimeZone: event.timeZone || 'UTC',
    generatedAt,
    rows,
    sessionName: sessionId ? sessions[0]?.name : undefined,
  };
};
