import { createSeedEventCatalogLedger } from '../ledger/createSeedEventCatalogLedger.js';
import { applyEventCatalogLedger } from '../ledger/eventCatalogLedger.js';
import type { RaceState } from '../model/racestate.js';
import { RECORD_TX_CROSSING, type ParticipantPassingRecord } from '../model/timerecord.js';
import { buildDisplayProjection } from './displayProjection.js';

describe('buildDisplayProjection', () => {
  it('scopes to the bound event/session and excludes unresolved crossings', () => {
    const catalog = applyEventCatalogLedger(createSeedEventCatalogLedger());
    const event = catalog.events.find((candidate) => candidate.entrantIds.length > 0 && candidate.sessionIds.length > 0)!;
    const session = catalog.sessions.find((candidate) => candidate.eventId === event.id)!;
    const entrant = catalog.entrants.find((candidate) => candidate.eventId === event.id)!;
    const record: ParticipantPassingRecord = {
      entrantId: entrant.id,
      eventId: event.id,
      id: 'known',
      lineNumber: 1,
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      sessionId: session.id,
      source: 'source',
      time: new Date('2026-01-01T00:00:00.000Z'),
    };
    const raceState: Partial<RaceState> = {
      participants: [],
      records: [record, { ...record, id: 'unknown', isManuallyExcluded: true, sequence: 2 }],
    };
    const projection = buildDisplayProjection(catalog, event.id, session.id,
      (_eventId, candidateSessionId): Partial<RaceState> | undefined => candidateSessionId === session.id ? raceState : undefined,
      '2026-01-01T01:00:00.000Z');
    expect(projection.eventName).toBe(event.name);
    expect(projection.sessionName).toBe(session.name);
    expect(projection.rows.find((row) => row.entrantId === entrant.id)?.laps).toBe(1);
    expect(projection.rows[0]?.position).toBe(1);
    expect(projection.generatedAt).toBe('2026-01-01T01:00:00.000Z');
    expect(() => buildDisplayProjection(catalog, event.id, 'wrong-session', () => undefined)).toThrow(/session/);
  });
});
