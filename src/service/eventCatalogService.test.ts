import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validate as validateUuid } from 'uuid';
import { readApicalExcelBuffer } from '../controllers/apical/apicalSpreadsheetProcessor.js';
import { convertDataToRaceState } from '../parsers/apical.js';
import { createSeedEventCatalogLedger } from '../ledger/createSeedEventCatalogLedger.js';
import {
    type EventCatalogState,
    getCategoryAssignedSessionIds,
    getCategoriesForEvent,
    getEntrantAssignedSessionIds,
    getEntrantsForCategory,
    getEntrantsForEvent,
    getParticipantEntrantMemberships,
    getSessionAssignedCategoryIds,
    getSessionsForEvent,
    getTeamsForParticipant,
} from '../catalog/eventCatalog.js';
import {
    type EventCatalogLedger,
    applyEventCatalogLedger,
    createDefaultEventCatalogLedger,
} from '../ledger/eventCatalogLedger.js';

import type { EventParticipant, ParticipateRacePlate, ParticipantTransponder } from '../model/eventparticipant.js';
import { createCategoryId, createEventEntrantId, createEventId, createEventParticipantId, createId, createSessionId, createTimeRecordId, createTimeRecordSourceId } from '../model/ids.js';
import { RECORD_TX_CROSSING, type EventTimeRecord } from '../model/timerecord.js';
import { createApicalTeamNameDisplayWorkbookBuffer } from '../testing/apicalTeamWorkbook.js';
import type { EventCatalogPersistence } from '../persistence/eventCatalogPersistence.js';
import { EventCatalogService } from '../service/eventCatalogService.js';

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

  it('finds entrant memberships for a participant across any event to diagnose broken links', async () => {
    const currentEventId = createEventId('participant-membership-current-event');
    const previousEventId = createEventId('participant-membership-previous-event');
    const previousCategoryId = createCategoryId('participant-membership-previous-category');
    const previousSessionId = createSessionId('participant-membership-previous-session');
    const participantId = createEventParticipantId('participant-membership-rider');
    const teamEntrantId = createEventEntrantId('participant-membership-team');
    const ledger: EventCatalogLedger = {
      mutations: [
        {
          event: {
            categoryIds: [],
            date: '2026-01-01',
            entrantIds: [],
            format: 'race-weekend',
            id: currentEventId,
            name: 'Current Event',
            sessionIds: [],
          },
          id: createId('participant-membership-current-event-created'),
          timestamp: '2026-01-01T00:00:00.000Z',
          type: 'event-created',
        },
        {
          event: {
            categoryIds: [previousCategoryId],
            date: '2025-12-01',
            entrantIds: [teamEntrantId, participantId],
            format: 'race-weekend',
            id: previousEventId,
            name: 'Previous Event',
            sessionIds: [previousSessionId],
          },
          id: createId('participant-membership-previous-event-created'),
          timestamp: '2026-01-01T00:01:00.000Z',
          type: 'event-created',
        },
        {
          category: {
            code: 'P1',
            description: '',
            eventId: previousEventId,
            id: previousCategoryId,
            name: 'Previous Category',
          },
          id: createId('participant-membership-category-created'),
          timestamp: '2026-01-01T00:02:00.000Z',
          type: 'category-created',
        },
        {
          session: {
            categoryIds: [previousCategoryId],
            eventId: previousEventId,
            id: previousSessionId,
            kind: 'race',
            name: 'Previous Race',
            scheduledStart: '2025-12-01T10:00:00.000Z',
            status: 'completed',
          },
          id: createId('participant-membership-session-created'),
          timestamp: '2026-01-01T00:03:00.000Z',
          type: 'session-created',
        },
        {
          entrant: {
            categoryId: previousCategoryId,
            categoryIds: [previousCategoryId],
            entrantType: 'team',
            eventId: previousEventId,
            id: teamEntrantId,
            memberParticipantIds: [],
            name: 'Previous Team',
          },
          id: createId('participant-membership-team-created'),
          timestamp: '2026-01-01T00:04:00.000Z',
          type: 'entrant-created',
        },
        {
          entrant: {
            categoryId: previousCategoryId,
            categoryIds: [previousCategoryId],
            entrantType: 'rider',
            eventId: previousEventId,
            id: participantId,
            memberParticipantIds: [participantId],
            name: 'Previous Rider',
            teamEntrantId,
          },
          id: createId('participant-membership-rider-created'),
          timestamp: '2026-01-01T00:05:00.000Z',
          type: 'entrant-created',
        },
        {
          eventId: currentEventId,
          id: createId('participant-membership-current-event-activated'),
          timestamp: '2026-01-01T00:06:00.000Z',
          type: 'event-activated',
        },
      ],
      schemaVersion: 1,
    };
    const service = await EventCatalogService.create(createPersistence(ledger));

    const memberships = service.findEntrantMembershipsForParticipant(participantId);

    expect(service.findEntrantMembershipsForParticipant(participantId, currentEventId)).toEqual([]);
    expect(getParticipantEntrantMemberships(service.catalog, participantId, { eventId: previousEventId }).map((membership) => membership.entrant.id))
      .toEqual([participantId]);
    expect(memberships.map((membership) => membership.entrant.id)).toEqual([participantId, teamEntrantId]);
    expect(memberships.map((membership) => membership.event.id)).toEqual([previousEventId, previousEventId]);
    expect(memberships.map((membership) => membership.categories.map((category) => category.id))).toEqual([[previousCategoryId], [previousCategoryId]]);
    expect(memberships.map((membership) => membership.sessions.map((session) => session.id))).toEqual([[previousSessionId], [previousSessionId]]);
  });

  it('links a globally known entrant into the imported event when scaffold data references it', async () => {
    const currentEventId = createEventId('global-entrant-current-event');
    const currentSessionId = createSessionId('global-entrant-current-session');
    const currentCategoryId = createCategoryId('global-entrant-current-category');
    const previousEventId = createEventId('global-entrant-previous-event');
    const previousCategoryId = createCategoryId('global-entrant-previous-category');
    const entrantId = createEventEntrantId('global-entrant-existing');
    const participantId = createEventParticipantId('global-entrant-participant');
    const ledger: EventCatalogLedger = {
      mutations: [
        {
          event: {
            categoryIds: [],
            date: '2026-01-01',
            entrantIds: [],
            format: 'race-weekend',
            id: currentEventId,
            name: 'Current Event',
            sessionIds: [currentSessionId],
          },
          id: createId('global-entrant-current-event-created'),
          timestamp: '2026-01-01T00:00:00.000Z',
          type: 'event-created',
        },
        {
          event: {
            categoryIds: [previousCategoryId],
            date: '2025-12-01',
            entrantIds: [entrantId],
            format: 'race-weekend',
            id: previousEventId,
            name: 'Previous Event',
            sessionIds: [],
          },
          id: createId('global-entrant-previous-event-created'),
          timestamp: '2026-01-01T00:01:00.000Z',
          type: 'event-created',
        },
        {
          id: createId('global-entrant-current-session-created'),
          session: {
            categoryIds: [],
            eventId: currentEventId,
            id: currentSessionId,
            kind: 'race',
            name: 'Current Race',
            scheduledStart: '2026-01-01T10:00:00.000Z',
            status: 'completed',
          },
          timestamp: '2026-01-01T00:02:00.000Z',
          type: 'session-created',
        },
        {
          category: {
            code: 'OLD',
            description: '',
            eventId: previousEventId,
            id: previousCategoryId,
            name: 'Previous Category',
          },
          id: createId('global-entrant-previous-category-created'),
          timestamp: '2026-01-01T00:03:00.000Z',
          type: 'category-created',
        },
        {
          entrant: {
            categoryId: previousCategoryId,
            categoryIds: [previousCategoryId],
            entrantType: 'rider',
            eventId: previousEventId,
            firstName: 'Known',
            id: entrantId,
            identifiers: [{ fromTime: undefined, racePlate: '77', toTime: undefined } as ParticipateRacePlate],
            lastName: 'Entrant',
            memberParticipantIds: [participantId],
            name: 'Known Entrant',
          },
          id: createId('global-entrant-existing-created'),
          timestamp: '2026-01-01T00:04:00.000Z',
          type: 'entrant-created',
        },
      ],
      schemaVersion: 1,
    };
    const persistence = createPersistence(ledger);
    const service = await EventCatalogService.create(persistence);

    await service.syncEventScaffold(
      currentEventId,
      [{ code: 'CUR', description: '', id: currentCategoryId, name: 'Current Category' }],
      [
        {
          categoryId: currentCategoryId,
          currentResult: undefined,
          entrantId,
          firstname: 'Imported',
          id: participantId,
          identifiers: [{ fromTime: undefined, racePlate: '88', toTime: undefined } as ParticipateRacePlate],
          lastRecordTime: null,
          resultDuration: null,
          surname: 'Rider',
        },
      ],
      [],
      [],
      currentSessionId
    );

    const currentEntrants = getEntrantsForEvent(service.catalog, currentEventId);
    const previousEvent = service.catalog.events.find((event) => event.id === previousEventId);
    const currentEvent = service.catalog.events.find((event) => event.id === currentEventId);
    const movedEntrant = currentEntrants.find((entrant) => entrant.id === entrantId);
    const savedLedger = vi.mocked(persistence.save).mock.calls.at(-1)?.[0] as EventCatalogLedger;

    expect(previousEvent?.entrantIds).not.toContain(entrantId);
    expect(currentEvent?.entrantIds).toContain(entrantId);
    expect(movedEntrant).toEqual(expect.objectContaining({
      categoryId: currentCategoryId,
      categoryIds: [currentCategoryId],
      eventId: currentEventId,
      identifiers: [{ fromTime: undefined, racePlate: '88', toTime: undefined } as ParticipateRacePlate],
      memberParticipantIds: [participantId],
      name: 'Known Entrant',
    }));
    expect(getEntrantsForEvent(service.catalog, previousEventId).find((entrant) => entrant.id === entrantId)).toBeUndefined();
    expect(savedLedger.mutations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entrantId,
        type: 'entrant-deleted',
      }),
      expect.objectContaining({
        entrant: expect.objectContaining({
          eventId: currentEventId,
          id: entrantId,
          name: 'Known Entrant',
        }),
        type: 'entrant-created',
      }),
    ]));
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

    await service.updateImportedRaceState(SEED_EVENT_ID, SEED_PRACTICE_SESSION_ID, raceState);

    expect(onPersistedLedger).toHaveBeenCalled();
    expect(persistence.save).toHaveBeenCalledTimes(1);
    expect(onPersistedLedger).toHaveBeenCalledTimes(1);
    const savedLedger = (persistence.save as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as EventCatalogLedger;
    const savedMutation = savedLedger.mutations.findLast((mutation) => mutation.type === 'race-state-imported');
    expect(savedMutation?.type).toBe('race-state-imported');
    expect(savedMutation && savedMutation.type === 'race-state-imported' ? savedMutation.raceState.participants?.[0].identifiers : [])
      .toEqual(raceState.participants[0].identifiers);

    const reloaded = await EventCatalogService.create(createPersistence(savedLedger));
    const reloadedRaceState = reloaded.getImportedRaceState(SEED_EVENT_ID, SEED_PRACTICE_SESSION_ID);
    expect(reloadedRaceState?.participants?.[0].identifiers).toEqual(raceState.participants[0].identifiers);
  });

  it('repairs imported participants without entrant IDs into direct parent entrants', async () => {
    const persistence = createPersistence(createSeedEventCatalogLedger());
    const service = await EventCatalogService.create(persistence);
    const participantId = createEventParticipantId('blank-imported-entrant-participant');

    await service.updateImportedRaceState(SEED_EVENT_ID, SEED_PRACTICE_SESSION_ID, {
      categories: [
        {
          code: 'BLK',
          description: '',
          id: TEST_CATEGORY_ID,
          name: 'Blank Entrant Category',
        },
      ],
      participants: [
        {
          categoryId: TEST_CATEGORY_ID,
          currentResult: undefined,
          entrantId: '',
          firstname: 'Direct',
          id: participantId,
          identifiers: [{ fromTime: undefined, racePlate: '822', toTime: undefined } as ParticipateRacePlate],
          lastRecordTime: null,
          resultDuration: null,
          surname: 'Entrant',
        },
      ],
      records: [],
      teams: [],
    });

    const importedRaceState = service.getImportedRaceState(SEED_EVENT_ID, SEED_PRACTICE_SESSION_ID);
    const entrant = getEntrantsForEvent(service.catalog, SEED_EVENT_ID).find((item) => item.id === participantId);

    expect(importedRaceState?.participants?.[0]).toEqual(expect.objectContaining({
      entrantId: participantId,
      id: participantId,
    }));
    expect(entrant).toEqual(expect.objectContaining({
      categoryId: TEST_CATEGORY_ID,
      identifiers: [{ fromTime: undefined, racePlate: '822', toTime: undefined } as ParticipateRacePlate],
      memberParticipantIds: [participantId],
      name: 'Direct Entrant',
    }));
  });

  it('does not delete imported parent entrants while participants still reference them', async () => {
    const persistence = createPersistence(createSeedEventCatalogLedger());
    const service = await EventCatalogService.create(persistence);
    const participantId = createEventParticipantId('delete-guard-imported-participant');
    const entrantId = createEventEntrantId('delete-guard-imported-entrant');

    await service.updateImportedRaceState(SEED_EVENT_ID, SEED_PRACTICE_SESSION_ID, {
      categories: [{ id: TEST_CATEGORY_ID, name: 'Delete Guard Category' }],
      participants: [
        {
          categoryId: TEST_CATEGORY_ID,
          currentResult: undefined,
          entrantId,
          firstname: 'Protected',
          id: participantId,
          identifiers: [{ fromTime: undefined, racePlate: '923', toTime: undefined } as ParticipateRacePlate],
          lastRecordTime: null,
          resultDuration: null,
          surname: 'Entrant',
        },
      ],
      records: [],
      teams: [],
    });

    await expect(service.deleteEntrant(SEED_EVENT_ID, entrantId)).rejects.toThrow(
      `Cannot delete entrant ${entrantId} because imported participants still reference it.`
    );
    expect(getEntrantsForEvent(service.catalog, SEED_EVENT_ID).find((entrant) => entrant.id === entrantId)).toBeDefined();
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

  it('cleans duplicate mutation IDs while loading and saves the repaired ledger', async () => {
    const seededLedger = createSeedEventCatalogLedger();
    const duplicateMutationId = createId('mutation-duplicate-loaded-event-name');
    const firstNameMutation = {
      changes: { name: 'Duplicate Source Name' },
      eventId: SEED_EVENT_ID,
      id: duplicateMutationId,
      timestamp: '2026-07-01T00:00:00.000Z',
      type: 'event-updated' as const,
    };
    const secondNameMutation = {
      changes: { name: 'Final Source Name' },
      eventId: SEED_EVENT_ID,
      id: createId('mutation-final-loaded-event-name'),
      timestamp: '2026-07-01T00:01:00.000Z',
      type: 'event-updated' as const,
    };
    const persistence = createPersistence({
      ...seededLedger,
      mutations: [
        ...seededLedger.mutations,
        firstNameMutation,
        secondNameMutation,
        firstNameMutation,
      ],
    });
    const onPersistedLedger = vi.fn(async () => undefined);

    const service = await EventCatalogService.create(persistence, { onPersistedLedger });

    const savedLedger = vi.mocked(persistence.save).mock.calls.at(-1)?.[0] as EventCatalogLedger;
    const loadedEvent = service.catalog.events.find((event) => event.id === SEED_EVENT_ID);
    expect(loadedEvent?.name).toBe('Final Source Name');
    expect(savedLedger.mutations.filter((mutation) => mutation.id === duplicateMutationId)).toHaveLength(1);
    expect(persistence.save).toHaveBeenCalledOnce();
    expect(onPersistedLedger).toHaveBeenCalledWith(savedLedger);
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

  it('skips writing duplicate mutations that would not change the current object state', async () => {
    const seededPersistence = createPersistence(createSeedEventCatalogLedger());
    const service = await EventCatalogService.create(seededPersistence);

    await service.updateEvent(SEED_EVENT_ID, { name: 'RaceSweet Repeated Name' });
    await service.updateEvent(SEED_EVENT_ID, { name: 'RaceSweet Repeated Name' });

    const savedLedger = vi.mocked(seededPersistence.save).mock.calls.at(-1)?.[0] as EventCatalogLedger;
    const matchingUpdates = savedLedger.mutations.filter((mutation) => {
      return mutation.type === 'event-updated' &&
        mutation.eventId === SEED_EVENT_ID &&
        mutation.changes.name === 'RaceSweet Repeated Name';
    });

    expect(matchingUpdates).toHaveLength(1);
    expect(seededPersistence.save).toHaveBeenCalledTimes(1);
  });

  it('persists bulk session updates as one service notification', async () => {
    const seededPersistence = createPersistence(createSeedEventCatalogLedger());
    const onPersistedLedger = vi.fn(async (_ledger: EventCatalogLedger) => undefined);
    const service = await EventCatalogService.create(seededPersistence, { onPersistedLedger });

    await service.updateSessions([
      {
        changes: { name: 'Bulk Practice' },
        sessionId: SEED_PRACTICE_SESSION_ID,
      },
      {
        changes: { name: 'Bulk Race' },
        sessionId: SEED_RACE_SESSION_ID,
      },
    ]);

    expect(service.catalog.sessions.find((session) => session.id === SEED_PRACTICE_SESSION_ID)?.name).toBe('Bulk Practice');
    expect(service.catalog.sessions.find((session) => session.id === SEED_RACE_SESSION_ID)?.name).toBe('Bulk Race');
    expect(seededPersistence.save).toHaveBeenCalledTimes(1);
    expect(onPersistedLedger).toHaveBeenCalledTimes(1);
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
    expect(seededPersistence.save).toHaveBeenCalledTimes(1);
  });

  it('imports an MR-SCATS catalog as event sessions, categories, entrants, and per-session race states', async () => {
    const seededPersistence = createPersistence(createSeedEventCatalogLedger());
    const onPersistedLedger = vi.fn(async (_ledger: EventCatalogLedger) => undefined);
    const service = await EventCatalogService.create(seededPersistence, { onPersistedLedger });
    const importedEventId = createEventId('mr-scats-test-event');
    const raceSessionId = createSessionId('mr-scats-test-race-session');
    const qualifyingSessionId = createSessionId('mr-scats-test-qualifying-session');
    const raceCategoryId = createCategoryId('mr-scats-test-category-race');
    const qualifyingCategoryId = createCategoryId('mr-scats-test-category-qualifying');
    const raceEntrantId = createEventEntrantId('mr-scats-test-entrant-race');
    const qualifyingEntrantId = createEventEntrantId('mr-scats-test-entrant-qualifying');
    const raceParticipantId = createEventParticipantId('mr-scats-test-participant-race');
    const qualifyingParticipantId = createEventParticipantId('mr-scats-test-participant-qualifying');
    const raceRecordId = createTimeRecordId('mr-scats-test-race-record');
    const qualifyingRecordId = createTimeRecordId('mr-scats-test-qualifying-record');
    const raceSourceId = createTimeRecordSourceId('mr-scats-test-race-source');
    const qualifyingSourceId = createTimeRecordSourceId('mr-scats-test-qualifying-source');

    onPersistedLedger.mockClear();
    vi.mocked(seededPersistence.save).mockClear();

    await service.importMrScatsCatalog({
      eventDate: '1997-06-29',
      eventId: importedEventId,
      eventName: 'MR-SCATS Test Meeting',
      raceState: {
        categories: [
          { code: 'RACE', description: '', id: raceCategoryId, name: 'Race Class' },
          { code: 'QUAL', description: '', id: qualifyingCategoryId, name: 'Qualifying Class' },
        ],
        participants: [
          {
            categoryId: raceCategoryId,
            currentResult: undefined,
            entrantId: raceEntrantId,
            firstname: 'Alice',
            id: raceParticipantId,
            identifiers: [
              { fromTime: undefined, racePlate: '42', toTime: undefined } as ParticipateRacePlate,
              { fromTime: undefined, toTime: undefined, txNo: '1001' } as ParticipantTransponder,
            ],
            lastRecordTime: null,
            resultDuration: null,
            surname: 'Rider',
          },
          {
            categoryId: qualifyingCategoryId,
            currentResult: undefined,
            entrantId: qualifyingEntrantId,
            firstname: 'Bob',
            id: qualifyingParticipantId,
            identifiers: [
              { fromTime: undefined, racePlate: '77', toTime: undefined } as ParticipateRacePlate,
            ],
            lastRecordTime: null,
            resultDuration: null,
            surname: 'Driver',
          },
        ],
        records: [
          {
            chipCode: 1001,
            eventId: importedEventId,
            id: raceRecordId,
            originRecordNumber: 1,
            plateNumber: '42',
            recordType: RECORD_TX_CROSSING,
            sequence: 1,
            sessionId: raceSessionId,
            source: raceSourceId,
            time: new Date('1997-06-28T23:05:01.000Z'),
          } as EventTimeRecord & { chipCode: number; plateNumber: string },
          {
            chipCode: 2002,
            eventId: importedEventId,
            id: qualifyingRecordId,
            originRecordNumber: 1,
            plateNumber: '77',
            recordType: RECORD_TX_CROSSING,
            sequence: 1,
            sessionId: qualifyingSessionId,
            source: qualifyingSourceId,
            time: new Date('1997-06-29T00:00:01.000Z'),
          } as EventTimeRecord & { chipCode: number; plateNumber: string },
        ],
        teams: [],
      },
      sessions: [
        {
          categoryIds: [raceCategoryId],
          eventCode: 'W9721R01',
          eventType: 'R',
          id: raceSessionId,
          name: 'Feature Race',
          scheduledStart: '1997-06-28T23:05:00.000Z',
        },
        {
          categoryIds: [qualifyingCategoryId],
          eventCode: 'W9721Q01',
          eventType: 'Q',
          id: qualifyingSessionId,
          name: 'Qualifying',
          scheduledStart: '1997-06-29T00:00:00.000Z',
        },
      ],
    });

    const event = service.catalog.events.find((item) => item.id === importedEventId);
    const raceSession = service.catalog.sessions.find((item) => item.id === raceSessionId);
    const qualifyingSession = service.catalog.sessions.find((item) => item.id === qualifyingSessionId);
    const importedEntrants = getEntrantsForEvent(service.catalog, importedEventId);
    const raceState = service.getImportedRaceState(importedEventId, raceSessionId);
    const qualifyingRaceState = service.getImportedRaceState(importedEventId, qualifyingSessionId);
    const latestPersistedLedger = vi.mocked(seededPersistence.save).mock.calls.at(-1)?.[0];

    expect(event).toEqual(expect.objectContaining({
      date: '1997-06-29',
      name: 'MR-SCATS Test Meeting',
      sessionIds: [raceSessionId, qualifyingSessionId],
      timeZone: 'Australia/Sydney',
    }));
    expect(raceSession).toEqual(expect.objectContaining({
      categoryIds: [raceCategoryId],
      kind: 'race',
      name: 'Feature Race',
      status: 'completed',
    }));
    expect(qualifyingSession).toEqual(expect.objectContaining({
      categoryIds: [qualifyingCategoryId],
      kind: 'qualifying',
      name: 'Qualifying',
    }));
    expect(importedEntrants).toEqual(expect.arrayContaining([
      expect.objectContaining({
        categoryIds: [raceCategoryId],
        id: raceEntrantId,
        name: 'Alice Rider',
      }),
      expect.objectContaining({
        categoryIds: [qualifyingCategoryId],
        id: qualifyingEntrantId,
        name: 'Bob Driver',
      }),
    ]));
    expect(raceState?.participants).toEqual([expect.objectContaining({
      id: raceParticipantId,
      identifiers: expect.arrayContaining([
        expect.objectContaining({ racePlate: '42' }),
        expect.objectContaining({ txNo: '1001' }),
      ]),
    })]);
    expect(qualifyingRaceState?.participants).toEqual([expect.objectContaining({ id: qualifyingParticipantId })]);
    expect(raceState?.records).toEqual([
      expect.objectContaining({
        id: raceRecordId,
        sessionId: raceSessionId,
      }),
    ]);
    expect(qualifyingRaceState?.records).toEqual([
      expect.objectContaining({
        id: qualifyingRecordId,
        sessionId: qualifyingSessionId,
      }),
    ]);
    expect(latestPersistedLedger).toBeDefined();
    expect(onPersistedLedger).toHaveBeenCalledWith(latestPersistedLedger);
    expect(seededPersistence.save).toHaveBeenCalledTimes(1);
    expect(onPersistedLedger).toHaveBeenCalledTimes(1);
    expect(latestPersistedLedger!.mutations).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: expect.objectContaining({ id: importedEventId }), type: 'event-created' }),
      expect.objectContaining({ session: expect.objectContaining({ id: raceSessionId }), type: 'session-created' }),
      expect.objectContaining({ session: expect.objectContaining({ id: qualifyingSessionId }), type: 'session-created' }),
      expect.objectContaining({ eventId: importedEventId, sessionId: raceSessionId, type: 'race-state-imported' }),
      expect.objectContaining({ eventId: importedEventId, sessionId: qualifyingSessionId, type: 'race-state-imported' }),
    ]));

    await service.importMrScatsCatalog({
      eventDate: '1997-06-29',
      eventId: importedEventId,
      eventName: 'MR-SCATS Test Meeting',
      raceState: {
        categories: [
          { code: 'RACE', description: '', id: raceCategoryId, name: 'Race Class' },
          { code: 'QUAL', description: '', id: qualifyingCategoryId, name: 'Qualifying Class' },
        ],
        participants: [
          {
            categoryId: raceCategoryId,
            currentResult: undefined,
            entrantId: raceEntrantId,
            firstname: 'Alice',
            id: raceParticipantId,
            identifiers: [
              { fromTime: undefined, racePlate: '42', toTime: undefined } as ParticipateRacePlate,
              { fromTime: undefined, toTime: undefined, txNo: '1001' } as ParticipantTransponder,
            ],
            lastRecordTime: null,
            resultDuration: null,
            surname: 'Rider',
          },
          {
            categoryId: qualifyingCategoryId,
            currentResult: undefined,
            entrantId: qualifyingEntrantId,
            firstname: 'Bob',
            id: qualifyingParticipantId,
            identifiers: [
              { fromTime: undefined, racePlate: '77', toTime: undefined } as ParticipateRacePlate,
            ],
            lastRecordTime: null,
            resultDuration: null,
            surname: 'Driver',
          },
        ],
        records: [
          {
            chipCode: 1001,
            eventId: importedEventId,
            id: raceRecordId,
            originRecordNumber: 1,
            plateNumber: '42',
            recordType: RECORD_TX_CROSSING,
            sequence: 1,
            sessionId: raceSessionId,
            source: raceSourceId,
            time: new Date('1997-06-28T23:05:01.000Z'),
          } as EventTimeRecord & { chipCode: number; plateNumber: string },
          {
            chipCode: 2002,
            eventId: importedEventId,
            id: qualifyingRecordId,
            originRecordNumber: 1,
            plateNumber: '77',
            recordType: RECORD_TX_CROSSING,
            sequence: 1,
            sessionId: qualifyingSessionId,
            source: qualifyingSourceId,
            time: new Date('1997-06-29T00:00:01.000Z'),
          } as EventTimeRecord & { chipCode: number; plateNumber: string },
        ],
        teams: [],
      },
      sessions: [
        {
          categoryIds: [raceCategoryId],
          eventCode: 'W9721R01',
          eventType: 'R',
          id: raceSessionId,
          name: 'Feature Race',
          scheduledStart: '1997-06-28T23:05:00.000Z',
        },
        {
          categoryIds: [qualifyingCategoryId],
          eventCode: 'W9721Q01',
          eventType: 'Q',
          id: qualifyingSessionId,
          name: 'Qualifying',
          scheduledStart: '1997-06-29T00:00:00.000Z',
        },
      ],
    });

    expect(service.getImportedRaceState(importedEventId, raceSessionId)?.records?.map((record) => record.id)).toEqual([raceRecordId]);
    expect(service.getImportedRaceState(importedEventId, qualifyingSessionId)?.records?.map((record) => record.id)).toEqual([qualifyingRecordId]);
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

  it('persists imported participant racePlate identifiers when scaffold entrants are created and updated', async () => {
    const seededPersistence = createPersistence(createSeedEventCatalogLedger());
    const service = await EventCatalogService.create(seededPersistence);
    const importedCategoryId = createCategoryId('mr-scats-raceplate-scaffold-category');
    const importedEntrantId = createEventEntrantId('mr-scats-raceplate-scaffold-entrant');
    const importedParticipantId = createEventParticipantId('mr-scats-raceplate-scaffold-participant');
    const importedCategory = {
      code: 'S0101',
      description: '',
      id: importedCategoryId,
      name: 'S0101 Class',
    };
    const createParticipant = (racePlate: string): EventParticipant => ({
      categoryId: importedCategoryId,
      currentResult: undefined,
      entrantId: importedEntrantId,
      firstname: 'Fallback',
      id: importedParticipantId,
      identifiers: [
        { fromTime: undefined, racePlate, toTime: undefined } as ParticipateRacePlate,
      ],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Driver',
    });

    await service.syncEventScaffold(SEED_EVENT_ID, [importedCategory], [createParticipant('15')]);

    const createdEntrant = service.catalog.entrants.find((entrant) => entrant.id === importedEntrantId);
    const createdLedger = vi.mocked(seededPersistence.save).mock.calls.at(-1)?.[0] as EventCatalogLedger;
    expect(createdEntrant).toEqual(expect.objectContaining({
      id: importedEntrantId,
      identifiers: expect.arrayContaining([
        expect.objectContaining({ racePlate: '15' }),
      ]),
    }));
    expect(createdLedger.mutations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entrant: expect.objectContaining({
          id: importedEntrantId,
          identifiers: expect.arrayContaining([
            expect.objectContaining({ racePlate: '15' }),
          ]),
        }),
        type: 'entrant-created',
      }),
    ]));

    await service.syncEventScaffold(SEED_EVENT_ID, [importedCategory], [createParticipant('16')]);

    const updatedEntrant = service.catalog.entrants.find((entrant) => entrant.id === importedEntrantId);
    const updatedLedger = vi.mocked(seededPersistence.save).mock.calls.at(-1)?.[0] as EventCatalogLedger;
    expect(updatedEntrant).toEqual(expect.objectContaining({
      id: importedEntrantId,
      identifiers: expect.arrayContaining([
        expect.objectContaining({ racePlate: '16' }),
      ]),
    }));
    expect(updatedEntrant?.identifiers).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ racePlate: '15' }),
    ]));
    expect(updatedLedger.mutations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        changes: expect.objectContaining({
          identifiers: expect.arrayContaining([
            expect.objectContaining({ racePlate: '16' }),
          ]),
        }),
        entrantId: importedEntrantId,
        type: 'entrant-updated',
      }),
    ]));
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
    const onPersistedLedger = vi.fn(async (_ledger: EventCatalogLedger) => undefined);
    const service = await EventCatalogService.create(seededPersistence, { onPersistedLedger });
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
    vi.mocked(seededPersistence.save).mockClear();
    onPersistedLedger.mockClear();

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
    expect(seededPersistence.save).toHaveBeenCalledTimes(1);
    expect(onPersistedLedger).toHaveBeenCalledTimes(1);

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

  it('does not replay stale scaffold deletions for entrants and categories that still exist in refreshed import data', async () => {
    const seededPersistence = createPersistence(createSeedEventCatalogLedger());
    const service = await EventCatalogService.create(seededPersistence);
    const importedEventId = createEventId('reload-stale-delete-event');
    const importedSessionId = createSessionId('reload-stale-delete-session');
    const importedCategoryId = createCategoryId('reload-stale-delete-category');
    const importedEntrantId = createEventEntrantId('reload-stale-delete-entrant');
    const importedParticipantId = createEventParticipantId('reload-stale-delete-participant');

    await service.importApicalRaceState({
      eventDate: '2026-06-07T01:30:00.000Z',
      eventId: importedEventId,
      eventName: 'Reload Stale Delete Round',
      raceState: {
        categories: [{ code: 'A', description: '', id: 'reload-stale-delete-category', name: 'A' }],
        participants: [
          {
            categoryId: 'reload-stale-delete-category',
            currentResult: undefined,
            entrantId: 'reload-stale-delete-entrant',
            firstname: 'Still',
            id: 'reload-stale-delete-participant',
            identifiers: [{ fromTime: undefined, racePlate: '404', toTime: undefined } as ParticipateRacePlate],
            lastRecordTime: null,
            resultDuration: null,
            surname: 'Imported',
          },
        ],
        records: [],
        teams: [],
      },
      sessionId: importedSessionId,
      timeZone: 'Australia/Sydney',
    });

    const importedLedger = vi.mocked(seededPersistence.save).mock.calls.at(-1)?.[0] as EventCatalogLedger;
    const ledgerWithStaleDeletes: EventCatalogLedger = {
      ...importedLedger,
      mutations: [
        ...importedLedger.mutations,
        {
          categoryId: importedCategoryId,
          id: createId('mutation-stale-imported-category-delete'),
          timestamp: '2026-06-07T02:00:00.000Z',
          type: 'category-deleted',
        },
        {
          entrantId: importedEntrantId,
          id: createId('mutation-stale-imported-entrant-delete'),
          timestamp: '2026-06-07T02:01:00.000Z',
          type: 'entrant-deleted',
        },
      ],
    };
    const reloadedPersistence = createPersistence(ledgerWithStaleDeletes);
    const reloadedService = await EventCatalogService.create(reloadedPersistence);

    expect(getEntrantsForEvent(reloadedService.catalog, importedEventId).find((entrant) => entrant.id === importedEntrantId)).toBeUndefined();

    await reloadedService.reloadImportedRaceState(importedEventId, importedSessionId, {
      categories: [{ code: 'A', description: '', id: 'reload-stale-delete-category', name: 'A refreshed' }],
      participants: [
        {
          categoryId: 'reload-stale-delete-category',
          currentResult: undefined,
          entrantId: 'reload-stale-delete-entrant',
          firstname: 'Still',
          id: 'reload-stale-delete-participant',
          identifiers: [{ fromTime: undefined, racePlate: '404', toTime: undefined } as ParticipateRacePlate],
          lastRecordTime: null,
          resultDuration: null,
          surname: 'Imported',
        },
      ],
      records: [],
      teams: [],
    });

    const savedLedger = vi.mocked(reloadedPersistence.save).mock.calls.at(-1)?.[0] as EventCatalogLedger;
    const refreshedImportIndex = savedLedger.mutations.findLastIndex((mutation) => mutation.type === 'race-state-imported');
    const replayedDeletion = savedLedger.mutations.slice(refreshedImportIndex + 1).find((mutation) => {
      return (mutation.type === 'entrant-deleted' && mutation.entrantId === importedEntrantId) ||
        (mutation.type === 'category-deleted' && mutation.categoryId === importedCategoryId);
    });
    const entrant = getEntrantsForEvent(reloadedService.catalog, importedEventId).find((item) => item.id === importedEntrantId);
    const session = getSessionsForEvent(reloadedService.catalog, importedEventId).find((item) => item.id === importedSessionId);
    const importedRaceState = reloadedService.getImportedRaceState(importedEventId, importedSessionId);

    expect(replayedDeletion).toBeUndefined();
    expect(entrant).toEqual(expect.objectContaining({
      categoryId: importedCategoryId,
      id: importedEntrantId,
      memberParticipantIds: [importedParticipantId],
    }));
    expect(session?.categoryIds).toContain(importedCategoryId);
    expect(importedRaceState?.participants?.[0]).toEqual(expect.objectContaining({
      entrantId: importedEntrantId,
      id: importedParticipantId,
    }));
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
