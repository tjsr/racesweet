import type { DomainEventEnvelope, ServerRevision } from '../model/serverApi.js';
import { ObservableStore } from './observableStore.js';

export interface DomainEventState {
  lastEvent?: DomainEventEnvelope;
  resyncRequired: boolean;
  revision: ServerRevision;
}

export class DomainEventStore extends ObservableStore<DomainEventState> {
  public constructor(initialRevision: ServerRevision = 0) {
    super({
      resyncRequired: false,
      revision: initialRevision,
    });
  }

  public applyEvent(event: DomainEventEnvelope): void {
    const current: DomainEventState = this.getSnapshot();
    if (event.revision <= current.revision) {
      return;
    }
    if (event.revision !== current.revision + 1) {
      this.setSnapshot({
        ...current,
        resyncRequired: true,
      });
      return;
    }
    this.setSnapshot({
      lastEvent: event,
      resyncRequired: false,
      revision: event.revision,
    });
  }

  public markResyncRequired(): void {
    this.setSnapshot({
      ...this.getSnapshot(),
      resyncRequired: true,
    });
  }

  public reset(revision: ServerRevision): void {
    this.setSnapshot({
      resyncRequired: false,
      revision,
    });
  }
}
