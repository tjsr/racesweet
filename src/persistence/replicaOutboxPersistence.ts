import { type EventCatalogMutation } from '../ledger/eventCatalogLedger.js';

export interface ReplicaOutboxState {
  acknowledgedMutationIds: string[];
  cursor?: string;
  pendingMutations: EventCatalogMutation[];
}

export interface ReplicaOutboxPersistence {
  load(): Promise<ReplicaOutboxState>;
  save(state: ReplicaOutboxState): Promise<void>;
}

export const createDefaultReplicaOutboxState = (): ReplicaOutboxState => ({
  acknowledgedMutationIds: [],
  pendingMutations: [],
});
