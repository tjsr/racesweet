import { describe, expect, it, vi } from 'vitest';
import { ReplicaLiveMutationSubscriber } from './replicaLiveMutationSubscriber.js';

describe('ReplicaLiveMutationSubscriber', () => {
  it('applies live authoritative catalog mutations and ignores unrelated events', async () => {
    let emit: ((event: { payload: unknown; type: string }) => void) | undefined;
    const applyRemoteMutations = vi.fn(async (): Promise<void> => undefined);
    const subscriber = new ReplicaLiveMutationSubscriber({ subscribe: (onEvent): (() => void) => { emit = onEvent; return (): void => undefined; } }, { applyRemoteMutations });
    subscriber.start(vi.fn());
    emit?.({ payload: {}, type: 'system-config.changed' });
    emit?.({ payload: { mutations: [{ id: 'mutation-1', timestamp: '2026-07-31T00:00:00.000Z', type: 'event-created' }] }, type: 'catalog.mutations-applied' });
    await Promise.resolve();

    expect(applyRemoteMutations).toHaveBeenCalledWith([expect.objectContaining({ id: 'mutation-1' })]);
  });
});
