import { type EventCatalogLedger, type EventCatalogMutation } from '../ledger/eventCatalogLedger.js';

export interface PersistedMutationQueue {
  enqueuePersistedMutations(mutations: EventCatalogMutation[]): Promise<void>;
}

const mutationId = (mutation: EventCatalogMutation): string => mutation.id.toString();

export class CatalogReplicaOutbox {
  private readonly queue: PersistedMutationQueue;
  private persistedMutationIds: Set<string> = new Set<string>();

  public constructor(queue: PersistedMutationQueue) {
    this.queue = queue;
  }

  public initialize(ledger: EventCatalogLedger): void {
    this.persistedMutationIds = new Set(ledger.mutations.map(mutationId));
  }

  public async enqueueNewPersistedMutations(ledger: EventCatalogLedger): Promise<void> {
    const mutations = ledger.mutations.filter((mutation) => !this.persistedMutationIds.has(mutationId(mutation)));
    if (mutations.length === 0) {
      return;
    }
    await this.queue.enqueuePersistedMutations(mutations);
    mutations.forEach((mutation) => this.persistedMutationIds.add(mutationId(mutation)));
  }
}
