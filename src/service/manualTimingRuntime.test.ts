import { describe, expect, it, vi, afterEach } from 'vitest';
import { dateStringInTimeZone, getSystemTimeZone, tableTimeStringInTimeZone } from '../app/utils/timeutils.js';
import { createSeedEventCatalogLedger } from '../ledger/createSeedEventCatalogLedger.js';
import type { EventCatalogLedger } from '../ledger/eventCatalogLedger.js';
import { createMutationId, createTimeRecordId } from '../model/ids.js';
import type { ManualCrossingCommand } from '../model/manualCrossing.js';
import type { ManualCrossingOutboxState } from '../persistence/manualCrossingOutboxPersistence.js';
import { EventCatalogService } from './eventCatalogService.js';
import { createManualTimingOutbox } from './manualTimingRuntime.js';

describe('manual timing API delivery and scoring', (): void => {
  afterEach((): void => { vi.unstubAllGlobals(); });
  it('retains rejected facts but removes them from scoring and refuses mismatched acknowledgement IDs', async (): Promise<void> => {
    let ledger: EventCatalogLedger = createSeedEventCatalogLedger();
    const service: EventCatalogService = await EventCatalogService.create({ load: async (): Promise<EventCatalogLedger> => ledger,
      save: async (next: EventCatalogLedger): Promise<void> => { ledger = next; } });
    const entrant = service.catalog.entrants[0]!;
    const instant: Date = new Date('2026-06-12T00:00:00.000Z');
    const timeZone: string = getSystemTimeZone();
    const command: ManualCrossingCommand = { action: 'record', crossingId: createTimeRecordId(), mutationId: createMutationId(), crossing: {
      entrantId: entrant.id, eventId: entrant.eventId, identifierKind: 'entrant', identifierValue: '101', lineNumber: 1,
      localDate: dateStringInTimeZone(instant, timeZone), localTime: tableTimeStringInTimeZone(instant, timeZone),
      sessionId: entrant.sessionIds![0]!, status: 'scored', time: instant.toISOString(), timeZone,
    } };
    let state: ManualCrossingOutboxState = { items: [], quarantined: [] };
    const fetchMock = vi.fn(async (): Promise<Response> => new Response(JSON.stringify({ crossingId: command.crossingId, mutationId: command.mutationId, status: 'rejected', reason: 'Session closed' }), { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    const outbox = createManualTimingOutbox(service, { load: async (): Promise<ManualCrossingOutboxState> => state,
      save: async (next: ManualCrossingOutboxState): Promise<void> => { state = structuredClone(next); } }, (): void => undefined);
    await outbox.initialize(); await outbox.submit(command);
    expect(outbox.snapshot.items[0]).toMatchObject({ status: 'rejected', lastError: 'Session closed' });
    expect(service.catalog.manualCrossings?.[0]?.status).toBe('needs-attention');
    expect(service.mutations.filter((mutation): boolean => mutation.type.startsWith('manual-crossing'))).toHaveLength(2);
    const mismatched: ManualCrossingCommand = { ...command, crossingId: createTimeRecordId(), mutationId: createMutationId(),
      crossing: { ...command.crossing, identifierValue: '102' } };
    fetchMock.mockImplementation(async (): Promise<Response> => new Response(JSON.stringify({ crossingId: command.crossingId, mutationId: command.mutationId, status: 'accepted' })));
    await outbox.submit(mismatched);
    expect(outbox.snapshot.items[1]).toMatchObject({ status: 'queued', lastError: expect.stringContaining('mismatched') });
  });
});
