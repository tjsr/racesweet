import { ObservableStore } from './observableStore.js';

export interface SyncState {
  lastError?: string;
  lastSyncedAt?: string;
  pendingMutationCount: number;
}

export const createDefaultSyncState = (): SyncState => ({
  pendingMutationCount: 0,
});

export class SyncStore extends ObservableStore<SyncState> {
  public constructor(initialState: SyncState = createDefaultSyncState()) {
    super(initialState);
  }

  public setStatus(nextState: SyncState): void {
    this.setSnapshot(nextState);
  }
}
