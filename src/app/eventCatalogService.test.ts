import {
  applyEventCatalogLedger,
  createDefaultEventCatalogLedger,
  createSeedEventCatalogLedger,
  getCategoriesForEvent,
  getEntrantsForEvent,
  getSessionsForEvent,
} from './eventCatalog.js';

import type { EventParticipant } from '../model/eventparticipant.js';
import { createCategoryId, createEventEntrantId, createEventId, createEventParticipantId, createSessionId, rewriteImportedObjectIds } from '../model/ids.js';
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
    expect(service.catalog.activeEventId).toBe(createEventId('event-2026-racesweet-round-1'));
    expect(service.catalog.entrants.length).toBeGreaterThan(0);
    expect(emptyPersistence.save).toHaveBeenCalledTimes(1);
  });

  it('persists and publishes the seeded ledger during create when the loaded ledger is empty', async () => {
    const emptyPersistence = createPersistence();
    const onPersistedLedger = vi.fn(async () => undefined);

    const service = await EventCatalogService.create(emptyPersistence, { onPersistedLedger });

    const savedLedger = vi.mocked(emptyPersistence.save).mock.calls[0]?.[0];
    const expectedSeedLedger = rewriteImportedObjectIds(createSeedEventCatalogLedger()).value;
    expect(emptyPersistence.load).toHaveBeenCalledOnce();
    expect(emptyPersistence.save).toHaveBeenCalledOnce();
    expect(savedLedger).toEqual(expectedSeedLedger);
    expect(onPersistedLedger).toHaveBeenCalledWith(savedLedger);
    expect(service.catalog).toEqual(applyEventCatalogLedger(savedLedger!));
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

    await service.deleteEvent('event-2026-test-day');

    expect(service.catalog.events.find((event) => event.id === 'event-2026-test-day')).toBeUndefined();
    expect(service.catalog.deletedEventIds).toContain('event-2026-test-day');
    expect(service.catalog.activeEventId).toBe('event-2026-racesweet-round-1');
    expect(getSessionsForEvent(service.catalog, 'event-2026-test-day')).toEqual([]);
    expect(getCategoriesForEvent(service.catalog, 'event-2026-test-day')).toEqual([]);
    expect(getEntrantsForEvent(service.catalog, 'event-2026-test-day')).toEqual([]);
    expect(service.catalog.sessions.find((session) => session.id === 'event-2026-test-day-session')).toBeDefined();
    expect(service.catalog.categories.find((category) => category.id === 'event-2026-test-day-category')).toBeDefined();
    expect(service.catalog.entrants.find((entrant) => entrant.id === 'event-2026-test-day-entrant')).toBeDefined();
    expect(seededPersistence.save).toHaveBeenCalledOnce();
    expect(onPersistedLedger).toHaveBeenCalledWith(expect.objectContaining({
      mutations: expect.arrayContaining([
        expect.objectContaining({
          eventId: 'event-2026-test-day',
          type: 'event-deleted',
        }),
      ]),
    }));
  });

  it('activates a session and its event through the ledger, persistence, and upstream callback flow', async () => {
    const seededPersistence = createPersistence(createSeedEventCatalogLedger());
    const onPersistedLedger = vi.fn(async () => undefined);
    const service = await EventCatalogService.create(seededPersistence, { onPersistedLedger });

    await service.activateSession('event-2026-racesweet-round-1', 'session-1-race');

    const session = service.catalog.sessions.find((item) => item.id === 'session-1-race');
    expect(service.catalog.activeEventId).toBe('event-2026-racesweet-round-1');
    expect(service.catalog.activeSessionId).toBe('session-1-race');
    expect(session?.status).toBe('live');
    expect(seededPersistence.save).toHaveBeenCalledOnce();
    expect(onPersistedLedger).toHaveBeenCalledWith(expect.objectContaining({
      mutations: expect.arrayContaining([
        expect.objectContaining({
          eventId: 'event-2026-racesweet-round-1',
          sessionId: 'session-1-race',
          type: 'session-activated',
        }),
        expect.objectContaining({
          changes: { status: 'live' },
          sessionId: 'session-1-race',
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

    await service.moveSessionToEvent('session-1-qualifying', 'event-2026-test-day');

    const movedSession = service.catalog.sessions.find((session) => session.id === 'session-1-qualifying');
    const sourceEvent = service.catalog.events.find((event) => event.id === 'event-2026-racesweet-round-1');
    const targetEvent = service.catalog.events.find((event) => event.id === 'event-2026-test-day');

    expect(movedSession?.eventId).toBe('event-2026-test-day');
    expect(sourceEvent?.sessionIds).not.toContain('session-1-qualifying');
    expect(targetEvent?.sessionIds).toContain('session-1-qualifying');
    expect(getSessionsForEvent(service.catalog, 'event-2026-racesweet-round-1').map((session) => session.id)).not.toContain('session-1-qualifying');
    expect(getSessionsForEvent(service.catalog, 'event-2026-test-day').map((session) => session.id)).toContain('session-1-qualifying');
    expect(seededPersistence.save).toHaveBeenCalledOnce();
    expect(onPersistedLedger).toHaveBeenCalledWith(expect.objectContaining({
      mutations: expect.arrayContaining([
        expect.objectContaining({
          changes: { eventId: 'event-2026-test-day' },
          sessionId: 'session-1-qualifying',
          type: 'session-updated',
        }),
        expect.objectContaining({
          changes: { sessionIds: ['session-1-qualifying'] },
          eventId: 'event-2026-test-day',
          type: 'event-updated',
        }),
        expect.objectContaining({
          changes: { sessionIds: ['session-1-practice', 'session-1-race'] },
          eventId: 'event-2026-racesweet-round-1',
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

    await service.createEntrant('event-2026-racesweet-round-1', 'team');

    const createdTeam = service.catalog.entrants.find((entrant) => entrant.name === 'New Team');
    expect(createdTeam).toEqual(expect.objectContaining({
      categoryId: 'event-2026-racesweet-round-1-category-premier',
      categoryIds: ['event-2026-racesweet-round-1-category-premier'],
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

    await service.updateEvent('event-2026-racesweet-round-1', {
      format: 'track-day',
      name: 'RaceSweet Open Track Day',
      timeZone: 'Australia/Brisbane',
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
    expect(service.getImportedRaceStateMetadata(
      '7b83ad1e-54ba-5f00-9712-1c82d3178640',
      importedSessionId
    )).toEqual(expect.objectContaining({
      apicalDataFilePath: '../../src/generated/apical-excel-cache/apical-event-1001.xlsx',
      raceState: expect.objectContaining({
        categories: expect.arrayContaining([expect.objectContaining({ id: importedCategoryId })]),
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
          sessionId: importedSessionId,
          type: 'race-state-imported',
        }),
      ]),
    }));
    expect(seededPersistence.save).toHaveBeenCalledTimes(2);
  });

  it('supports entrant detail edits for rider fields and category updates', async () => {
    const seededPersistence = createPersistence(createSeedEventCatalogLedger());
    const service = await EventCatalogService.create(seededPersistence);

    await service.updateEntrant('event-2026-racesweet-round-1-entrant-101', {
      categoryId: 'event-2026-racesweet-round-1-category-clubman',
      categoryIds: ['event-2026-racesweet-round-1-category-clubman'],
      dateOfBirth: '1999-04-18',
      firstName: 'Jordan',
      gender: 'female',
      lastName: 'Smith',
      name: 'Jordan Smith',
    });

    const entrant = service.catalog.entrants.find((item) => item.id === 'event-2026-racesweet-round-1-entrant-101');
    expect(entrant).toEqual(expect.objectContaining({
      categoryId: 'event-2026-racesweet-round-1-category-clubman',
      categoryIds: ['event-2026-racesweet-round-1-category-clubman'],
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

    await service.updateEntrant('event-2026-racesweet-round-1-entrant-101', {
      categoryId: 'event-2026-racesweet-round-1-category-clubman',
      teamEntrantId: 'team-linked',
    });

    let entrant = service.catalog.entrants.find((item) => item.id === 'event-2026-racesweet-round-1-entrant-101');
    expect(entrant).toEqual(expect.objectContaining({
      categoryId: 'event-2026-racesweet-round-1-category-clubman',
      categoryIds: ['event-2026-racesweet-round-1-category-clubman'],
      teamEntrantId: 'team-linked',
    }));

    await service.deleteCategory('event-2026-racesweet-round-1', 'event-2026-racesweet-round-1-category-clubman');

    entrant = service.catalog.entrants.find((item) => item.id === 'event-2026-racesweet-round-1-entrant-101');
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

    await service.syncEventScaffold('event-2026-racesweet-round-1', [], participants, [
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

    await service.syncEventScaffold('event-2026-racesweet-round-1', [], participants);

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
    expect(state.activeSessionId).toBe('session-1-practice');
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
            categoryId: 'event-2026-racesweet-round-1-category-clubman',
            dateOfBirth: '2001-09-21',
            firstName: 'Taylor',
            gender: 'male',
            lastName: 'Rider',
          },
          entrantId: 'event-2026-racesweet-round-1-entrant-101',
          id: 'mutation-entrant-details',
          timestamp: '2026-05-30T11:22:00.000Z',
          type: 'entrant-updated' as const,
        },
      ],
    });

    const entrant = state.entrants.find((item) => item.id === 'event-2026-racesweet-round-1-entrant-101');
    expect(entrant).toEqual(expect.objectContaining({
      categoryId: 'event-2026-racesweet-round-1-category-clubman',
      dateOfBirth: '2001-09-21',
      firstName: 'Taylor',
      gender: 'male',
      lastName: 'Rider',
    }));
  });
});
