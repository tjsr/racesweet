import { applyPulledRaceStateToSession, getCategoriesToAdd, getMinimumLapTimeMillisecondsForSession, getSessionKindForSession } from '../service/sourceApplication.js';

import { createGreenFlagEvent } from '../controllers/flag.js';
import type { EventCategory } from '../model/eventcategory.js';
import type { EventParticipant } from '../model/eventparticipant.js';
import type { EventTeam } from '../model/eventteam.js';
import { Session } from '../model/racestate.js';
import { RECORD_TX_CROSSING, type ParticipantPassingRecord, type TimeRecord } from '../model/timerecord.js';
import { createCategoryId, createEventEntrantId, createEventId, createEventParticipantId, createSessionId, createTimeRecordId, createTimeRecordSourceId } from '../model/ids.js';
import type { EventCatalogState } from '../catalog/eventCatalog.js';

const EXISTING_CATEGORY_ID = createCategoryId('cat-existing');
const NEW_CATEGORY_ID = createCategoryId('cat-new');

const existingCategories: EventCategory[] = [
  {
    code: 'EX',
    id: EXISTING_CATEGORY_ID,
    name: 'Existing Category',
  },
];

const incomingCategoriesWithDuplicates: EventCategory[] = [
  {
    code: 'EX',
    id: 'cat-existing',
    name: 'Existing Category',
  },
  {
    code: 'NEW',
    id: 'cat-new',
    name: 'New Category',
  },
  {
    code: 'NEW-2',
    id: 'cat-new',
    name: 'New Category Duplicate Payload Row',
  },
];

const incomingCategoriesWithSeriesDuplicate: EventCategory[] = [
  {
    code: 'EX',
    id: 'cat-existing-v2',
    name: 'Existing Category',
  },
];

