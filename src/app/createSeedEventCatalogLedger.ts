import { createCategoryId, createEventEntrantId, createEventId, createEventParticipantId, createMutationId, createSessionId } from '../model/ids.js';
import { EventCatalogLedger } from './eventCatalog';

export const createSeedEventCatalogLedger = (): EventCatalogLedger => {
  return ({
    mutations: [
      {
        event: {
          categoryIds: [createCategoryId('event-2026-racesweet-round-1-category-premier'), createCategoryId('event-2026-racesweet-round-1-category-clubman')],
          date: '2026-06-12',
          entrantIds: [createEventEntrantId('event-2026-racesweet-round-1-entrant-101')],
          format: 'race-weekend',
          id: createEventId('event-2026-racesweet-round-1'),
          name: 'RaceSweet Round 1',
          sessionIds: [createSessionId('session-1-practice'), createSessionId('session-1-qualifying'), createSessionId('session-1-race')],
        },
        id: createMutationId('mutation-event-seed'),
        timestamp: '2026-05-30T00:00:00.000Z',
        type: 'event-created',
      },
      {
        category: {
          code: 'PW',
          description: 'Premier category for the weekend.',
          distanceRule: {
            kind: 'laps',
            value: 12,
          },
          eventId: createEventId('event-2026-racesweet-round-1'),
          id: createCategoryId('event-2026-racesweet-round-1-category-premier'),
          name: 'Premier',
          sessionAssignments: [
            {
              sessionId: createSessionId('session-1-race'),
              startTime: '2026-06-13T14:30:00.000Z',
            },
          ],
          teamRules: {
            maxRiderAge: 60,
            maxTeamSize: 2,
            minRiderAge: 16,
            teamCompositionRules: [
              {
                gender: 'female',
                max: 2,
                min: 0,
              },
              {
                gender: 'male',
                max: 2,
                min: 0,
              },
            ],
          },
        },
        id: createMutationId('mutation-category-seed-1'),
        timestamp: '2026-05-30T00:00:30.000Z',
        type: 'category-created',
      },
      {
        category: {
          code: 'CLB',
          description: 'Clubman support category.',
          distanceRule: {
            kind: 'time',
            value: '45',
          },
          eventId: createEventId('event-2026-racesweet-round-1'),
          id: createCategoryId('event-2026-racesweet-round-1-category-clubman'),
          name: 'Clubman',
          sessionAssignments: [
            {
              sessionId: createSessionId('session-1-practice'),
              startTime: '2026-06-12T09:00:00.000Z',
            },
            {
              sessionId: createSessionId('session-1-race'),
              startTime: '2026-06-13T12:00:00.000Z',
            },
          ],
          teamRules: {
            maxRiderAge: 55,
            maxTeamSize: 1,
            minRiderAge: 14,
            teamCompositionRules: [],
          },
        },
        id: createMutationId('mutation-category-seed-2'),
        timestamp: '2026-05-30T00:00:40.000Z',
        type: 'category-created',
      },
      {
        entrant: {
          categoryIds: [createCategoryId('event-2026-racesweet-round-1-category-premier')],
          entrantType: 'rider',
          eventId: createEventId('event-2026-racesweet-round-1'),
          id: createEventEntrantId('event-2026-racesweet-round-1-entrant-101'),
          memberParticipantIds: [createEventParticipantId('101')],
          name: 'Rider 101',
          sessionIds: [createSessionId('session-1-practice'), createSessionId('session-1-qualifying'), createSessionId('session-1-race')],
        },
        id: createMutationId('mutation-entrant-seed-1'),
        timestamp: '2026-05-30T00:00:45.000Z',
        type: 'entrant-created',
      },
      {
        id: createMutationId('mutation-session-seed-1'),
        session: {
          eventId: createEventId('event-2026-racesweet-round-1'),
          id: createSessionId('session-1-practice'),
          kind: 'practice',
          name: 'Friday Practice',
          notes: 'Open practice for all confirmed entrants.',
          scheduledStart: '2026-06-12T09:00:00.000Z',
          status: 'scheduled',
        },
        timestamp: '2026-05-30T00:01:00.000Z',
        type: 'session-created',
      },
      {
        id: createMutationId('mutation-session-seed-2'),
        session: {
          eventId: createEventId('event-2026-racesweet-round-1'),
          id: createSessionId('session-1-qualifying'),
          kind: 'qualifying',
          name: 'Qualifying',
          notes: 'Grid positions are determined from fastest valid lap.',
          scheduledStart: '2026-06-12T13:00:00.000Z',
          status: 'scheduled',
        },
        timestamp: '2026-05-30T00:02:00.000Z',
        type: 'session-created',
      },
      {
        id: createMutationId('mutation-session-seed-3'),
        session: {
          eventId: createEventId('event-2026-racesweet-round-1'),
          id: createSessionId('session-1-race'),
          kind: 'race',
          name: 'Feature Race',
          notes: 'Primary points-paying race session.',
          scheduledStart: '2026-06-13T14:30:00.000Z',
          status: 'scheduled',
        },
        timestamp: '2026-05-30T00:03:00.000Z',
        type: 'session-created',
      },
      {
        eventId: createEventId('event-2026-racesweet-round-1'),
        id: createMutationId('mutation-event-active'),
        timestamp: '2026-05-30T00:04:00.000Z',
        type: 'event-activated',
      },
    ],
    schemaVersion: 1,
  });
};
