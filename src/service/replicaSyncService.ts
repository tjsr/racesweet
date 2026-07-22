import { type EventCatalogMutation } from '../ledger/eventCatalogLedger.js';
import {
  createDefaultReplicaOutboxState,
  type ReplicaOutboxPersistence,
  type ReplicaOutboxState,
} from '../persistence/replicaOutboxPersistence.js';
import { type SyncStore } from '../state/syncStore.js';

export interface ReplicaTransport {
  pull(cursor: string | undefined): Promise<{ cursor?: string; mutations: EventCatalogMutation[] }>;
  push(mutations: EventCatalogMutation[]): Promise<{ acknowledgedMutationIds: string[]; cursor?: string }>;
}

export interface ReplicaMutationApplier {
  applyRemoteMutations(mutations: EventCatalogMutation[]): Promise<void>;
}

const mutationId = (mutation: EventCatalogMutation): string => mutation.id.toString();

export class ReplicaSyncService {
  private state: ReplicaOutboxState = createDefaultReplicaOutboxState();
  private readonly applier: ReplicaMutationApplier;
  private readonly outboxPersistence: ReplicaOutboxPersistence;
  private readonly store: SyncStore;
  private readonly transport: ReplicaTransport;

  public constructor(
    applier: ReplicaMutationApplier,
    outboxPersistence: ReplicaOutboxPersistence,
    store: SyncStore,
    transport: ReplicaTransport,
  ) {
    this.applier = applier;
    this.outboxPersistence = outboxPersistence;
    this.store = store;
    this.transport = transport;
  }

  public async initialize(): Promise<void> {
    this.state = await this.outboxPersistence.load();
    this.publish();
  }

  public async enqueuePersistedMutations(mutations: EventCatalogMutation[]): Promise<void> {
    const knownIds = new Set([
      ...this.state.acknowledgedMutationIds,
      ...this.state.pendingMutations.map(mutationId),
    ]);
    const pendingMutations = [
      ...this.state.pendingMutations,
      ...mutations.filter((mutation: EventCatalogMutation) => !knownIds.has(mutationId(mutation))),
    ];
    this.state = {
      ...this.state,
      pendingMutations,
    };
    await this.persist();
  }

  public async sync(): Promise<void> {
    try {
      if (this.state.pendingMutations.length > 0) {
        const acknowledgement = await this.transport.push(this.state.pendingMutations);
        const acknowledgedMutationIds = new Set(acknowledgement.acknowledgedMutationIds);
        this.state = {
          ...this.state,
          acknowledgedMutationIds: Array.from(new Set([
            ...this.state.acknowledgedMutationIds,
            ...acknowledgement.acknowledgedMutationIds,
          ])),
          cursor: acknowledgement.cursor || this.state.cursor,
          pendingMutations: this.state.pendingMutations.filter((mutation: EventCatalogMutation) => !acknowledgedMutationIds.has(mutationId(mutation))),
        };
        await this.persist();
      }

      const remote = await this.transport.pull(this.state.cursor);
      if (remote.mutations.length > 0) {
        await this.applier.applyRemoteMutations(remote.mutations);
      }
      this.state = {
        ...this.state,
        cursor: remote.cursor || this.state.cursor,
      };
      await this.persist();
      this.store.setStatus({
        lastSyncedAt: new Date().toISOString(),
        pendingMutationCount: this.state.pendingMutations.length,
      });
    } catch (error: unknown) {
      this.store.setStatus({
        lastError: error instanceof Error ? error.message : String(error),
        pendingMutationCount: this.state.pendingMutations.length,
      });
      throw error;
    }
  }

  private async persist(): Promise<void> {
    await this.outboxPersistence.save(this.state);
    this.publish();
  }

  private publish(): void {
    this.store.setStatus({
      pendingMutationCount: this.state.pendingMutations.length,
    });
  }
}
