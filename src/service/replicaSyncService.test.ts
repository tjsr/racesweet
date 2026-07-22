import { describe, expect, it, vi } from 'vitest';
import { type EventCatalogMutation } from '../ledger/eventCatalogLedger.js';
import { type ReplicaOutboxState } from '../persistence/replicaOutboxPersistence.js';
import { SyncStore } from '../state/syncStore.js';
import { ReplicaSyncService } from './replicaSyncService.js';

const mutation = {
  eventId: 'event-1',
  id: 'mutation-1',
  timestamp: '2026-01-01T10:00:00.000Z',
  type: 'event-deleted',
} as unknown as EventCatalogMutation;

describe('ReplicaSyncService', () => {
  it('retains a locally durable mutation after a push failure and retries its original ID', async () => {
    let savedState: ReplicaOutboxState = {
      acknowledgedMutationIds: [],
      pendingMutations: [],
    };
    const push = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ acknowledgedMutationIds: ['mutation-1'], cursor: 'cursor-1' });
    const applier = {
      applyRemoteMutations: vi.fn(),
    };
    const service = new ReplicaSyncService(
      applier,
      {
        load: async () => savedState,
        save: async (state) => {
          savedState = state;
        },
      },
      new SyncStore(),
      {
        pull: async () => ({ mutations: [] }),
        push,
      },
    );

    await service.initialize();
    await service.enqueuePersistedMutations([mutation]);
    await expect(service.sync()).rejects.toThrow('offline');
    await service.sync();

    expect(push).toHaveBeenNthCalledWith(1, [mutation]);
    expect(push).toHaveBeenNthCalledWith(2, [mutation]);
    expect(savedState.pendingMutations).toEqual([]);
  });

  it('applies received mutations without placing them in the outbound queue', async () => {
    const incomingMutation = { ...mutation, id: 'mutation-2' } as EventCatalogMutation;
    const applier = {
      applyRemoteMutations: vi.fn(async () => undefined),
    };
    const service = new ReplicaSyncService(
      applier,
      {
        load: async () => ({ acknowledgedMutationIds: [], pendingMutations: [] }),
        save: async () => undefined,
      },
      new SyncStore(),
      {
        pull: async () => ({ cursor: 'cursor-2', mutations: [incomingMutation] }),
        push: async () => ({ acknowledgedMutationIds: [] }),
      },
    );

    await service.initialize();
    await service.sync();

    expect(applier.applyRemoteMutations).toHaveBeenCalledWith([incomingMutation]);
  });
});
