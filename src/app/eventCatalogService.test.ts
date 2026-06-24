import { validate as validateUuid } from 'uuid';
import { createSeedEventCatalogLedger } from './createSeedEventCatalogLedger.js';
import {
    applyEventCatalogLedger,
    createDefaultEventCatalogLedger,
    type EventCatalogLedger,
    type EventCatalogState,
    getCategoriesForEvent,
    getEntrantsForEvent,
    getSessionsForEvent,
} from './eventCatalog.js';

import type { EventParticipant } from '../model/eventparticipant.js';
import { createCategoryId, createEventEntrantId, createEventId, createEventParticipantId, createSessionId } from '../model/ids.js';
import type { EventCatalogPersistence } from './eventCatalogPersistence.js';
import { EventCatalogService } from './eventCatalogService.js';

const createPersistence = (initial = createDefaultEventCatalogLedger()): EventCatalogPersistence => {
  let ledger = initial;

  return {
    load: vi.fn(async () => ledger),
    save: vi.fn(async (nextLedger) => {
      ledger = nextLedger;
    }),
  };
};

const SEED_CLUBMAN_CATEGORY_ID = createCategoryId('event-2026-racesweet-round-1-category-clubman');
const SEED_ENTRANT_ID = createEventEntrantId('event-2026-racesweet-round-1-entrant-101');
const SEED_EVENT_ID = createEventId('event-2026-racesweet-round-1');
const SEED_PRACTICE_SESSION_ID = createSessionId('session-1-practice');
const SEED_PREMIER_CATEGORY_ID = createCategoryId('event-2026-racesweet-round-1-category-premier');
const SEED_QUALIFYING_SESSION_ID = createSessionId('session-1-qualifying');
const SEED_RACE_SESSION_ID = createSessionId('session-1-race');
const TEST_CATEGORY_ID = createCategoryId('event-2026-test-day-category');
const TEST_ENTRANT_ID = createEventEntrantId('event-2026-test-day-entrant');
const TEST_EVENT_ID = createEventId('event-2026-test-day');
const TEST_SESSION_ID = createSessionId('event-2026-test-day-session');

const expectCatalogStateIdsToBeValid = (state: EventCatalogState): void => {
  const eventsById = new Map(state.events.map((event) => [event.id, event]));
  const categoriesById = new Map(state.categories.map((category) => [category.id, category]));
  const entrantsById = new Map(state.entrants.map((entrant) => [entrant.id, entrant]));
  const sessionsById = new Map(state.sessions.map((session) => [session.id, session]));

  state.events.forEach((event) => {
    expect(validateUuid(event.id)).toBe(true);
    event.categoryIds.forEach((categoryId) => {
      expect(validateUuid(categoryId)).toBe(true);
      const category = categoriesById.get(categoryId);
      expect(category?.eventId).toBe(event.id);
    });
    event.entrantIds.forEach((entrantId) => {
      expect(validateUuid(entrantId)).toBe(true);
      const entrant = entrantsById.get(entrantId);
      expect(entrant?.eventId).toBe(event.id);
    });
    event.sessionIds.forEach((sessionId) => {
      expect(validateUuid(sessionId)).toBe(true);
      const session = sessionsById.get(sessionId);
      expect(session?.eventId).toBe(event.id);
    });
  });

  state.categories.forEach((category) => {
    const parentEvent = eventsById.get(category.eventId);
    expect(validateUuid(category.id)).toBe(true);
    expect(validateUuid(category.eventId)).toBe(true);
    expect(parentEvent?.categoryIds).toContain(category.id);
  });

  state.entrants.forEach((entrant) => {
    const parentEvent = eventsById.get(entrant.eventId);
    expect(validateUuid(entrant.id)).toBe(true);
    expect(validateUuid(entrant.eventId)).toBe(true);
    expect(parentEvent?.entrantIds).toContain(entrant.id);
    entrant.categoryIds.forEach((categoryId) => {
      const category = categoriesById.get(categoryId);
      expect(validateUuid(categoryId)).toBe(true);
      expect(category?.eventId).toBe(entrant.eventId);
      expect(parentEvent?.categoryIds).toContain(categoryId);
    });
    entrant.memberParticipantIds.forEach((participantId) => {
      expect(validateUuid(participantId)).toBe(true);
    });
    entrant.sessionIds.forEach((sessionId) => {
      const session = sessionsById.get(sessionId);
      expect(validateUuid(sessionId)).toBe(true);
      expect(session?.eventId).toBe(entrant.eventId);
      expect(parentEvent?.sessionIds).toContain(sessionId);
    });
  });

  state.sessions.forEach((session) => {
    const parentEvent = eventsById.get(session.eventId);
    expect(validateUuid(session.id)).toBe(true);
    expect(validateUuid(session.eventId)).toBe(true);
    expect(parentEvent?.sessionIds).toContain(session.id);
  });

  if (state.activeEventId) {
    expect(validateUuid(state.activeEventId)).toBe(true);
    expect(eventsById.has(state.activeEventId)).toBe(true);
  }
  if (state.activeSessionId) {
    const activeSession = sessionsById.get(state.activeSessionId);
    expect(validateUuid(state.activeSessionId)).toBe(true);
    expect(activeSession).toBeDefined();
    expect(activeSession?.eventId).toBe(state.activeEventId);
  }
};

