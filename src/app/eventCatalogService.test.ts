import { describe, expect, it, vi } from 'vitest';

import {
  applyEventCatalogLedger,
  createDefaultEventCatalogLedger,
  createSeedEventCatalogLedger,
  getCategoriesForEvent,
  getEntrantsForEvent,
  getSessionsForEvent,
} from './eventCatalog.js';
import { EventCatalogService } from './eventCatalogService.js';
import type { EventCatalogPersistence } from './eventCatalogPersistence.js';
import type { EventParticipant } from '../model/eventparticipant.js';

const createPersistence = (initial = createDefaultEventCatalogLedger()): EventCatalogPersistence => {
  let ledger = initial;

  return {
    load: vi.fn(async () => ledger),
    save: vi.fn(async (nextLedger) => {
      ledger = nextLedger;
    }),
  };
};

describe('EventCatalogService', () => {
  it('seeds the ledger when no events file exists yet', async () => {
    const emptyPersistence = createPersistence();

    const service = await EventCatalogService.create(emptyPersistence);

    expect(service.catalog.events).toHaveLength(1);
    expect(service.catalog.activeEventId).toBe('event-2026-racesweet-round-1');
    expect(service.catalog.entrants.length).toBeGreaterThan(0);
    expect(emptyPersistence.save).toHaveBeenCalledTimes(1);
  });

  it('activates an event by appending a ledger mutation and persisting it', async () => {
    const baseLedger = createSeedEventCatalogLedger();
    const activePersistence = createPersistence({
      ...baseLedger,
      mutations: [
        ...baseLedger.mutations,
        {
          event: {
            categoryIds: [],
            date: '2026-07-01',
            entrantIds: [],
            format: 'test-day',
            id: 'event-2026-test-day',
            name: 'Midwinter Test Day',
            sessionIds: [],
          },
          id: 'mutation-extra-event',
          timestamp: '2026-05-30T01:00:00.000Z',
          type: 'event-created',
        },
      ],
    });
    const service = await EventCatalogService.create(activePersistence);

    await service.activateEvent('event-2026-test-day');

    expect(service.catalog.activeEventId).toBe('event-2026-test-day');
    expect(activePersistence.save).toHaveBeenCalledTimes(1);
  });

  it('updates event, session, and category rule details through immutable ledger changes', async () => {
    const seededPersistence = createPersistence(createSeedEventCatalogLedger());
    const service = await EventCatalogService.create(seededPersistence);

    await service.updateEvent('event-2026-racesweet-round-1', {
      format: 'track-day',
      name: 'RaceSweet Open Track Day',
    });
    await service.updateSession('session-1-practice', {
      name: 'Friday Free Practice',
      status: 'live',
    });
    await service.updateCategory('event-2026-racesweet-round-1-category-premier', {
      distanceRule: { kind: 'time', value: '1:45' },
      sessionAssignments: [{ sessionId: 'session-1-race', startTime: '2026-06-13T14:45:00.000Z' }],
      teamRules: {
        maxRiderAge: 50,
        maxTeamSize: 3,
        minRiderAge: 16,
        teamCompositionRules: [{ gender: 'female', max: 2, min: 1 }],
      },
    });

    const event = service.catalog.events.find((item) => item.id === 'event-2026-racesweet-round-1');
    const session = service.catalog.sessions.find((item) => item.id === 'session-1-practice');
    const category = service.catalog.categories.find((item) => item.id === 'event-2026-racesweet-round-1-category-premier');

    expect(event?.name).toBe('RaceSweet Open Track Day');
    expect(event?.format).toBe('track-day');
    expect(session?.name).toBe('Friday Free Practice');
    expect(session?.status).toBe('live');
    expect(category?.distanceRule).toEqual({ kind: 'time', value: '1:45' });
    expect(category?.teamRules?.maxTeamSize).toBe(3);
    expect(seededPersistence.save).toHaveBeenCalledTimes(3);
  });

  it('syncs categories and entrants from imported event data IDs', async () => {
    const seededPersistence = createPersistence(createSeedEventCatalogLedger());
    const service = await EventCatalogService.create(seededPersistence);

    const participants: EventParticipant[] = [
      {
        categoryId: 'cat-a',
        currentResult: undefined,
        entrantId: 'team-a',
        firstname: 'Pat',
        id: 'p1',
        identifiers: [],
        lastRecordTime: null,
        resultDuration: null,
        surname: 'Rider',
      },
      {
        categoryId: 'cat-b',
        currentResult: undefined,
        entrantId: 'team-a',
        firstname: 'Quinn',
        id: 'p2',
        identifiers: [],
        lastRecordTime: null,
        resultDuration: null,
        surname: 'Rider',
      },
      {
        categoryId: 'cat-c',
        currentResult: undefined,
        entrantId: 'team-b',
        firstname: 'Sam',
        id: 'p3',
        identifiers: [],
        lastRecordTime: null,
        resultDuration: null,
        surname: 'Rider',
      },
    ];

    await service.syncEventScaffold('event-2026-racesweet-round-1', [
      {
        code: 'A',
        description: 'Alpha category',
        id: 'cat-a',
        name: 'Alpha',
      },
      {
        code: 'B',
        description: 'Beta category',
        id: 'cat-b',
        name: 'Beta',
      },
    ], participants);

    const event = service.catalog.events.find((item) => item.id === 'event-2026-racesweet-round-1');
    const categories = getCategoriesForEvent(service.catalog, 'event-2026-racesweet-round-1');
    const entrants = getEntrantsForEvent(service.catalog, 'event-2026-racesweet-round-1');
    const teamA = entrants.find((entrant) => entrant.id === 'team-a');

    expect(event?.categoryIds).toEqual(expect.arrayContaining(['cat-a', 'cat-b', 'cat-c']));
    expect(categories.find((category) => category.id === 'cat-c')).toBeDefined();
    expect(event?.entrantIds).toEqual(expect.arrayContaining(['team-a', 'team-b']));
    expect(teamA?.categoryIds).toEqual(expect.arrayContaining(['cat-a', 'cat-b']));
  });

  it('creates and deletes session/category/entrant through immutable mutations', async () => {
    const seededPersistence = createPersistence(createSeedEventCatalogLedger());
    const service = await EventCatalogService.create(seededPersistence);

    await service.createSession('event-2026-racesweet-round-1');
    let sessions = getSessionsForEvent(service.catalog, 'event-2026-racesweet-round-1');
    const createdSessionId = sessions.find((session) => session.name === 'New Session')?.id;
    expect(createdSessionId).toBeDefined();
    await service.deleteSession('event-2026-racesweet-round-1', createdSessionId!);

    await service.createCategory('event-2026-racesweet-round-1');
    let categories = getCategoriesForEvent(service.catalog, 'event-2026-racesweet-round-1');
    const createdCategoryId = categories.find((category) => category.name === 'New Category')?.id;
    expect(createdCategoryId).toBeDefined();
    await service.deleteCategory('event-2026-racesweet-round-1', createdCategoryId!.toString());

    await service.createEntrant('event-2026-racesweet-round-1');
    let entrants = getEntrantsForEvent(service.catalog, 'event-2026-racesweet-round-1');
    const createdEntrantId = entrants.find((entrant) => entrant.name === 'New Entrant')?.id;
    expect(createdEntrantId).toBeDefined();
    await service.deleteEntrant('event-2026-racesweet-round-1', createdEntrantId!);

    sessions = getSessionsForEvent(service.catalog, 'event-2026-racesweet-round-1');
    categories = getCategoriesForEvent(service.catalog, 'event-2026-racesweet-round-1');
    entrants = getEntrantsForEvent(service.catalog, 'event-2026-racesweet-round-1');
    expect(sessions.find((session) => session.id === createdSessionId)).toBeUndefined();
    expect(categories.find((category) => category.id === createdCategoryId)).toBeUndefined();
    expect(entrants.find((entrant) => entrant.id === createdEntrantId)).toBeUndefined();
  });
});

describe('applyEventCatalogLedger', () => {
  it('rebuilds state from immutable mutations', () => {
    const state = applyEventCatalogLedger(createSeedEventCatalogLedger());

    expect(state.events[0]?.sessionIds).toEqual([
      'session-1-practice',
      'session-1-qualifying',
      'session-1-race',
    ]);
    expect(state.categories).toHaveLength(2);
    expect(state.entrants).toHaveLength(1);
    expect(state.sessions).toHaveLength(3);
  });
});
