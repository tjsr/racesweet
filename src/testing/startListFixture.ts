import { type EventCatalogState, createDefaultEventCatalogState } from '../catalog/eventCatalog.js';
import type { ParticipateRacePlate } from '../model/eventparticipant.js';

export const createStartListFixture = (): EventCatalogState => ({
  ...createDefaultEventCatalogState(),
  categories: [
    { eventId: 'event-a', id: 'cat-a', name: 'Premier' },
    { eventId: 'event-a', id: 'cat-b', name: 'Clubman' },
    { eventId: 'event-b', id: 'cat-other', name: 'Other class' },
  ],
  entries: [{ categoryId: 'cat-a', entrantId: 'owner', eventId: 'event-a', id: 'entry-a', identifiers: [],
    name: 'Car, "One"', participantIds: ['driver-person'], raceNumber: '7', startOrder: 1, vehicle: 'Roadster' }],
  entrants: [
    { categoryIds: [], entrantType: 'team', eventId: 'event-a', id: 'owner', isEntryOwner: true,
      memberParticipantIds: ['driver-person'], name: 'Race Team' },
    { categoryIds: ['cat-a'], entrantType: 'rider', eventId: 'event-a', id: 'driver',
      memberParticipantIds: ['driver-person'], name: 'Alex Driver', teamEntrantId: 'owner' },
    { categoryIds: ['cat-a'], entrantType: 'rider', eventId: 'event-a', id: 'entrant-10',
      identifiers: [{ fromTime: undefined, racePlate: '10', toTime: undefined } as ParticipateRacePlate], memberParticipantIds: [], name: 'Ten', startOrder: 3 },
    { categoryIds: ['cat-a'], entrantType: 'rider', eventId: 'event-a', id: 'entrant-2',
      identifiers: [{ fromTime: undefined, racePlate: '2', toTime: undefined } as ParticipateRacePlate], memberParticipantIds: [], name: 'Two', startOrder: 3 },
    { categoryIds: ['cat-b'], entrantType: 'rider', eventId: 'event-a', id: 'unpositioned',
      memberParticipantIds: [], name: 'No position' },
    { categoryIds: [], entrantType: 'rider', eventId: 'event-a', id: 'uncategorized',
      memberParticipantIds: [], name: 'Uncategorized', sessionIds: ['session-a'] },
    { categoryIds: ['cat-other'], entrantType: 'rider', eventId: 'event-b', id: 'other-person',
      memberParticipantIds: [], name: 'Other person', startOrder: 1 },
  ],
  events: [
    { categoryIds: ['cat-a', 'cat-b'], date: '2026-11-05', entrantIds: [], format: 'race-weekend', id: 'event-a', name: 'Round A', sessionIds: ['session-a'] },
    { categoryIds: ['cat-other'], date: '2026-11-06', entrantIds: [], format: 'race-weekend', id: 'event-b', name: 'Round B', sessionIds: ['session-b'] },
  ],
  sessions: [
    { categoryIds: ['cat-a', 'cat-b'], eventId: 'event-a', id: 'session-a', kind: 'race', name: 'Feature',
      scheduledStart: '2026-11-05T00:00:00Z', startSequence: [{ id: 'wave-a', offset: 'PT0S', type: 'start-wave' },
        { categoryId: 'cat-a', type: 'category' }], status: 'scheduled' },
    { categoryIds: ['cat-other'], eventId: 'event-b', id: 'session-b', kind: 'race', name: 'Other session',
      scheduledStart: '2026-11-06T00:00:00Z', status: 'scheduled' },
  ],
});
