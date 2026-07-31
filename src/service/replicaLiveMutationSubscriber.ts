import { type EventCatalogMutation } from '../ledger/eventCatalogLedger.js';

export interface HostCatalogEventClient {
  subscribe(
    onEvent: (event: { payload: unknown; type: string }) => void,
    onResyncRequired: () => void,
  ): () => void;
}

export interface HostMutationApplier {
  applyRemoteMutations(mutations: EventCatalogMutation[]): Promise<void>;
}

export class ReplicaLiveMutationSubscriber {
  private readonly applier: HostMutationApplier;
  private readonly client: HostCatalogEventClient;
  private unsubscribe: (() => void) | undefined;

  public constructor(client: HostCatalogEventClient, applier: HostMutationApplier) {
    this.client = client;
    this.applier = applier;
  }

  public start(onResyncRequired: () => void): void {
    this.stop();
    this.unsubscribe = this.client.subscribe((event) => {
      if (event.type !== 'catalog.mutations-applied' || !event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) {
        return;
      }
      const mutations = (event.payload as { mutations?: EventCatalogMutation[] }).mutations || [];
      if (mutations.length > 0) {
        void this.applier.applyRemoteMutations(mutations);
      }
    }, onResyncRequired);
  }

  public stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }
}
