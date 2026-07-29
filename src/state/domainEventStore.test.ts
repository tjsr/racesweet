import type { DomainEventEnvelope } from '../model/serverApi.js';
import { DomainEventStore } from './domainEventStore.js';

const createEvent = (revision: number): DomainEventEnvelope => ({
  aggregate: 'catalog',
  id: `event-${revision}`,
  occurredAt: '2026-07-28T00:00:00.000Z',
  payload: {},
  revision,
  type: 'catalog.mutations-applied',
});

describe('DomainEventStore', () => {
  it('applies ordered events and ignores duplicate delivery', () => {
    const store: DomainEventStore = new DomainEventStore();
    store.applyEvent(createEvent(1));
    store.applyEvent(createEvent(1));

    expect(store.getSnapshot()).toMatchObject({
      lastEvent: { id: 'event-1' },
      resyncRequired: false,
      revision: 1,
    });
  });

  it('requires a bootstrap resync when an event revision is skipped', () => {
    const store: DomainEventStore = new DomainEventStore(2);
    store.applyEvent(createEvent(4));

    expect(store.getSnapshot()).toEqual({
      resyncRequired: true,
      revision: 2,
    });

    store.reset(10);
    expect(store.getSnapshot()).toEqual({
      resyncRequired: false,
      revision: 10,
    });
  });
});