describe('sourceApplication', () => {
  it('filters out existing categories and deduplicates incoming category IDs', () => {
    const toAdd = getCategoriesToAdd(existingCategories, incomingCategoriesWithDuplicates);

    expect(toAdd).toHaveLength(1);
    expect(toAdd[0]?.id).toBe('cat-new');
  });

  it('filters out incoming categories that duplicate an existing category series by code and name', () => {
    const toAdd = getCategoriesToAdd(existingCategories, incomingCategoriesWithSeriesDuplicate);
    expect(toAdd).toHaveLength(0);
  });

  it('applies pulled race state without duplicate category insert attempts', async () => {
    const addCategories = vi.fn(async (_categories: EventCategory[]) => null);
    const addParticipants = vi.fn((_participants: EventParticipant[]) => undefined);
    const addRecords = vi.fn(async (_records: TimeRecord[]) => undefined);
    const addTeams = vi.fn((_teams: EventTeam[]) => undefined);
    const beginBulkProcess = vi.fn(async () => true);
    const endBulkProcess = vi.fn(async () => undefined);

    await applyPulledRaceStateToSession(
      {
        addCategories,
        addParticipants,
        addRecords,
        addTeams,
        beginBulkProcess,
        categories: existingCategories,
        endBulkProcess,
        records: [],
      },
      {
        categories: incomingCategoriesWithDuplicates,
        participants: [],
        records: [],
      }
    );

    expect(addCategories).toHaveBeenCalledTimes(1);
    expect(addCategories).toHaveBeenCalledWith([
      {
        code: 'NEW-2',
        id: NEW_CATEGORY_ID,
        name: 'New Category Duplicate Payload Row',
      },
    ]);
    expect(addParticipants).toHaveBeenCalledTimes(1);
    expect(addTeams).toHaveBeenCalledTimes(1);
    expect(addTeams).toHaveBeenCalledWith([]);
    expect(addRecords).toHaveBeenCalledTimes(1);
    expect(beginBulkProcess).toHaveBeenCalledTimes(1);
    expect(endBulkProcess).toHaveBeenCalledTimes(1);
  });

  it('applies the session minimum lap time override when loading pulled race state', async () => {
    const addCategories = vi.fn(async (_categories: EventCategory[]) => null);
    const addParticipants = vi.fn((_participants: EventParticipant[]) => undefined);
    const addRecords = vi.fn(async (_records: TimeRecord[]) => undefined);
    const beginBulkProcess = vi.fn(async () => true);
    const endBulkProcess = vi.fn(async () => undefined);
    const setFinishLineNumbers = vi.fn();
    const setMinimumLapTimeMilliseconds = vi.fn();
    const setSessionKind = vi.fn();
    const eventId = createEventId('11111111-1111-4111-8111-111111111111');
    const sessionId = createSessionId('22222222-2222-4222-8222-222222222222');
    const catalog: EventCatalogState = {
      activeEventId: eventId,
      activeSessionId: sessionId,
      categories: [],
      deletedEventIds: [],
      entrants: [],
      events: [{
        categoryIds: [],
        date: '2026-07-07',
        entrantIds: [],
        format: 'race-weekend',
        id: eventId,
        minimumLapTimeMilliseconds: 60000,
        name: 'Configured Event',
        sessionIds: [sessionId],
      }],
      sessions: [{
        categoryIds: [],
        eventId,
        id: sessionId,
        kind: 'race',
        minimumLapTimeMilliseconds: 45000,
        name: 'Configured Session',
        scheduledStart: '2026-07-07T10:00:00.000Z',
        status: 'scheduled',
      }],
    };

    await applyPulledRaceStateToSession(
      {
        addCategories,
        addParticipants,
        addRecords,
        beginBulkProcess,
        categories: existingCategories,
        endBulkProcess,
        records: [],
        setFinishLineNumbers,
        setMinimumLapTimeMilliseconds,
        setSessionKind,
      },
      {
        categories: [],
        participants: [],
        records: [],
      },
      {
        catalog,
        eventId,
        finishLineNumbers: [2, 7],
        sessionId,
      }
    );

    expect(getMinimumLapTimeMillisecondsForSession(catalog, eventId, sessionId)).toBe(45000);
    expect(getSessionKindForSession(catalog, sessionId)).toBe('race');
    expect(setFinishLineNumbers).toHaveBeenCalledWith([2, 7]);
    expect(setMinimumLapTimeMilliseconds).toHaveBeenCalledWith(45000);
    expect(setSessionKind).toHaveBeenCalledWith('race');
    expect(endBulkProcess).toHaveBeenCalledTimes(1);
  });

  it('uses short post-green crossings as lap start references for imported qualifying sessions', async () => {
    const eventId = createEventId('qualifying-short-reference-event');
    const sessionId = createSessionId('qualifying-short-reference-session');
    const categoryId = createCategoryId('qualifying-short-reference-category');
    const entrantId = createEventEntrantId('qualifying-short-reference-entrant');
    const participantId = createEventParticipantId('qualifying-short-reference-participant');
    const sourceId = createTimeRecordSourceId('qualifying-short-reference-source');
    const participant: EventParticipant = {
      categoryId,
      currentResult: undefined,
      entrantId,
      firstname: 'Qualifying',
      id: participantId,
      identifiers: [
        { fromTime: undefined, racePlate: '82', toTime: undefined },
        { fromTime: undefined, toTime: undefined, txNo: 820001 },
      ] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Driver',
    };
    const session = new Session({
      categories: [],
      participants: [],
      records: [],
      teams: [],
    });

    await applyPulledRaceStateToSession(
      session,
      {
        categories: [{ code: 'Q', id: categoryId, name: 'Qualifying Category' }],
        participants: [participant],
        records: [
          createGreenFlagEvent({
            categoryIds: [categoryId],
            eventId,
            id: createTimeRecordId('qualifying-short-reference-green'),
            indicatesRaceStart: true,
            sequence: 1,
            sessionId,
            source: sourceId,
            time: new Date('2026-05-29T10:00:00.000Z'),
          }),
          {
            chipCode: 820001,
            eventId,
            id: createTimeRecordId('qualifying-short-reference-under-minimum'),
            plateNumber: '82',
            recordType: RECORD_TX_CROSSING,
            sequence: 2,
            sessionId,
            source: sourceId,
            time: new Date('2026-05-29T10:00:30.000Z'),
          } as ParticipantPassingRecord,
          {
            chipCode: 820001,
            eventId,
            id: createTimeRecordId('qualifying-short-reference-valid'),
            plateNumber: '82',
            recordType: RECORD_TX_CROSSING,
            sequence: 3,
            sessionId,
            source: sourceId,
            time: new Date('2026-05-29T10:01:30.000Z'),
          } as ParticipantPassingRecord,
        ],
      },
      {
        catalog: {
          activeEventId: eventId,
          activeSessionId: sessionId,
          categories: [],
          deletedEventIds: [],
          entrants: [{
            categoryId,
            categoryIds: [categoryId],
            entrantType: 'rider',
            eventId,
            firstName: 'Qualifying',
            id: entrantId,
            identifiers: participant.identifiers,
            lastName: 'Driver',
            memberParticipantIds: [participantId],
            name: 'Qualifying Driver',
            sessionIds: [sessionId],
          }],
          events: [{
            categoryIds: [categoryId],
            date: '2026-05-29',
            entrantIds: [entrantId],
            format: 'race-weekend',
            id: eventId,
            minimumLapTimeMilliseconds: 60000,
            name: 'Qualifying Event',
            sessionIds: [sessionId],
          }],
          sessions: [{
            categoryIds: [categoryId],
            eventId,
            id: sessionId,
            kind: 'qualifying',
            minimumLapTimeMilliseconds: null,
            name: 'Qualifying Session',
            scheduledStart: '2026-05-29T10:00:00.000Z',
            status: 'completed',
          }],
        },
        eventId,
        sessionId,
      }
    );

    const laps = session.getParticipantLaps(participantId);
    expect(laps?.map((lap) => ({
      id: lap.id,
      isExcluded: lap.isExcluded,
      isValid: lap.isValid,
      lapTime: lap.lapTime,
      startingLapRecordId: lap.startingLapRecordId,
    }))).toEqual([
      {
        id: createTimeRecordId('qualifying-short-reference-under-minimum'),
        isExcluded: true,
        isValid: false,
        lapTime: 30000,
        startingLapRecordId: createTimeRecordId('qualifying-short-reference-green'),
      },
      {
        id: createTimeRecordId('qualifying-short-reference-valid'),
        isExcluded: false,
        isValid: true,
        lapTime: 60000,
        startingLapRecordId: createTimeRecordId('qualifying-short-reference-under-minimum'),
      },
    ]);
  });

  it('uses the configured minimum lap time when calculating laps for imported session records', async () => {
    const eventId = createEventId('33333333-3333-4333-8333-333333333333');
    const sessionId = createSessionId('44444444-4444-4444-8444-444444444444');
    const categoryId = createCategoryId('55555555-5555-4555-8555-555555555555');
    const entrantId = createEventEntrantId('66666666-6666-4666-8666-666666666666');
    const participantId = createEventParticipantId('77777777-7777-4777-8777-777777777777');
    const sourceId = createTimeRecordSourceId('88888888-8888-4888-8888-888888888888');
    const participant: EventParticipant = {
      categoryId,
      currentResult: undefined,
      entrantId,
      firstname: 'MR-SCATS',
      id: participantId,
      identifiers: [
        { fromTime: undefined, racePlate: '42', toTime: undefined },
        { fromTime: undefined, toTime: undefined, txNo: 420001 },
      ] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Rider',
    };
    const session = new Session({
      categories: [],
      participants: [],
      records: [],
      teams: [],
    });

    await applyPulledRaceStateToSession(
      session,
      {
        categories: [{ code: 'MSC', id: categoryId, name: 'MR-SCATS Category' }],
        participants: [participant],
        records: [
          createGreenFlagEvent({
            categoryIds: [categoryId],
            eventId,
            id: createTimeRecordId('99999999-9999-4999-8999-999999999999'),
            indicatesRaceStart: true,
            sequence: 1,
            sessionId,
            source: sourceId,
            time: new Date('2026-05-29T10:00:00.000Z'),
          }),
          {
            chipCode: 420001,
            eventId,
            id: createTimeRecordId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
            originRecordNumber: 1,
            plateNumber: '42',
            recordType: RECORD_TX_CROSSING,
            sequence: 2,
            sessionId,
            source: sourceId,
            time: new Date('2026-05-29T10:01:30.000Z'),
          } as ParticipantPassingRecord,
          {
            chipCode: 420001,
            eventId,
            id: createTimeRecordId('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
            originRecordNumber: 2,
            plateNumber: '42',
            recordType: RECORD_TX_CROSSING,
            sequence: 3,
            sessionId,
            source: sourceId,
            time: new Date('2026-05-29T10:03:05.000Z'),
          } as ParticipantPassingRecord,
        ],
      },
      {
        catalog: {
          activeEventId: eventId,
          activeSessionId: sessionId,
          categories: [],
          deletedEventIds: [],
          entrants: [{
            categoryId,
            categoryIds: [categoryId],
            entrantType: 'rider',
            eventId,
            firstName: 'MR-SCATS',
            id: entrantId,
            identifiers: participant.identifiers,
            lastName: 'Rider',
            memberParticipantIds: [participantId],
            name: 'MR-SCATS Rider',
            sessionIds: [sessionId],
          }],
          events: [{
            categoryIds: [categoryId],
            date: '2026-05-29',
            entrantIds: [entrantId],
            format: 'race-weekend',
            id: eventId,
            minimumLapTimeMilliseconds: 60000,
            name: 'MR-SCATS Imported Round',
            sessionIds: [sessionId],
          }],
          sessions: [{
            categoryIds: [categoryId],
            eventId,
            id: sessionId,
            kind: 'race',
            minimumLapTimeMilliseconds: null,
            name: 'MR-SCATS Race',
            scheduledStart: '2026-05-29T10:00:00.000Z',
            status: 'completed',
          }],
        },
        eventId,
        sessionId,
      }
    );

    expect(session.getParticipantLaps(participantId)?.map((lap) => lap.lapTime)).toEqual([90000, 95000]);
  });

  it('ends the session bulk process when a source application step fails', async () => {
    const addCategories = vi.fn(async (_categories: EventCategory[]) => null);
    const addParticipants = vi.fn((_participants: EventParticipant[]) => undefined);
    const addRecords = vi.fn(async (_records: TimeRecord[]) => {
      throw new Error('record import failed');
    });
    const beginBulkProcess = vi.fn(async () => true);
    const endBulkProcess = vi.fn(async () => undefined);

    await expect(applyPulledRaceStateToSession(
      {
        addCategories,
        addParticipants,
        addRecords,
        beginBulkProcess,
        categories: existingCategories,
        endBulkProcess,
        records: [],
      },
      {
        categories: [],
        participants: [],
        records: [{ id: createTimeRecordId('bulk-error-record'), recordType: 16, source: createTimeRecordSourceId('bulk-error-source') } as TimeRecord],
      }
    )).rejects.toThrow('record import failed');

    expect(beginBulkProcess).toHaveBeenCalledTimes(1);
    expect(endBulkProcess).toHaveBeenCalledTimes(1);
  });

  it('applies pulled teams into the target session state sink', async () => {
    const addCategories = vi.fn(async (_categories: EventCategory[]) => null);
    const addParticipants = vi.fn((_participants: EventParticipant[]) => undefined);
    const addRecords = vi.fn(async (_records: TimeRecord[]) => undefined);
    const addTeams = vi.fn((_teams: EventTeam[]) => undefined);
    const teamId = createEventEntrantId('team-relay');
    const participantId = createEventParticipantId('team-relay-member');
    const team: EventTeam = {
      categoryId: EXISTING_CATEGORY_ID,
      description: '',
      id: teamId,
      members: [participantId],
      name: 'Rocket Squad',
    };

    await applyPulledRaceStateToSession(
      {
        addCategories,
        addParticipants,
        addRecords,
        addTeams,
        categories: existingCategories,
        records: [],
      },
      {
        categories: [],
        participants: [
          {
            categoryId: EXISTING_CATEGORY_ID,
            currentResult: undefined,
            entrantId: teamId,
            firstname: 'Pat',
            id: participantId,
            identifiers: [],
            lastRecordTime: null,
            resultDuration: null,
            surname: 'Rider',
          },
        ],
        records: [],
        teams: [team],
      }
    );

    expect(addTeams).toHaveBeenCalledWith([team]);
  });

  it('continues participant and record merge when category add collides with existing data', async () => {
    const addCategories = vi.fn(async () => {
      throw new Error('Category cat-new already exists.');
    });
    const addParticipants = vi.fn((_participants: EventParticipant[]) => undefined);
    const addRecords = vi.fn(async (_records: TimeRecord[]) => undefined);

    await expect(
      applyPulledRaceStateToSession(
        {
          addCategories,
        addParticipants,
        addRecords,
        categories: existingCategories,
        records: [],
      },
        {
          categories: incomingCategoriesWithDuplicates,
          participants: [],
          records: [],
        }
      )
    ).resolves.toBeUndefined();

    expect(addParticipants).toHaveBeenCalledTimes(1);
    expect(addRecords).toHaveBeenCalledTimes(1);
  });

  it('does not add a synthetic start flag before pulled records when the target session has no flags', async () => {
    const addCategories = vi.fn(async (_categories: EventCategory[]) => null);
    const addParticipants = vi.fn((_participants: EventParticipant[]) => undefined);
    const addRecords = vi.fn(async (_records: TimeRecord[]) => undefined);
    const crossing = {
      chipCode: 200306,
      eventId: createEventId('event-a'),
      id: 'crossing-1',
      recordType: 2,
      source: 'test-source',
      time: new Date('2026-06-07T00:01:30.000Z'),
    } as TimeRecord;

    await applyPulledRaceStateToSession(
      {
        addCategories,
        addParticipants,
        addRecords,
        categories: existingCategories,
        records: [],
      },
      {
        categories: [],
        eventStartTime: new Date('2026-06-07T00:00:00.000Z'),
        participants: [],
        records: [crossing],
      }
    );

    const records = addRecords.mock.calls[0]?.[0] || [];
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual(expect.objectContaining({
      eventId: createEventId('event-a'),
      id: createTimeRecordId('crossing-1'),
      source: createTimeRecordSourceId('test-source'),
    }));
  });

  it('adds a visible missing-category placeholder when participant category parents are unknown', async () => {
    const addCategories = vi.fn(async (_categories: EventCategory[]) => null);
    const addParticipants = vi.fn((_participants: EventParticipant[]) => undefined);
    const addRecords = vi.fn(async (_records: TimeRecord[]) => undefined);

    await expect(applyPulledRaceStateToSession(
      {
        addCategories,
        addParticipants,
        addRecords,
        categories: existingCategories,
        records: [],
      },
      {
        categories: [],
        participants: [
          {
            categoryId: 'missing-category',
            currentResult: undefined,
            entrantId: 'participant-a',
            firstname: 'Pat',
            id: 'participant-a',
            identifiers: [],
            lastRecordTime: null,
            resultDuration: null,
            surname: 'Rider',
          },
        ],
        records: [],
      }
    )).resolves.toBeUndefined();

    expect(addCategories).toHaveBeenCalledWith([
      expect.objectContaining({
        code: 'MISSING',
        description: expect.stringContaining('was not found in the reloaded source data'),
        excludeFromResults: true,
        id: createCategoryId('missing-category'),
        name: `Missing category ${createCategoryId('missing-category')}`,
      }),
    ]);
    expect(addParticipants).toHaveBeenCalledWith([
      expect.objectContaining({
        categoryId: createCategoryId('missing-category'),
        id: createEventParticipantId('participant-a'),
      }),
    ]);
    expect(addRecords).toHaveBeenCalled();
  });

  it('adds catalog event and entrant details to missing entrant validation errors when the entrant exists elsewhere', async () => {
    const addCategories = vi.fn(async (_categories: EventCategory[]) => null);
    const addParticipants = vi.fn((_participants: EventParticipant[]) => undefined);
    const addRecords = vi.fn(async (_records: TimeRecord[]) => undefined);
    const eventId = createEventId('missing-entrant-search-event');
    const previousEventId = createEventId('missing-entrant-search-previous-event');
    const sessionId = createSessionId('missing-entrant-search-session');
    const entrantId = createEventEntrantId('missing-entrant-search-entrant');
    const participantId = createEventParticipantId('missing-entrant-search-participant');
    const catalog: EventCatalogState = {
      activeEventId: eventId,
      activeSessionId: undefined,
      categories: [],
      deletedEventIds: [],
      entrants: [
        {
          categoryId: EXISTING_CATEGORY_ID,
          categoryIds: [EXISTING_CATEGORY_ID],
          entrantType: 'team',
          eventId: previousEventId,
          id: entrantId,
          memberParticipantIds: [],
          name: 'Recovered Team',
        },
      ],
      events: [
        {
          categoryIds: [],
          date: '2026-01-01',
          entrantIds: [],
          format: 'race-weekend',
          id: eventId,
          name: 'Current Event',
          sessionIds: [sessionId],
        },
        {
          categoryIds: [EXISTING_CATEGORY_ID],
          date: '2025-12-01',
          entrantIds: [entrantId],
          format: 'race-weekend',
          id: previousEventId,
          name: 'Recovered Event',
          sessionIds: [],
        },
      ],
      sessions: [
        {
          categoryIds: [EXISTING_CATEGORY_ID],
          eventId,
          id: sessionId,
          kind: 'race',
          name: 'Recovered Session',
          scheduledStart: '2026-01-01T10:00:00.000Z',
          status: 'completed',
        },
      ],
    };

    await expect(applyPulledRaceStateToSession(
      {
        addCategories,
        addParticipants,
        addRecords,
        categories: existingCategories,
        records: [],
      },
      {
        categories: [],
        participants: [
          {
            categoryId: EXISTING_CATEGORY_ID,
            currentResult: undefined,
            entrantId,
            firstname: 'Pat',
            id: participantId,
            identifiers: [],
            lastRecordTime: null,
            resultDuration: null,
            surname: 'Rider',
          },
        ],
        records: [],
      },
      { catalog, eventId, sessionId }
    )).rejects.toThrow(`Pulled race state contains invalid IDs or parent relationships for event "Current Event" (${eventId}), session "Recovered Session" (${sessionId}):`);
    await expect(applyPulledRaceStateToSession(
      {
        addCategories,
        addParticipants,
        addRecords,
        categories: existingCategories,
        records: [],
      },
      {
        categories: [],
        participants: [
          {
            categoryId: EXISTING_CATEGORY_ID,
            currentResult: undefined,
            entrantId,
            firstname: 'Pat',
            id: participantId,
            identifiers: [],
            lastRecordTime: null,
            resultDuration: null,
            surname: 'Rider',
          },
        ],
        records: [],
      },
      { catalog, eventId, sessionId }
    )).rejects.toThrow(`Catalog search: found 1 possible match: Recovered Event (${previousEventId}): team entrant "Recovered Team" (${entrantId}).`);
  });

  it('accepts missing entrant references when the catalog has linked that entrant to the target event', async () => {
    const addCategories = vi.fn(async (_categories: EventCategory[]) => null);
    const addParticipants = vi.fn((_participants: EventParticipant[]) => undefined);
    const addRecords = vi.fn(async (_records: TimeRecord[]) => undefined);
    const eventId = createEventId('linked-entrant-event');
    const sessionId = createSessionId('linked-entrant-session');
    const entrantId = createEventEntrantId('linked-entrant');
    const participantId = createEventParticipantId('linked-entrant-participant');
    const catalog: EventCatalogState = {
      activeEventId: eventId,
      activeSessionId: sessionId,
      categories: [],
      deletedEventIds: [],
      entrants: [
        {
          categoryId: EXISTING_CATEGORY_ID,
          categoryIds: [EXISTING_CATEGORY_ID],
          entrantType: 'team',
          eventId,
          id: entrantId,
          memberParticipantIds: [participantId],
          name: 'Linked Team',
        },
      ],
      events: [
        {
          categoryIds: [EXISTING_CATEGORY_ID],
          date: '2026-01-01',
          entrantIds: [entrantId],
          format: 'race-weekend',
          id: eventId,
          name: 'Linked Event',
          sessionIds: [sessionId],
        },
      ],
      sessions: [
        {
          categoryIds: [EXISTING_CATEGORY_ID],
          eventId,
          id: sessionId,
          kind: 'race',
          name: 'Linked Session',
          scheduledStart: '2026-01-01T10:00:00.000Z',
          status: 'completed',
        },
      ],
    };

    await expect(applyPulledRaceStateToSession(
      {
        addCategories,
        addParticipants,
        addRecords,
        categories: existingCategories,
        records: [],
      },
      {
        categories: [],
        participants: [
          {
            categoryId: EXISTING_CATEGORY_ID,
            currentResult: undefined,
            entrantId,
            firstname: 'Pat',
            id: participantId,
            identifiers: [],
            lastRecordTime: null,
            resultDuration: null,
            surname: 'Rider',
          },
        ],
        records: [],
      },
      { catalog, eventId, sessionId }
    )).resolves.toBeUndefined();
    expect(addParticipants).toHaveBeenCalledWith([expect.objectContaining({ entrantId, id: participantId })]);
  });

  it('reports when a missing entrant cannot be found in any active event catalog', async () => {
    const addCategories = vi.fn(async (_categories: EventCategory[]) => null);
    const addParticipants = vi.fn((_participants: EventParticipant[]) => undefined);
    const addRecords = vi.fn(async (_records: TimeRecord[]) => undefined);
    const eventId = createEventId('missing-entrant-not-found-event');
    const entrantId = createEventEntrantId('missing-entrant-not-found-entrant');
    const participantId = createEventParticipantId('missing-entrant-not-found-participant');
    const catalog: EventCatalogState = {
      activeEventId: eventId,
      activeSessionId: undefined,
      categories: [],
      deletedEventIds: [],
      entrants: [],
      events: [
        {
          categoryIds: [],
          date: '2026-01-01',
          entrantIds: [],
          format: 'race-weekend',
          id: eventId,
          name: 'Current Event',
          sessionIds: [],
        },
      ],
      sessions: [],
    };

    await expect(applyPulledRaceStateToSession(
      {
        addCategories,
        addParticipants,
        addRecords,
        categories: existingCategories,
        records: [],
      },
      {
        categories: [],
        participants: [
          {
            categoryId: EXISTING_CATEGORY_ID,
            currentResult: undefined,
            entrantId,
            firstname: 'Pat',
            id: participantId,
            identifiers: [],
            lastRecordTime: null,
            resultDuration: null,
            surname: 'Rider',
          },
        ],
        records: [],
      },
      { catalog }
    )).rejects.toThrow('Catalog search: entrant ID was not found in any active event.');
  });
});
