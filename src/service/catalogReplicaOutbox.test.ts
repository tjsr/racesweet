import { describe, expect, it, vi } from 'vitest';
import { type EventCatalogLedger, type EventCatalogMutation, createDefaultEventCatalogLedger } from '../ledger/eventCatalogLedger.js';
import { CatalogReplicaOutbox } from './catalogReplicaOutbox.js';

const mutation = (id: string): EventCatalogMutation => ({ id, timestamp: '2026-07-31T00:00:00.000Z', type: 'event-created' } as EventCatalogMutation);

describe('CatalogReplicaOutbox', () => {
  it('queues only mutations added after the native ledger has been durably persisted', async () => {
    const enqueuePersistedMutations = vi.fn(async (): Promise<void> => undefined);
    const outbox = new CatalogReplicaOutbox({ enqueuePersistedMutations });
    const initialLedger: EventCatalogLedger = { ...createDefaultEventCatalogLedger(), mutations: [mutation('existing')] };
    outbox.initialize(initialLedger);

    await outbox.enqueueNewPersistedMutations({ ...initialLedger, mutations: [...initialLedger.mutations, mutation('new-1'), mutation('new-2')] });
    await outbox.enqueueNewPersistedMutations({ ...initialLedger, mutations: [...initialLedger.mutations, mutation('new-1'), mutation('new-2')] });

    expect(enqueuePersistedMutations).toHaveBeenCalledTimes(1);
    expect(enqueuePersistedMutations).toHaveBeenCalledWith([mutation('new-1'), mutation('new-2')]);
  });
});
