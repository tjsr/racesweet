import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validate as validateUuid } from 'uuid';
import { readApicalExcelBuffer } from '../controllers/apical/apicalSpreadsheetProcessor.js';
import { convertDataToRaceState } from '../parsers/apical.js';
import { createSeedEventCatalogLedger } from './createSeedEventCatalogLedger.js';
import {
    applyEventCatalogLedger,
    createDefaultEventCatalogLedger,
    type EventCatalogLedger,
    type EventCatalogState,
    getCategoryAssignedSessionIds,
    getCategoriesForEvent,
    getEntrantAssignedSessionIds,
    getEntrantsForCategory,
    getEntrantsForEvent,
    getSessionAssignedCategoryIds,
    getSessionsForEvent,
    getTeamsForParticipant,
} from './eventCatalog.js';

import type { EventParticipant } from '../model/eventparticipant.js';
import { createCategoryId, createEventEntrantId, createEventId, createEventParticipantId, createSessionId, createTimeRecordId, createTimeRecordSourceId } from '../model/ids.js';
import { createApicalTeamNameDisplayWorkbookBuffer } from '../testing/apicalTeamWorkbook.js';
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

const getParticipantRacePlate = (participant: EventParticipant): string | undefined => {
  const racePlateIdentifier = participant.identifiers.find((identifier) => {
    return 'racePlate' in identifier && typeof identifier.racePlate === 'string';
  }) as { racePlate?: string } | undefined;

  return racePlateIdentifier?.racePlate;
};

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
    (entrant.sessionIds || []).forEach((sessionId) => {
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

  it('persists imported participant identifier updates to the ledger and reloads them', async () => {
    const persistence = createPersistence(createSeedEventCatalogLedger());
    const onPersistedLedger = vi.fn();
    const service = await EventCatalogService.create(persistence, { onPersistedLedger });
    const participantId = createEventParticipantId('identifier-update-participant');
    const raceState = {
      categories: [],
      participants: [
        {
          categoryId: TEST_CATEGORY_ID,
          currentResult: undefined,
          entrantId: TEST_ENTRANT_ID,
          firstname: 'Identifier',
          id: participantId,
          identifiers: [
            { fromTime: undefined, racePlate: '822', toTime: undefined },
            { fromTime: undefined, txNo: '10000223', toTime: undefined },
          ],
          lastRecordTime: null,
          resultDuration: null,
          surname: 'Rider',
        },
      ],
      records: [],
      teams: [],
    };

    await service.updateImportedRaceState(TEST_EVENT_ID, TEST_SESSION_ID, raceState);

    expect(onPersistedLedger).toHaveBeenCalled();
    const savedLedger = (persistence.save as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as EventCatalogLedger;
    const savedMutation = savedLedger.mutations.at(-1);
    expect(savedMutation?.type).toBe('race-state-imported');
    expect(savedMutation && savedMutation.type === 'race-state-imported' ? savedMutation.raceState.participants?.[0].identifiers : [])
      .toEqual(raceState.participants[0].identifiers);

    const reloaded = await EventCatalogService.create(createPersistence(savedLedger));
    const reloadedRaceState = reloaded.getImportedRaceState(TEST_EVENT_ID, TEST_SESSION_ID);
    expect(reloadedRaceState?.participants?.[0].identifiers).toEqual(raceState.participants[0].identifiers);
  });

  it('returns team members with their team when selecting entrants for a team category', () => {
    const categoryId = createCategoryId('selector-team-category');
    const eventId = createEventId('selector-team-event');
    const teamId = createEventEntrantId('selector-team');
    const memberId = createEventEntrantId('selector-team-member');
    const state: EventCatalogState = {
      ...applyEventCatalogLedger(createDefaultEventCatalogLedger()),
      categories: [
        {
          eventId,
          id: categoryId,
          name: 'Teams A',
          teamRules: { teamCompositionRules: [] },
        },
      ],
      entrants: [
        {
          categoryId,
          categoryIds: [categoryId],
          entrantType: 'team',
          eventId,
          id: teamId,
          memberParticipantIds: [memberId],
          name: 'Fast Friends',
          sessionIds: [],
        },
        {
          categoryIds: [],
          entrantType: 'rider',
          eventId,
          id: memberId,
          memberParticipantIds: [memberId],
          name: 'Alice RIDER',
          sessionIds: [],
          teamEntrantId: teamId,
        },
      ],
      events: [
        {
          categoryIds: [categoryId],
          date: '2026-06-07',
          entrantIds: [teamId, memberId],
          format: 'race-weekend',
          id: eventId,
          name: 'Team Event',
          sessionIds: [],
        },
      ],
      sessions: [],
    };

    expect(getEntrantsForCategory(state, eventId, categoryId).map((entrant) => entrant.name)).toEqual([
      'Fast Friends',
      'Alice RIDER',
    ]);
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
            categoryIds: [],
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
            categoryIds: ['event-2026-test-day-category'],
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
      teamRules: {
        maxRiderAge: 50,
        maxTeamSize: 3,
        minRiderAge: 16,
        teamCompositionRules: [{ gender: 'female', max: 2, min: 1 }],
      },
    });
    await service.updateSession(SEED_RACE_SESSION_ID, {
      categoryIds: [SEED_PREMIER_CATEGORY_ID],
    });

    const event = service.catalog.events.find((item) => item.id === SEED_EVENT_ID);
    const session = service.catalog.sessions.find((item) => item.id === SEED_PRACTICE_SESSION_ID);
    const raceSession = service.catalog.sessions.find((item) => item.id === SEED_RACE_SESSION_ID);
    const category = service.catalog.categories.find((item) => item.id === SEED_PREMIER_CATEGORY_ID);

    expect(event?.name).toBe('RaceSweet Open Track Day');
    expect(event?.format).toBe('track-day');
    expect(event?.timeZone).toBe('Australia/Brisbane');
    expect(session?.name).toBe('Friday Free Practice');
    expect(session?.status).toBe('live');
    expect(raceSession?.categoryIds).toEqual([SEED_PREMIER_CATEGORY_ID]);
    expect(category?.distanceRule).toEqual({ kind: 'time', value: '1:45' });
    expect(category?.teamRules?.maxTeamSize).toBe(3);
    expect(seededPersistence.save).toHaveBeenCalledTimes(4);
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
    const importedCategory = getCategoriesForEvent(service.catalog, event!.id).find((category) => category.id === importedCategoryId);
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
    }));
    expect(entrant?.sessionIds).toBeUndefined();
    expect(Array.from(getCategoryAssignedSessionIds(importedCategory, [session!]))).toEqual([importedSessionId]);
    expect(Array.from(getEntrantAssignedSessionIds(entrant, getCategoriesForEvent(service.catalog, event!.id), [session!], getEntrantsForEvent(service.catalog, event!.id)))).toEqual([importedSessionId]);
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

  it('does not write duplicate scaffold mutations when the same event scaffold is synced twice', async () => {
    const seededPersistence = createPersistence(createSeedEventCatalogLedger());
    const service = await EventCatalogService.create(seededPersistence);
    const categoryAId = createCategoryId('sync-noop-category-a');
    const categoryBId = createCategoryId('sync-noop-category-b');
    const participants: EventParticipant[] = [
      {
        categoryId: categoryAId,
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
        categoryId: categoryBId,
        currentResult: undefined,
        entrantId: 'team-a',
        firstname: 'Quinn',
        id: 'p2',
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
        id: categoryAId,
        name: 'Alpha',
      },
      {
        code: 'B',
        description: 'Beta category',
        id: categoryBId,
        name: 'Beta',
      },
    ], participants);

    const saveCountAfterFirstSync = vi.mocked(seededPersistence.save).mock.calls.length;

    await service.syncEventScaffold(SEED_EVENT_ID, [
      {
        code: 'A',
        description: 'Alpha category',
        id: categoryAId,
        name: 'Alpha',
      },
      {
        code: 'B',
        description: 'Beta category',
        id: categoryBId,
        name: 'Beta',
      },
    ], participants);

    expect(vi.mocked(seededPersistence.save).mock.calls.length).toBe(saveCountAfterFirstSync);
    expect(getCategoriesForEvent(service.catalog, SEED_EVENT_ID).map((category) => category.id)).toEqual(expect.arrayContaining([categoryAId, categoryBId]));
  });

  it('treats a duplicate Apical import as a no-op once the event state already matches', async () => {
    const seededPersistence = createPersistence(createDefaultEventCatalogLedger());
    const service = await EventCatalogService.create(seededPersistence);
    const importedEventId = createEventId('apical-noop-event');
    const importedSessionId = createSessionId('apical-noop-session');
    const importedCategoryId = createCategoryId('apical-noop-category');
    const importedEntrantId = createEventEntrantId('apical-noop-entrant');
    const importedParticipantId = createEventParticipantId('apical-noop-participant');

    const importData = {
      eventDate: '2026-06-07T01:30:00.000Z',
      eventId: importedEventId,
      eventName: 'Apical No-Op Round',
      raceState: {
        categories: [
          {
            code: 'A',
            description: '',
            id: importedCategoryId,
            name: 'A',
          },
        ],
        participants: [
          {
            categoryId: importedCategoryId,
            currentResult: undefined,
            entrantId: importedEntrantId,
            firstname: 'No',
            id: importedParticipantId,
            identifiers: [],
            lastRecordTime: null,
            resultDuration: null,
            surname: 'Op',
          },
        ],
        records: [],
        teams: [],
      },
      sessionId: importedSessionId,
      timeZone: 'Australia/Sydney',
    };

    await service.importApicalRaceState(importData);
    const saveCountAfterFirstImport = vi.mocked(seededPersistence.save).mock.calls.length;

    await service.importApicalRaceState(importData);

    expect(vi.mocked(seededPersistence.save).mock.calls.length).toBe(saveCountAfterFirstImport);
    expect(service.getImportedRaceStateMetadata(importedEventId, importedSessionId)).toEqual(expect.objectContaining({
      raceState: expect.objectContaining({
        categories: expect.arrayContaining([expect.objectContaining({ id: importedCategoryId })]),
        participants: expect.arrayContaining([expect.objectContaining({ id: importedParticipantId })]),
      }),
    }));
  });

  it('scaffolds imported Apical teams using the imported team name and category', async () => {
    const seededPersistence = createPersistence(createDefaultEventCatalogLedger());
    const service = await EventCatalogService.create(seededPersistence);
    const importedEventId = createEventId('apical-team-event');
    const importedSessionId = createSessionId('apical-team-session');
    const importedCategoryId = createCategoryId('apical-team-category');
    const importedTeamId = createEventEntrantId('apical-team-fast-friends');
    const riderOneId = createEventParticipantId('apical-team-rider-101');
    const riderTwoId = createEventParticipantId('apical-team-rider-102');

    await service.importApicalRaceState({
      eventDate: '2026-06-07T01:30:00.000Z',
      eventId: importedEventId,
      eventName: 'Apical Teams Round',
      raceState: {
        categories: [
          {
            id: importedCategoryId,
            name: 'Teams A',
          },
        ],
        participants: [
          {
            categoryId: importedCategoryId,
            currentResult: undefined,
            entrantId: importedTeamId,
            firstname: 'Alice',
            id: riderOneId,
            identifiers: [],
            lastRecordTime: null,
            resultDuration: null,
            surname: 'RIDER',
          },
          {
            categoryId: importedCategoryId,
            currentResult: undefined,
            entrantId: importedTeamId,
            firstname: 'Bob',
            id: riderTwoId,
            identifiers: [],
            lastRecordTime: null,
            resultDuration: null,
            surname: 'RIDER',
          },
        ],
        teams: [
          {
            categoryId: importedCategoryId,
            description: '',
            id: importedTeamId,
            members: [riderOneId, riderTwoId],
            name: 'Fast Friends',
          } as never,
        ],
      },
      sessionId: importedSessionId,
      timeZone: 'Australia/Sydney',
    });

    const teamEntrant = service.catalog.entrants.find((entrant) => entrant.id === importedTeamId);
    const memberEntrants = service.catalog.entrants.filter((entrant) => entrant.teamEntrantId === importedTeamId);
    const importedCategory = service.catalog.categories.find((category) => category.id === importedCategoryId);

    expect(teamEntrant).toEqual(expect.objectContaining({
      categoryId: importedCategoryId,
      categoryIds: [importedCategoryId],
      entrantType: 'team',
      memberParticipantIds: [riderOneId, riderTwoId],
      name: 'Fast Friends',
    }));
    expect(teamEntrant?.sessionIds).toBeUndefined();
    expect(Array.from(getCategoryAssignedSessionIds(importedCategory, getSessionsForEvent(service.catalog, importedEventId)))).toEqual([importedSessionId]);
    expect(Array.from(getEntrantAssignedSessionIds(teamEntrant, getCategoriesForEvent(service.catalog, importedEventId), getSessionsForEvent(service.catalog, importedEventId), getEntrantsForEvent(service.catalog, importedEventId)))).toEqual([importedSessionId]);
    expect(memberEntrants).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: riderOneId,
        name: 'Alice RIDER',
        teamEntrantId: importedTeamId,
      }),
      expect.objectContaining({
        id: riderTwoId,
        name: 'Bob RIDER',
        teamEntrantId: importedTeamId,
      }),
    ]));
    expect(importedCategory?.teamRules?.maxTeamSize).toBe(2);
  });

  it('imports real Apical Results team rows into catalog state, persisted ledger, reloads, and team selectors', async () => {
    const seededPersistence = createPersistence(createSeedEventCatalogLedger());
    const onPersistedLedger = vi.fn(async (_ledger: EventCatalogLedger) => undefined);
    const service = await EventCatalogService.create(seededPersistence, { onPersistedLedger });
    const importedEventId = createEventId('apical-event-68-real-ledger-event');
    const importedSessionId = createSessionId('apical-event-68-real-ledger-session');
    const apicalData = await readApicalExcelBuffer(createApicalTeamNameDisplayWorkbookBuffer());
    const teamResult = apicalData
      .flatMap((category) => category.ParticipantViewModels)
      .find((entrant) => entrant.TeamNameDisplay === 'The Evereadys');
    const expectedRaceNumbers = teamResult?.RaceNumbers.split(',').map((raceNumber) => raceNumber.trim()) || [];
    const raceState = convertDataToRaceState(
      importedEventId,
      new Date('2026-06-01T00:00:00.000Z'),
      apicalData,
      200000,
      'Australia/Sydney'
    );
    const raceStateTeam = raceState.teams?.find((team) => team.name === 'The Evereadys');
    const expectedMemberParticipants = expectedRaceNumbers.map((raceNumber) => {
      return raceState.participants?.find((participant) => getParticipantRacePlate(participant) === raceNumber);
    });

    expect(teamResult).toEqual(expect.objectContaining({
      IsTeamEntrant: true,
      RaceNumbers: '67, 62, 989',
      TeamNameDisplay: 'The Evereadys',
    }));
    expect(raceStateTeam).toBeDefined();
    expect(expectedMemberParticipants.every(Boolean)).toBe(true);
    expect([...raceStateTeam!.members].sort()).toEqual(expectedMemberParticipants.map((participant) => participant!.id).sort());

    onPersistedLedger.mockClear();
    vi.mocked(seededPersistence.save).mockClear();

    await service.importApicalRaceState({
      apicalDataFilePath: path.join(process.cwd(), 'src', 'generated', 'apical-excel-cache', 'apical-event-68.xlsx'),
      eventDate: '2026-06-01T00:00:00.000Z',
      eventId: importedEventId,
      eventName: 'Crazy 6 2026',
      raceState,
      sessionId: importedSessionId,
      timeZone: 'Australia/Sydney',
    });

    const eventEntrants = getEntrantsForEvent(service.catalog, importedEventId);
    const category = getCategoriesForEvent(service.catalog, importedEventId).find((item) => item.name === 'EBIKE_TEAM');
    const teamEntrant = eventEntrants.find((entrant) => entrant.name === 'The Evereadys');
    const memberEntrants = expectedMemberParticipants.map((participant) => {
      return eventEntrants.find((entrant) => entrant.id === participant!.id);
    });
    const importedEvent = service.catalog.events.find((event) => event.id === importedEventId);
    const latestPersistedLedger = vi.mocked(seededPersistence.save).mock.calls.at(-1)?.[0];
    const latestPushedLedger = vi.mocked(onPersistedLedger).mock.calls.at(-1)?.[0];

    expect(category).toBeDefined();
    expect(teamEntrant).toEqual(expect.objectContaining({
      categoryId: category!.id,
      categoryIds: [category!.id],
      entrantType: 'team',
      id: raceStateTeam!.id,
      name: 'The Evereadys',
    }));
    expect(teamEntrant?.sessionIds).toBeUndefined();
    expect(Array.from(getCategoryAssignedSessionIds(category, getSessionsForEvent(service.catalog, importedEventId)))).toEqual([importedSessionId]);
    expect(Array.from(getEntrantAssignedSessionIds(teamEntrant, getCategoriesForEvent(service.catalog, importedEventId), getSessionsForEvent(service.catalog, importedEventId), eventEntrants))).toEqual([importedSessionId]);
    expect([...teamEntrant!.memberParticipantIds].sort()).toEqual(expectedMemberParticipants.map((participant) => participant!.id).sort());
    expect(memberEntrants.every(Boolean)).toBe(true);
    memberEntrants.forEach((memberEntrant) => {
      expect(memberEntrant).toEqual(expect.objectContaining({
        categoryId: category!.id,
        entrantType: 'rider',
        eventId: importedEventId,
        teamEntrantId: teamEntrant!.id,
      }));
    });
    expect(importedEvent?.categoryIds).toContain(category!.id);
    expect(importedEvent?.entrantIds).toEqual(expect.arrayContaining([
      teamEntrant!.id,
      ...expectedMemberParticipants.map((participant) => participant!.id),
    ]));
    expect(getEntrantsForCategory(service.catalog, importedEventId, category!.id).map((entrant) => entrant.id)).toEqual(expect.arrayContaining([
      teamEntrant!.id,
      ...expectedMemberParticipants.map((participant) => participant!.id),
    ]));
    expect(getTeamsForParticipant(service.catalog, importedEventId, expectedMemberParticipants[0]!.id)).toEqual([teamEntrant]);

    expect(latestPersistedLedger).toBeDefined();
    expect(latestPushedLedger).toBeDefined();
    expect(latestPushedLedger?.mutations).toHaveLength(latestPersistedLedger!.mutations.length);
    expect(latestPersistedLedger!.mutations).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'race-state-imported' }),
      expect.objectContaining({ category: expect.objectContaining({ id: category!.id }), type: 'category-created' }),
      expect.objectContaining({ entrant: expect.objectContaining({ id: teamEntrant!.id, entrantType: 'team' }), type: 'entrant-created' }),
      expect.objectContaining({ changes: expect.objectContaining({ entrantIds: expect.arrayContaining([teamEntrant!.id]) }), type: 'event-updated' }),
    ]));

    const reloadedService = await EventCatalogService.create(createPersistence(latestPersistedLedger));
    const reloadedTeamEntrant = getEntrantsForEvent(reloadedService.catalog, importedEventId).find((entrant) => entrant.id === teamEntrant!.id);
    expect(reloadedTeamEntrant).toEqual(teamEntrant);
    expect(getTeamsForParticipant(reloadedService.catalog, importedEventId, expectedMemberParticipants[1]!.id)).toEqual([teamEntrant]);

    const addedParticipantId = createEventParticipantId('apical-event-68-real-ledger-added-member');
    const updatedLedger: EventCatalogLedger = {
      ...latestPersistedLedger!,
      mutations: [
        ...latestPersistedLedger!.mutations,
        {
          changes: {
            memberParticipantIds: [...teamEntrant!.memberParticipantIds, addedParticipantId],
            teamMembers: [
              ...(teamEntrant!.teamMembers || []),
              {
                categoryId: category!.id,
                firstName: 'Added',
                lastName: 'Member',
                participantId: addedParticipantId,
              },
            ],
          },
          entrantId: teamEntrant!.id,
          id: 'mutation-add-team-member',
          timestamp: '2026-06-01T01:00:00.000Z',
          type: 'entrant-updated',
        },
      ],
    };
    const updatedState = applyEventCatalogLedger(updatedLedger);

    expect(getTeamsForParticipant(updatedState, importedEventId, addedParticipantId).map((entrant) => entrant.id)).toEqual([teamEntrant!.id]);
  });

  it('overrides Apical import scaffold data on re-fetch while preserving earlier mutations for matching IDs', async () => {
    const seededPersistence = createPersistence(createSeedEventCatalogLedger());
    const service = await EventCatalogService.create(seededPersistence);
    const importedEventId = '7b83ad1e-54ba-5f00-9712-1c82d3178640';
    const importedSessionId = createSessionId('session-apical-1001');
    const importedCategoryId = createCategoryId('cat-apical-a');
    const importedEntrantId = createEventEntrantId('entrant-apical-301');
    const importedParticipantId = createEventParticipantId('participant-apical-301');
    const importedRecordId = createTimeRecordId('passing-apical-301-lap-1');
    const importedSourceId = createTimeRecordSourceId('apical-source-1001');

    await service.importApicalRaceState({
      eventDate: '2026-06-07T01:30:00.000Z',
      eventId: importedEventId,
      eventName: 'Apical Round 7',
      raceState: {
        categories: [
          {
            code: 'A',
            description: '',
            id: 'cat-apical-a',
            name: 'A',
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
        records: [
          {
            id: 'passing-apical-301-lap-1',
            recordType: 1,
            source: importedSourceId,
            time: new Date('2026-06-07T01:45:00.000Z'),
          },
        ],
      },
      sessionId: 'session-apical-1001',
      timeZone: 'Australia/Sydney',
    });
    await service.updateCategory(importedCategoryId, { name: 'Manual Category Edit' });
    await service.updateEntrant(importedEntrantId, { firstName: 'Manual', name: 'Manual Rider Edit' });

    await service.importApicalRaceState({
      eventDate: '2026-06-07T01:30:00.000Z',
      eventId: importedEventId,
      eventName: 'Apical Round 7',
      raceState: {
        categories: [
          {
            code: 'A',
            description: '',
            id: 'cat-apical-a',
            name: 'A Re-imported',
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
        records: [
          {
            id: 'passing-apical-301-lap-1',
            recordType: 1,
            source: importedSourceId,
            time: new Date('2026-06-07T01:46:00.000Z'),
          },
        ],
      },
      sessionId: 'session-apical-1001',
      timeZone: 'Australia/Sydney',
    });

    const category = service.catalog.categories.find((item) => item.id === importedCategoryId);
    const entrant = service.catalog.entrants.find((item) => item.id === importedEntrantId);
    const importedRaceState = service.getImportedRaceState(importedEventId, importedSessionId);
    const savedLedger = vi.mocked(seededPersistence.save).mock.calls.at(-1)?.[0];

    expect(category).toEqual(expect.objectContaining({
      id: importedCategoryId,
      name: 'A Re-imported',
    }));
    expect(entrant).toEqual(expect.objectContaining({
      firstName: 'Robert',
      id: importedEntrantId,
      memberParticipantIds: [importedParticipantId],
      name: 'Robert WOOD',
    }));
    expect(importedRaceState?.records).toEqual([
      expect.objectContaining({
        id: importedRecordId,
        time: new Date('2026-06-07T01:46:00.000Z'),
      }),
    ]);
    expect(savedLedger?.mutations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        categoryId: importedCategoryId,
        changes: expect.objectContaining({ name: 'Manual Category Edit' }),
        type: 'category-updated',
      }),
      expect.objectContaining({
        changes: expect.objectContaining({ firstName: 'Manual', name: 'Manual Rider Edit' }),
        entrantId: importedEntrantId,
        type: 'entrant-updated',
      }),
      expect.objectContaining({
        raceState: expect.objectContaining({
          categories: [expect.objectContaining({ id: importedCategoryId, name: 'A Re-imported' })],
          participants: [expect.objectContaining({ entrantId: importedEntrantId, id: importedParticipantId })],
          records: [expect.objectContaining({ id: importedRecordId })],
        }),
        type: 'race-state-imported',
      }),
    ]));
  });

  it('links imported categories to their imported sessions while reusing event categories', async () => {
    const seededPersistence = createPersistence(createSeedEventCatalogLedger());
    const service = await EventCatalogService.create(seededPersistence);
    const importedEventId = createEventId('multi-session-import-event');
    const firstSessionId = createSessionId('multi-session-import-race-one');
    const secondSessionId = createSessionId('multi-session-import-race-two');
    const sharedCategoryId = createCategoryId('multi-session-import-category-shared');
    const firstOnlyCategoryId = createCategoryId('multi-session-import-category-first-only');
    const secondOnlyCategoryId = createCategoryId('multi-session-import-category-second-only');

    await service.importApicalRaceState({
      eventDate: '2026-06-07T01:30:00.000Z',
      eventId: importedEventId,
      eventName: 'Imported Race One',
      raceState: {
        categories: [
          {
            code: 'SHR',
            description: '',
            id: 'multi-session-import-category-shared',
            name: 'Shared',
          },
          {
            code: 'ONE',
            description: '',
            id: 'multi-session-import-category-first-only',
            name: 'Race One Only',
          },
        ],
        participants: [],
        records: [],
        teams: [],
      },
      sessionId: 'multi-session-import-race-one',
      timeZone: 'Australia/Sydney',
    });

    await service.importApicalRaceState({
      eventDate: '2026-06-07T03:00:00.000Z',
      eventId: importedEventId,
      eventName: 'Imported Race Two',
      raceState: {
        categories: [
          {
            code: 'SHR',
            description: '',
            id: 'multi-session-import-category-shared',
            name: 'Shared',
          },
          {
            code: 'TWO',
            description: '',
            id: 'multi-session-import-category-second-only',
            name: 'Race Two Only',
          },
        ],
        participants: [],
        records: [],
        teams: [],
      },
      sessionId: 'multi-session-import-race-two',
      timeZone: 'Australia/Sydney',
    });

    const eventCategories = getCategoriesForEvent(service.catalog, importedEventId);
    const eventSessions = getSessionsForEvent(service.catalog, importedEventId);
    const sharedCategory = eventCategories.find((category) => category.id === sharedCategoryId);
    const firstOnlyCategory = eventCategories.find((category) => category.id === firstOnlyCategoryId);
    const secondOnlyCategory = eventCategories.find((category) => category.id === secondOnlyCategoryId);

    expect(eventCategories.map((category) => category.id)).toEqual([
      sharedCategoryId,
      firstOnlyCategoryId,
      secondOnlyCategoryId,
    ]);
    expect(eventCategories.filter((category) => category.id === sharedCategoryId)).toHaveLength(1);
    expect(Array.from(getCategoryAssignedSessionIds(sharedCategory, eventSessions))).toEqual([
      firstSessionId,
      secondSessionId,
    ]);
    expect(Array.from(getCategoryAssignedSessionIds(firstOnlyCategory, eventSessions))).toEqual([firstSessionId]);
    expect(Array.from(getCategoryAssignedSessionIds(secondOnlyCategory, eventSessions))).toEqual([secondSessionId]);
    expect(Array.from(getSessionAssignedCategoryIds(eventCategories, firstSessionId, eventSessions))).toEqual([
      sharedCategoryId,
      firstOnlyCategoryId,
    ]);
    expect(Array.from(getSessionAssignedCategoryIds(eventCategories, secondSessionId, eventSessions))).toEqual([
      sharedCategoryId,
      secondOnlyCategoryId,
    ]);
  });

  it('reloads imported race state while replaying manual category and entrant mutations above the refreshed scaffold', async () => {
    const seededPersistence = createPersistence(createSeedEventCatalogLedger());
    const service = await EventCatalogService.create(seededPersistence);
    const importedEventId = createEventId('reload-source-event');
    const importedSessionId = createSessionId('reload-source-session');
    const importedCategoryId = createCategoryId('reload-source-category');
    const importedEntrantId = createEventEntrantId('reload-source-entrant');
    const importedParticipantId = createEventParticipantId('reload-source-participant');
    const importedRecordId = createTimeRecordId('reload-source-record');
    const importedSourceId = createTimeRecordSourceId('reload-source');

    await service.importApicalRaceState({
      eventDate: '2026-06-07T01:30:00.000Z',
      eventId: importedEventId,
      eventName: 'Reload Source Round',
      raceState: {
        categories: [
          {
            code: 'A',
            description: '',
            id: 'reload-source-category',
            name: 'A',
          },
        ],
        participants: [
          {
            categoryId: 'reload-source-category',
            currentResult: undefined,
            entrantId: 'reload-source-entrant',
            firstname: 'Robert',
            id: 'reload-source-participant',
            identifiers: [],
            lastRecordTime: null,
            resultDuration: null,
            surname: 'Wood',
          },
        ],
        records: [
          {
            id: 'reload-source-record',
            recordType: 1,
            source: 'reload-source',
            time: new Date('2026-06-07T01:45:00.000Z'),
          },
        ],
      },
      sessionId: importedSessionId,
      timeZone: 'Australia/Sydney',
    });
    await service.updateCategory(importedCategoryId, { name: 'Manual Category Name' });
    await service.updateEntrant(importedEntrantId, { firstName: 'Manual', name: 'Manual Rider Name' });

    await service.reloadImportedRaceState(importedEventId, importedSessionId, {
      categories: [
        {
          code: 'A',
          description: '',
          id: 'reload-source-category',
          name: 'A From Source Reload',
        },
      ],
      participants: [
        {
          categoryId: 'reload-source-category',
          currentResult: undefined,
          entrantId: 'reload-source-entrant',
          firstname: 'Robert',
          id: 'reload-source-participant',
          identifiers: [],
          lastRecordTime: null,
          resultDuration: null,
          surname: 'Wood',
        },
      ],
      records: [
        {
          id: 'reload-source-record',
          recordType: 1,
          source: 'reload-source',
          time: new Date('2026-06-07T01:55:00.000Z'),
        },
      ],
      teams: [],
    });

    const category = service.catalog.categories.find((item) => item.id === importedCategoryId);
    const entrant = service.catalog.entrants.find((item) => item.id === importedEntrantId);
    const importedRaceState = service.getImportedRaceState(importedEventId, importedSessionId);
    const savedLedger = vi.mocked(seededPersistence.save).mock.calls.at(-1)?.[0] as EventCatalogLedger;
    const finalManualCategoryUpdateIndex = savedLedger.mutations.findLastIndex((mutation) => (
      mutation.type === 'category-updated' &&
      mutation.changes.name === 'Manual Category Name'
    ));
    const finalManualEntrantUpdateIndex = savedLedger.mutations.findLastIndex((mutation) => (
      mutation.type === 'entrant-updated' &&
      mutation.changes.name === 'Manual Rider Name'
    ));
    const refreshedImportIndex = savedLedger.mutations.findLastIndex((mutation) => mutation.type === 'race-state-imported');

    expect(category).toEqual(expect.objectContaining({
      id: importedCategoryId,
      name: 'Manual Category Name',
    }));
    expect(entrant).toEqual(expect.objectContaining({
      firstName: 'Manual',
      id: importedEntrantId,
      name: 'Manual Rider Name',
    }));
    expect(importedRaceState).toEqual(expect.objectContaining({
      categories: [expect.objectContaining({ id: importedCategoryId, name: 'A From Source Reload' })],
      participants: [expect.objectContaining({ entrantId: importedEntrantId, id: importedParticipantId })],
      records: [expect.objectContaining({ id: importedRecordId, source: importedSourceId, time: new Date('2026-06-07T01:55:00.000Z') })],
    }));
    expect(finalManualCategoryUpdateIndex).toBeGreaterThan(refreshedImportIndex);
    expect(finalManualEntrantUpdateIndex).toBeGreaterThan(refreshedImportIndex);
    expect(savedLedger.mutations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        raceState: expect.objectContaining({
          categories: [expect.objectContaining({ id: importedCategoryId, name: 'A From Source Reload' })],
        }),
        type: 'race-state-imported',
      }),
      expect.objectContaining({
        changes: expect.objectContaining({ name: 'Manual Category Name' }),
        type: 'category-updated',
      }),
      expect.objectContaining({
        changes: expect.objectContaining({ firstName: 'Manual', name: 'Manual Rider Name' }),
        type: 'entrant-updated',
      }),
    ]));
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

  it('keeps deleted historical category versions while exposing only one active category for an ID', () => {
    const seed = createSeedEventCatalogLedger();
    const state = applyEventCatalogLedger({
      ...seed,
      mutations: [
        ...seed.mutations,
        {
          categoryId: SEED_CLUBMAN_CATEGORY_ID,
          id: 'mutation-delete-clubman',
          timestamp: '2026-05-30T11:22:00.000Z',
          type: 'category-deleted' as const,
        },
        {
          category: {
            code: 'CLB',
            eventId: SEED_EVENT_ID,
            id: SEED_CLUBMAN_CATEGORY_ID,
            name: 'Clubman Recreated',
          },
          id: 'mutation-recreate-clubman',
          timestamp: '2026-05-30T11:23:00.000Z',
          type: 'category-created' as const,
        },
        {
          changes: {
            categoryIds: [SEED_PREMIER_CATEGORY_ID, SEED_CLUBMAN_CATEGORY_ID],
          },
          eventId: SEED_EVENT_ID,
          id: 'mutation-relink-clubman',
          timestamp: '2026-05-30T11:24:00.000Z',
          type: 'event-updated' as const,
        },
      ],
    });
    const categoryVersions = state.categories.filter((category) => category.id === SEED_CLUBMAN_CATEGORY_ID);
    const activeCategoryVersions = categoryVersions.filter((category) => category.deleted !== true);

    expect(categoryVersions.some((category) => category.deleted === true && category.name !== 'Clubman Recreated')).toBe(true);
    expect(activeCategoryVersions).toEqual([
      expect.objectContaining({
        id: SEED_CLUBMAN_CATEGORY_ID,
        name: 'Clubman Recreated',
      }),
    ]);
    expect(getCategoriesForEvent(state, SEED_EVENT_ID).filter((category) => category.id === SEED_CLUBMAN_CATEGORY_ID)).toEqual(activeCategoryVersions);
  });
});
