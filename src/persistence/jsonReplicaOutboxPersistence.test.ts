import { describe, expect, it, vi } from 'vitest';
import { JsonReplicaOutboxPersistence } from './jsonReplicaOutboxPersistence.js';

describe('JsonReplicaOutboxPersistence', () => {
  it('returns an empty outbox when no durable outbox file exists', async () => {
    const persistence = new JsonReplicaOutboxPersistence('replica-outbox.json', {
      readFile: vi.fn(async (): Promise<string> => { throw new Error('ENOENT'); }),
      writeFile: vi.fn(async (): Promise<void> => undefined),
    });

    await expect(persistence.load()).resolves.toEqual({ acknowledgedMutationIds: [], pendingMutations: [] });
  });

  it('round-trips acknowledged and pending mutations through durable JSON', async () => {
    let stored = '';
    const persistence = new JsonReplicaOutboxPersistence('replica-outbox.json', {
      readFile: vi.fn(async (): Promise<string> => stored),
      writeFile: vi.fn(async (_filePath: string, contents: string): Promise<void> => { stored = contents; }),
    });
    const state = { acknowledgedMutationIds: ['mutation-1'], cursor: 'cursor-1', pendingMutations: [{ id: 'mutation-2', timestamp: '2026-07-31T00:00:00.000Z', type: 'event-created' }] } as never;

    await persistence.save(state);
    await expect(persistence.load()).resolves.toEqual(state);
  });
});