const expectLedgerPhaseIdsToBeValid = (ledger: EventCatalogLedger | undefined): EventCatalogState => {
  expect(ledger).toBeDefined();
  expect(ledger?.mutations.every((mutation) => validateUuid(mutation.id))).toBe(true);

  const state = applyEventCatalogLedger(ledger!);
  expectCatalogStateIdsToBeValid(state);
  return state;
};

describe('EventCatalogService', () => {
  it('rejects malformed persistence objects before loading the event catalog', async () => {
    await expect(EventCatalogService.create({ load: vi.fn() } as unknown as EventCatalogPersistence)).rejects.toThrow(
      'EventCatalogService.create requires a persistence object with load() and save() methods.'
    );
  });

  it('seeds the ledger when no events file exists yet', async () => {
    const emptyPersistence = createPersistence();

    const service = await EventCatalogService.create(emptyPersistence);

    expect(service.catalog.events).toHaveLength(1);
    expect(service.catalog.activeEventId).toBe(SEED_EVENT_ID);
    expect(service.catalog.entrants.length).toBeGreaterThan(0);
    expect(emptyPersistence.save).toHaveBeenCalledTimes(1);
  });

  it('creates seed fixture data with UUID-compatible, internally linked IDs', () => {
    const state = applyEventCatalogLedger(createSeedEventCatalogLedger());
    const seedEvent = state.events.find((event) => event.id === SEED_EVENT_ID);
    const seedEntrant = state.entrants.find((entrant) => entrant.id === SEED_ENTRANT_ID);

    expectCatalogStateIdsToBeValid(state);
    expect(seedEvent).toBeDefined();
    expect(seedEvent?.categoryIds).toEqual([SEED_PREMIER_CATEGORY_ID, SEED_CLUBMAN_CATEGORY_ID]);
    expect(seedEvent?.entrantIds).toEqual([SEED_ENTRANT_ID]);
    expect(seedEvent?.sessionIds).toEqual([SEED_PRACTICE_SESSION_ID, SEED_QUALIFYING_SESSION_ID, SEED_RACE_SESSION_ID]);
    expect(state.activeEventId).toBe(SEED_EVENT_ID);

    [...state.events, ...state.categories, ...state.entrants, ...state.sessions].forEach((item) => {
      expect(validateUuid(item.id)).toBe(true);
    });

    expect(state.categories.map((category) => category.eventId)).toEqual([SEED_EVENT_ID, SEED_EVENT_ID]);
    expect(state.sessions.map((session) => session.eventId)).toEqual([SEED_EVENT_ID, SEED_EVENT_ID, SEED_EVENT_ID]);
    expect(seedEntrant?.categoryIds).toEqual([SEED_PREMIER_CATEGORY_ID]);
    expect(seedEntrant?.sessionIds).toEqual([SEED_PRACTICE_SESSION_ID, SEED_QUALIFYING_SESSION_ID, SEED_RACE_SESSION_ID]);
  });

  it('validates seed data through load, save, callback, and service state phases', async () => {
    const emptyPersistence = createPersistence();
    const onPersistedLedger: (ledger: EventCatalogLedger) => Promise<void> = vi.fn(async (_ledger: EventCatalogLedger) => undefined);

    const service = await EventCatalogService.create(emptyPersistence, { onPersistedLedger });

    const savedLedger = vi.mocked(emptyPersistence.save).mock.calls[0]?.[0];
    const callbackLedger = vi.mocked(onPersistedLedger).mock.calls[0]?.[0];
    const savedState = expectLedgerPhaseIdsToBeValid(savedLedger);
    expect(emptyPersistence.load).toHaveBeenCalledOnce();
    expect(emptyPersistence.save).toHaveBeenCalledOnce();
    expect(onPersistedLedger).toHaveBeenCalledOnce();
    expect(callbackLedger).toBe(savedLedger);
    expectLedgerPhaseIdsToBeValid(callbackLedger);
    expect(service.catalog).toEqual(savedState);
    expectCatalogStateIdsToBeValid(service.catalog);
  });

  it('does not seed or save when create loads an existing persisted ledger', async () => {
    const seededLedger = createSeedEventCatalogLedger();
    const seededPersistence = createPersistence(seededLedger);
    const onPersistedLedger = vi.fn(async () => undefined);

    const service = await EventCatalogService.create(seededPersistence, { onPersistedLedger });

    expect(seededPersistence.load).toHaveBeenCalledOnce();
    expect(seededPersistence.save).not.toHaveBeenCalled();
    expect(onPersistedLedger).not.toHaveBeenCalled();
    expect(service.catalog).toEqual(applyEventCatalogLedger(seededLedger));
  });

  it('repairs loaded ledgers by rewriting IDs and restoring parent child relationships before use', async () => {
    const rawPersistence = createPersistence({
      mutations: [
        {
          event: {
            categoryIds: [],
            date: '2026-07-01',
            entrantIds: [],
            format: 'test-day',
            id: 'legacy-event',
            name: 'Legacy Event',
            sessionIds: [],
          },
          id: 'legacy-mutation-event',
          timestamp: '2026-07-01T00:00:00.000Z',
          type: 'event-created',
        },
        {
          category: {
            code: 'LEG',
            description: '',
            eventId: 'legacy-event',
            id: 'legacy-category',
            name: 'Legacy Category',
          },
          id: 'legacy-mutation-category',
          timestamp: '2026-07-01T00:01:00.000Z',
          type: 'category-created',
        },
        {
          entrant: {
            categoryId: 'legacy-category',
            categoryIds: ['legacy-category'],
            entrantType: 'rider',
            eventId: 'legacy-event',
            id: 'legacy-entrant',
            memberParticipantIds: ['legacy-participant'],
            name: 'Legacy Entrant',
            sessionIds: ['legacy-session'],
          },
          id: 'legacy-mutation-entrant',
          timestamp: '2026-07-01T00:02:00.000Z',
          type: 'entrant-created',
        },
        {
          id: 'legacy-mutation-session',
          session: {
            eventId: 'legacy-event',
            id: 'legacy-session',
            kind: 'practice',
            name: 'Legacy Session',
            scheduledStart: '2026-07-01T09:00:00.000Z',
            status: 'scheduled',
          },
          timestamp: '2026-07-01T00:03:00.000Z',
          type: 'session-created',
        },
        {
          eventId: 'legacy-event',
          id: 'legacy-mutation-active',
          timestamp: '2026-07-01T00:04:00.000Z',
          type: 'event-activated',
        },
      ],
      schemaVersion: 1,
    });
    const onPersistedLedger = vi.fn(async () => undefined);

    const service = await EventCatalogService.create(rawPersistence, { onPersistedLedger });

    const expectedEventId = createEventId('legacy-event');
    const expectedCategoryId = createCategoryId('legacy-category');
    const expectedEntrantId = createEventEntrantId('legacy-entrant');
    const expectedParticipantId = createEventParticipantId('legacy-participant');
    const expectedSessionId = createSessionId('legacy-session');
    const repairedLedger = vi.mocked(rawPersistence.save).mock.calls[0]?.[0];
    const event = service.catalog.events.find((item) => item.id === expectedEventId);
    const entrant = service.catalog.entrants.find((item) => item.id === expectedEntrantId);

    expect(rawPersistence.save).toHaveBeenCalledOnce();
    expect(onPersistedLedger).toHaveBeenCalledWith(repairedLedger);
    expect(repairedLedger?.mutations.every((mutation) => validateUuid(mutation.id))).toBe(true);
    expect(event).toEqual(expect.objectContaining({
      categoryIds: [expectedCategoryId],
      entrantIds: [expectedEntrantId],
      sessionIds: [expectedSessionId],
    }));
    expect(entrant).toEqual(expect.objectContaining({
      categoryId: expectedCategoryId,
      categoryIds: [expectedCategoryId],
      eventId: expectedEventId,
      memberParticipantIds: [expectedParticipantId],
      sessionIds: [expectedSessionId],
    }));
    expect(service.catalog.activeEventId).toBe(expectedEventId);
    expect(service.catalog.activeSessionId).toBe(expectedSessionId);
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
    vi.mocked(activePersistence.save).mockClear();

    await service.activateEvent(TEST_EVENT_ID);

    expect(service.catalog.activeEventId).toBe(TEST_EVENT_ID);
    expect(service.catalog.activeSessionId).toBeUndefined();
    expect(activePersistence.save).toHaveBeenCalledTimes(1);
  });

  it('marks an event as deleted while leaving child catalog data untouched and hidden from event-scoped lookups', async () => {
    const seededLedger = createSeedEventCatalogLedger();
    const seededPersistence = createPersistence({
      ...seededLedger,
      mutations: [
        ...seededLedger.mutations,
        {
          event: {
            categoryIds: ['event-2026-test-day-category'],
            date: '2026-07-01',
            entrantIds: ['event-2026-test-day-entrant'],
            format: 'test-day',
            id: 'event-2026-test-day',
            name: 'Midwinter Test Day',
            sessionIds: ['event-2026-test-day-session'],
          },
          id: 'mutation-extra-event',
          timestamp: '2026-05-30T01:00:00.000Z',
          type: 'event-created',
        },
        {
          category: {
            code: '',
            description: '',
            eventId: 'event-2026-test-day',
            id: 'event-2026-test-day-category',
            name: 'Test Category',
          },
          id: 'mutation-extra-category',
          timestamp: '2026-05-30T01:01:00.000Z',
          type: 'category-created',
        },
        {
          entrant: {
            categoryIds: ['event-2026-test-day-category'],
            entrantType: 'rider',
            eventId: 'event-2026-test-day',
            id: 'event-2026-test-day-entrant',
            memberParticipantIds: [],
            name: 'Test Entrant',
            sessionIds: ['event-2026-test-day-session'],
          },
          id: 'mutation-extra-entrant',
          timestamp: '2026-05-30T01:02:00.000Z',
          type: 'entrant-created',
        },
        {
          id: 'mutation-extra-session',
          session: {
            eventId: 'event-2026-test-day',
            id: 'event-2026-test-day-session',
            kind: 'practice',
            name: 'Test Session',
            scheduledStart: '2026-07-01T09:00:00.000Z',
            status: 'scheduled',
          },
          timestamp: '2026-05-30T01:03:00.000Z',
          type: 'session-created',
        },
        {
          eventId: 'event-2026-test-day',
          id: 'mutation-extra-event-active',
          timestamp: '2026-05-30T01:04:00.000Z',
          type: 'event-activated',
        },
      ],
    });
    const onPersistedLedger = vi.fn(async () => undefined);
    const service = await EventCatalogService.create(seededPersistence, { onPersistedLedger });
    vi.mocked(seededPersistence.save).mockClear();
    onPersistedLedger.mockClear();

    await service.deleteEvent(TEST_EVENT_ID);

    expect(service.catalog.events.find((event) => event.id === TEST_EVENT_ID)).toBeUndefined();
    expect(service.catalog.deletedEventIds).toContain(TEST_EVENT_ID);
    expect(service.catalog.activeEventId).toBe(SEED_EVENT_ID);
    expect(getSessionsForEvent(service.catalog, TEST_EVENT_ID)).toEqual([]);
    expect(getCategoriesForEvent(service.catalog, TEST_EVENT_ID)).toEqual([]);
    expect(getEntrantsForEvent(service.catalog, TEST_EVENT_ID)).toEqual([]);
    expect(service.catalog.sessions.find((session) => session.id === TEST_SESSION_ID)).toBeDefined();
    expect(service.catalog.categories.find((category) => category.id === TEST_CATEGORY_ID)).toBeDefined();
    expect(service.catalog.entrants.find((entrant) => entrant.id === TEST_ENTRANT_ID)).toBeDefined();
    expect(seededPersistence.save).toHaveBeenCalledOnce();
    expect(onPersistedLedger).toHaveBeenCalledWith(expect.objectContaining({
      mutations: expect.arrayContaining([
        expect.objectContaining({
          eventId: TEST_EVENT_ID,
          type: 'event-deleted',
        }),
      ]),
    }));
  });

  it('activates a session and its event through the ledger, persistence, and upstream callback flow', async () => {
    const seededPersistence = createPersistence(createSeedEventCatalogLedger());
    const onPersistedLedger = vi.fn(async () => undefined);
    const service = await EventCatalogService.create(seededPersistence, { onPersistedLedger });

    await service.activateSession(SEED_EVENT_ID, SEED_RACE_SESSION_ID);

    const session = service.catalog.sessions.find((item) => item.id === SEED_RACE_SESSION_ID);
    expect(service.catalog.activeEventId).toBe(SEED_EVENT_ID);
    expect(service.catalog.activeSessionId).toBe(SEED_RACE_SESSION_ID);
    expect(session?.status).toBe('live');
    expect(seededPersistence.save).toHaveBeenCalledOnce();
    expect(onPersistedLedger).toHaveBeenCalledWith(expect.objectContaining({
      mutations: expect.arrayContaining([
        expect.objectContaining({
          eventId: SEED_EVENT_ID,
          sessionId: SEED_RACE_SESSION_ID,
          type: 'session-activated',
        }),
        expect.objectContaining({
          changes: { status: 'live' },
          sessionId: SEED_RACE_SESSION_ID,
          type: 'session-updated',
        }),
      ]),
    }));
  });

  it('moves a session between parent events through one persisted ledger flow', async () => {
    const baseLedger = createSeedEventCatalogLedger();
    const seededPersistence = createPersistence({
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
    const onPersistedLedger = vi.fn(async () => undefined);
    const service = await EventCatalogService.create(seededPersistence, { onPersistedLedger });
    vi.mocked(seededPersistence.save).mockClear();
    onPersistedLedger.mockClear();

    await service.moveSessionToEvent(SEED_QUALIFYING_SESSION_ID, TEST_EVENT_ID);

    const movedSession = service.catalog.sessions.find((session) => session.id === SEED_QUALIFYING_SESSION_ID);
    const sourceEvent = service.catalog.events.find((event) => event.id === SEED_EVENT_ID);
    const targetEvent = service.catalog.events.find((event) => event.id === TEST_EVENT_ID);

    expect(movedSession?.eventId).toBe(TEST_EVENT_ID);
    expect(sourceEvent?.sessionIds).not.toContain(SEED_QUALIFYING_SESSION_ID);
    expect(targetEvent?.sessionIds).toContain(SEED_QUALIFYING_SESSION_ID);
    expect(getSessionsForEvent(service.catalog, SEED_EVENT_ID).map((session) => session.id)).not.toContain(SEED_QUALIFYING_SESSION_ID);
    expect(getSessionsForEvent(service.catalog, TEST_EVENT_ID).map((session) => session.id)).toContain(SEED_QUALIFYING_SESSION_ID);
    expect(seededPersistence.save).toHaveBeenCalledOnce();
    expect(onPersistedLedger).toHaveBeenCalledWith(expect.objectContaining({
      mutations: expect.arrayContaining([
        expect.objectContaining({
          changes: { eventId: TEST_EVENT_ID },
          sessionId: SEED_QUALIFYING_SESSION_ID,
          type: 'session-updated',
        }),
        expect.objectContaining({
          changes: { sessionIds: [SEED_QUALIFYING_SESSION_ID] },
          eventId: TEST_EVENT_ID,
          type: 'event-updated',
        }),
        expect.objectContaining({
          changes: { sessionIds: [SEED_PRACTICE_SESSION_ID, SEED_RACE_SESSION_ID] },
          eventId: SEED_EVENT_ID,
          type: 'event-updated',
        }),
      ]),
    }));
  });

  it('creates an event through the ledger, persistence, and upstream callback flow', async () => {
    const seededPersistence = createPersistence(createSeedEventCatalogLedger());
    const onPersistedLedger = vi.fn(async () => undefined);
    const service = await EventCatalogService.create(seededPersistence, { onPersistedLedger });

    await service.createEvent();

    const createdEvent = service.catalog.events.find((event) => event.name === 'New Event');
    expect(createdEvent).toEqual(expect.objectContaining({
      categoryIds: [],
      entrantIds: [],
      format: 'race-weekend',
      name: 'New Event',
      sessionIds: [],
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }));
    expect(seededPersistence.save).toHaveBeenCalledOnce();
    expect(onPersistedLedger).toHaveBeenCalledOnce();
    expect(onPersistedLedger).toHaveBeenCalledWith(expect.objectContaining({
      mutations: expect.arrayContaining([
        expect.objectContaining({
          event: expect.objectContaining({ id: createdEvent?.id, name: 'New Event' }),
          type: 'event-created',
        }),
      ]),
    }));
  });

  it('creates team entrants through the ledger, persistence, and upstream callback flow', async () => {
    const seededPersistence = createPersistence(createSeedEventCatalogLedger());
    const onPersistedLedger = vi.fn(async () => undefined);
    const service = await EventCatalogService.create(seededPersistence, { onPersistedLedger });

    await service.createEntrant(SEED_EVENT_ID, 'team');

    const createdTeam = service.catalog.entrants.find((entrant) => entrant.name === 'New Team');
    expect(createdTeam).toEqual(expect.objectContaining({
      categoryId: SEED_PREMIER_CATEGORY_ID,
      categoryIds: [SEED_PREMIER_CATEGORY_ID],
      entrantType: 'team',
      name: 'New Team',
      teamMembers: [],
    }));
    expect(seededPersistence.save).toHaveBeenCalledOnce();
    expect(onPersistedLedger).toHaveBeenCalledWith(expect.objectContaining({
      mutations: expect.arrayContaining([
        expect.objectContaining({
          entrant: expect.objectContaining({ id: createdTeam?.id, entrantType: 'team' }),
          type: 'entrant-created',
        }),
      ]),
    }));
  });

  it('updates event, session, and category rule details through immutable ledger changes', async () => {
    const seededPersistence = createPersistence(createSeedEventCatalogLedger());
    const service = await EventCatalogService.create(seededPersistence);

    await service.updateEvent(SEED_EVENT_ID, {
      format: 'track-day',
      name: 'RaceSweet Open Track Day',
      timeZone: 'Australia/Brisbane',
    });
    await service.updateSession(SEED_PRACTICE_SESSION_ID, {
      name: 'Friday Free Practice',
      status: 'live',
    });
    await service.updateCategory(SEED_PREMIER_CATEGORY_ID, {
      distanceRule: { kind: 'time', value: '1:45' },
      sessionAssignments: [{ sessionId: SEED_RACE_SESSION_ID, startTime: '2026-06-13T14:45:00.000Z' }],
      teamRules: {
        maxRiderAge: 50,
        maxTeamSize: 3,
        minRiderAge: 16,
        teamCompositionRules: [{ gender: 'female', max: 2, min: 1 }],
      },
    });

    const event = service.catalog.events.find((item) => item.id === SEED_EVENT_ID);
    const session = service.catalog.sessions.find((item) => item.id === SEED_PRACTICE_SESSION_ID);
    const category = service.catalog.categories.find((item) => item.id === SEED_PREMIER_CATEGORY_ID);

    expect(event?.name).toBe('RaceSweet Open Track Day');
    expect(event?.format).toBe('track-day');
    expect(event?.timeZone).toBe('Australia/Brisbane');
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

    await service.syncEventScaffold(SEED_EVENT_ID, [
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

    const event = service.catalog.events.find((item) => item.id === SEED_EVENT_ID);
    const categories = getCategoriesForEvent(service.catalog, SEED_EVENT_ID);
    const entrants = getEntrantsForEvent(service.catalog, SEED_EVENT_ID);
    const teamA = entrants.find((entrant) => entrant.id === 'team-a');
    const teamB = entrants.find((entrant) => entrant.id === 'team-b');

    expect(event?.categoryIds).toEqual(expect.arrayContaining(['cat-a', 'cat-b', 'cat-c']));
    expect(categories.find((category) => category.id === 'cat-c')).toBeDefined();
    expect(event?.entrantIds).toEqual(expect.arrayContaining(['team-a', 'team-b']));
    expect(teamA?.categoryIds).toEqual(expect.arrayContaining(['cat-a', 'cat-b']));
    expect(teamA?.entrantType).toBe('team');
    expect(teamA?.teamMembers).toEqual(expect.arrayContaining([
      expect.objectContaining({ firstName: 'Pat', lastName: 'Rider', participantId: 'p1' }),
      expect.objectContaining({ firstName: 'Quinn', lastName: 'Rider', participantId: 'p2' }),
    ]));
    expect(entrants.find((entrant) => entrant.id === 'p1')).toEqual(expect.objectContaining({
      categoryId: 'cat-a',
      entrantType: 'rider',
      name: 'Pat Rider',
      teamEntrantId: 'team-a',
    }));
    expect(entrants.find((entrant) => entrant.id === 'p2')).toEqual(expect.objectContaining({
      categoryId: 'cat-b',
      entrantType: 'rider',
      name: 'Quinn Rider',
      teamEntrantId: 'team-a',
    }));
    expect(teamB?.entrantType).toBe('rider');
    expect(teamB?.firstName).toBe('Sam');
    expect(teamB?.lastName).toBe('Rider');
    expect(teamB?.categoryId).toBe('cat-c');
  });

  it('imports Apical race state as an event/session scaffold without activating it', async () => {
    const seededPersistence = createPersistence(createSeedEventCatalogLedger());
    const service = await EventCatalogService.create(seededPersistence);
    const originalActiveEventId = service.catalog.activeEventId;
    const originalActiveSessionId = service.catalog.activeSessionId;
    const importedCategoryId = createCategoryId('cat-apical-a');
    const importedEntrantId = createEventEntrantId('entrant-apical-301');
    const importedParticipantId = createEventParticipantId('participant-apical-301');
    const importedSessionId = createSessionId('session-apical-1001');

    await service.importApicalRaceState({
      apicalDataFilePath: '../../src/generated/apical-excel-cache/apical-event-1001.xlsx',
      eventDate: '2026-06-07T01:30:00.000Z',
      eventId: '7b83ad1e-54ba-5f00-9712-1c82d3178640',
      eventName: 'Apical Round 7',
      raceState: {
        categories: [
          {
            code: 'A',
            description: '',
            id: 'cat-apical-a',
            name: 'A',
          },
          {
            code: 'Timing Error List',
            description: '',
            id: 'cat-apical-timing-error',
            name: 'Timing Error List',
          },
        ],
        participants: [
          {
            categoryId: 'cat-apical-a',
            currentResult: undefined,
            entrantId: 'entrant-apical-301',
            firstname: 'Robert',
            id: 'participant-apical-301',
            identifiers: [],
            lastRecordTime: null,
            resultDuration: null,
            surname: 'WOOD',
          },
        ],
      },
      sessionId: 'session-apical-1001',
      timeZone: 'Australia/Sydney',
    });

    const event = service.catalog.events.find((item) => item.id === '7b83ad1e-54ba-5f00-9712-1c82d3178640');
    const session = service.catalog.sessions.find((item) => item.id === importedSessionId);
    const entrant = service.catalog.entrants.find((item) => item.id === importedEntrantId);
    const timingErrorCategory = service.catalog.categories.find((item) => item.name === 'Timing Error List');

    expect(service.catalog.activeEventId).toBe(originalActiveEventId);
    expect(service.catalog.activeSessionId).toBe(originalActiveSessionId);
    expect(event).toEqual(expect.objectContaining({
      date: '2026-06-07',
      name: 'Apical Round 7',
      sessionIds: [importedSessionId],
      timeZone: 'Australia/Sydney',
    }));
    expect(session).toEqual(expect.objectContaining({
      eventId: '7b83ad1e-54ba-5f00-9712-1c82d3178640',
      name: 'Apical Round 7',
      scheduledStart: '2026-06-07T01:30:00.000Z',
      status: 'completed',
    }));
    expect(entrant).toEqual(expect.objectContaining({
      categoryIds: [importedCategoryId],
      firstName: 'Robert',
      lastName: 'WOOD',
      memberParticipantIds: [importedParticipantId],
      sessionIds: [importedSessionId],
    }));
    expect(timingErrorCategory).toEqual(expect.objectContaining({
      excludeFromResults: true,
      name: 'Timing Error List',
    }));
    expect(service.getImportedRaceStateMetadata(
      '7b83ad1e-54ba-5f00-9712-1c82d3178640',
      importedSessionId
    )).toEqual(expect.objectContaining({
      apicalDataFilePath: '../../src/generated/apical-excel-cache/apical-event-1001.xlsx',
      raceState: expect.objectContaining({
        categories: expect.arrayContaining([
          expect.objectContaining({ id: importedCategoryId }),
          expect.objectContaining({ excludeFromResults: true, name: 'Timing Error List' }),
        ]),
        participants: expect.arrayContaining([
          expect.objectContaining({
            categoryId: importedCategoryId,
            entrantId: importedEntrantId,
            id: importedParticipantId,
          }),
        ]),
      }),
    }));
    expect(seededPersistence.save).toHaveBeenLastCalledWith(expect.objectContaining({
      mutations: expect.arrayContaining([
        expect.objectContaining({
          apicalDataFilePath: '../../src/generated/apical-excel-cache/apical-event-1001.xlsx',
          raceState: expect.objectContaining({
            categories: expect.arrayContaining([
              expect.objectContaining({ excludeFromResults: true, name: 'Timing Error List' }),
            ]),
          }),
          sessionId: importedSessionId,
          type: 'race-state-imported',
        }),
        expect.objectContaining({
          category: expect.objectContaining({
            excludeFromResults: true,
            name: 'Timing Error List',
          }),
          type: 'category-created',
        }),
      ]),
    }));
    expect(seededPersistence.save).toHaveBeenCalledTimes(2);
  });

  it('supports entrant detail edits for rider fields and category updates', async () => {
    const seededPersistence = createPersistence(createSeedEventCatalogLedger());
    const service = await EventCatalogService.create(seededPersistence);

    await service.updateEntrant(SEED_ENTRANT_ID, {
      categoryId: SEED_CLUBMAN_CATEGORY_ID,
      categoryIds: [SEED_CLUBMAN_CATEGORY_ID],
      dateOfBirth: '1999-04-18',
      firstName: 'Jordan',
      gender: 'female',
      lastName: 'Smith',
      name: 'Jordan Smith',
    });

    const entrant = service.catalog.entrants.find((item) => item.id === SEED_ENTRANT_ID);
    expect(entrant).toEqual(expect.objectContaining({
      categoryId: SEED_CLUBMAN_CATEGORY_ID,
      categoryIds: [SEED_CLUBMAN_CATEGORY_ID],
      dateOfBirth: '1999-04-18',
      firstName: 'Jordan',
      gender: 'female',
      lastName: 'Smith',
      name: 'Jordan Smith',
    }));
  });

  it('normalizes primary entrant category updates and clears deleted category references', async () => {
    const seededPersistence = createPersistence(createSeedEventCatalogLedger());
    const service = await EventCatalogService.create(seededPersistence);

    await service.updateEntrant(SEED_ENTRANT_ID, {
      categoryId: SEED_CLUBMAN_CATEGORY_ID,
      teamEntrantId: 'team-linked',
    });

    let entrant = service.catalog.entrants.find((item) => item.id === SEED_ENTRANT_ID);
    expect(entrant).toEqual(expect.objectContaining({
      categoryId: SEED_CLUBMAN_CATEGORY_ID,
      categoryIds: [SEED_CLUBMAN_CATEGORY_ID],
      teamEntrantId: 'team-linked',
    }));

    await service.deleteCategory(SEED_EVENT_ID, SEED_CLUBMAN_CATEGORY_ID);

    entrant = service.catalog.entrants.find((item) => item.id === SEED_ENTRANT_ID);
    expect(entrant?.categoryId).toBeUndefined();
    expect(entrant?.categoryIds).toEqual([]);
  });

  it('uses master entrant profiles to backfill missing participant names and profile fields', async () => {
    const seededPersistence = createPersistence(createSeedEventCatalogLedger());
    const service = await EventCatalogService.create(seededPersistence);

    const participants: EventParticipant[] = [
      {
        categoryId: 'cat-z',
        currentResult: undefined,
        entrantId: 'team-z',
        firstname: '',
        id: 'p-z1',
        identifiers: [],
        lastRecordTime: null,
        resultDuration: null,
        surname: '',
      },
    ];

    await service.syncEventScaffold(SEED_EVENT_ID, [], participants, [
      {
        categoryId: 'cat-z',
        dateOfBirth: '2003-03-03',
        entrantId: 'team-z',
        firstName: 'Alex',
        gender: 'female',
        lastName: 'Fallback',
      },
    ]);

    const entrant = service.catalog.entrants.find((item) => item.id === 'team-z');
    expect(entrant).toEqual(expect.objectContaining({
      categoryId: 'cat-z',
      categoryIds: ['cat-z'],
      dateOfBirth: '2003-03-03',
      firstName: 'Alex',
      gender: 'female',
      lastName: 'Fallback',
      name: 'Alex Fallback',
    }));
  });

  it('falls back to participant ID when imported entrant ID is blank', async () => {
    const seededPersistence = createPersistence(createSeedEventCatalogLedger());
    const service = await EventCatalogService.create(seededPersistence);

    const participants: EventParticipant[] = [
      {
        categoryId: 'cat-fallback',
        currentResult: undefined,
        entrantId: '',
        firstname: 'Blank',
        id: 'participant-fallback-id',
        identifiers: [],
        lastRecordTime: null,
        resultDuration: null,
        surname: 'Entrant',
      },
    ];

    await service.syncEventScaffold(SEED_EVENT_ID, [], participants);

    const entrant = service.catalog.entrants.find((item) => item.id === 'participant-fallback-id');
    expect(entrant).toEqual(expect.objectContaining({
      firstName: 'Blank',
      id: 'participant-fallback-id',
      lastName: 'Entrant',
      name: 'Blank Entrant',
    }));
  });

  it('creates and deletes session/category/entrant through immutable mutations', async () => {
    const seededPersistence = createPersistence(createSeedEventCatalogLedger());
    const service = await EventCatalogService.create(seededPersistence);

    await service.createSession(SEED_EVENT_ID);
    let sessions = getSessionsForEvent(service.catalog, SEED_EVENT_ID);
    const createdSessionId = sessions.find((session) => session.name === 'New Session')?.id;
    expect(createdSessionId).toBeDefined();
    await service.deleteSession(SEED_EVENT_ID, createdSessionId!);

    await service.createCategory(SEED_EVENT_ID);
    let categories = getCategoriesForEvent(service.catalog, SEED_EVENT_ID);
    const createdCategoryId = categories.find((category) => category.name === 'New Category')?.id;
    expect(createdCategoryId).toBeDefined();
    await service.deleteCategory(SEED_EVENT_ID, createdCategoryId!.toString());

    await service.createEntrant(SEED_EVENT_ID);
    let entrants = getEntrantsForEvent(service.catalog, SEED_EVENT_ID);
    const createdEntrantId = entrants.find((entrant) => entrant.name === 'New Entrant')?.id;
    expect(createdEntrantId).toBeDefined();
    await service.deleteEntrant(SEED_EVENT_ID, createdEntrantId!);

    sessions = getSessionsForEvent(service.catalog, SEED_EVENT_ID);
    categories = getCategoriesForEvent(service.catalog, SEED_EVENT_ID);
    entrants = getEntrantsForEvent(service.catalog, SEED_EVENT_ID);
    expect(sessions.find((session) => session.id === createdSessionId)).toBeUndefined();
    expect(categories.find((category) => category.id === createdCategoryId)).toBeUndefined();
    expect(entrants.find((entrant) => entrant.id === createdEntrantId)).toBeUndefined();
  });
});

describe('applyEventCatalogLedger', () => {
  it('rebuilds state from immutable mutations', () => {
    const state = applyEventCatalogLedger(createSeedEventCatalogLedger());

    expect(state.events[0]?.sessionIds).toEqual([
      SEED_PRACTICE_SESSION_ID,
      SEED_QUALIFYING_SESSION_ID,
      SEED_RACE_SESSION_ID,
    ]);
    expect(state.activeSessionId).toBe(SEED_PRACTICE_SESSION_ID);
    expect(state.categories).toHaveLength(2);
    expect(state.entrants).toHaveLength(1);
    expect(state.sessions).toHaveLength(3);
  });

  it('rebuilds entrant individual fields from ledger updates', () => {
    const seed = createSeedEventCatalogLedger();
    const state = applyEventCatalogLedger({
      ...seed,
      mutations: [
        ...seed.mutations,
        {
          changes: {
            categoryId: SEED_CLUBMAN_CATEGORY_ID,
            dateOfBirth: '2001-09-21',
            firstName: 'Taylor',
            gender: 'male',
            lastName: 'Rider',
          },
          entrantId: SEED_ENTRANT_ID,
          id: 'mutation-entrant-details',
          timestamp: '2026-05-30T11:22:00.000Z',
          type: 'entrant-updated' as const,
        },
      ],
    });

    const entrant = state.entrants.find((item) => item.id === SEED_ENTRANT_ID);
    expect(entrant).toEqual(expect.objectContaining({
      categoryId: SEED_CLUBMAN_CATEGORY_ID,
      dateOfBirth: '2001-09-21',
      firstName: 'Taylor',
      gender: 'male',
      lastName: 'Rider',
    }));
  });
});
