import type { EventCategory, EventCategoryId } from '../model/eventcategory.js';

export type EventFormat = 'race-weekend' | 'test-day' | 'track-day' | 'other';
export type EventSessionKind = 'practice' | 'qualifying' | 'race' | 'warmup' | 'other';
export type EventSessionStatus = 'draft' | 'scheduled' | 'live' | 'completed';
export type EntrantType = 'rider' | 'team';

export interface CategoryDistanceTime {
  kind: 'time';
  value: string;
}

export interface CategoryDistanceLaps {
  kind: 'laps';
  value: number;
}

export interface CategoryDistanceUnspecified {
  kind: 'unspecified';
}

export type CategoryDistanceRule = CategoryDistanceUnspecified | CategoryDistanceTime | CategoryDistanceLaps;

export interface CategoryTeamCompositionRule {
  gender: string;
  max?: number;
  min?: number;
}

export interface CategoryTeamRules {
  maxTeamSize?: number;
  maxRiderAge?: number;
  minRiderAge?: number;
  teamCompositionRules: CategoryTeamCompositionRule[];
}

export interface CategorySessionAssignment {
  sessionId: string;
  startTime: string;
}

export type EventCatalogCategory = EventCategory & {
  distanceRule?: CategoryDistanceRule;
  eventId: string;
  sessionAssignments?: CategorySessionAssignment[];
  teamRules?: CategoryTeamRules;
};

export interface EventCatalogEntrant {
  categoryId?: string;
  categoryIds: string[];
  dateOfBirth?: string;
  entrantType: EntrantType;
  eventId: string;
  firstName?: string;
  gender?: string;
  id: string;
  lastName?: string;
  memberParticipantIds: string[];
  name: string;
  notes?: string;
  sessionIds: string[];
  teamEntrantId?: string;
  teamMembers?: Array<{
    categoryId?: string;
    dateOfBirth?: string;
    firstName: string;
    gender?: string;
    lastName: string;
    participantId: string;
  }>;
}

export interface EventCatalogEvent {
  categoryIds: string[];
  date: string;
  entrantIds: string[];
  format: EventFormat;
  id: string;
  name: string;
  sessionIds: string[];
}

export interface EventCatalogSession {
  eventId: string;
  id: string;
  kind: EventSessionKind;
  name: string;
  notes?: string;
  scheduledStart: string;
  status: EventSessionStatus;
}

export interface EventCatalogState {
  activeEventId?: string;
  activeSessionId?: string;
  categories: EventCatalogCategory[];
  entrants: EventCatalogEntrant[];
  events: EventCatalogEvent[];
  sessions: EventCatalogSession[];
}

interface EventCatalogMutationBase {
  id: string;
  timestamp: string;
}

export interface EventCreatedMutation extends EventCatalogMutationBase {
  event: EventCatalogEvent;
  type: 'event-created';
}

export interface EventUpdatedMutation extends EventCatalogMutationBase {
  changes: Partial<Pick<EventCatalogEvent, 'categoryIds' | 'date' | 'entrantIds' | 'format' | 'name' | 'sessionIds'>>;
  eventId: string;
  type: 'event-updated';
}

export interface EventActivatedMutation extends EventCatalogMutationBase {
  eventId: string;
  type: 'event-activated';
}

export interface SessionCreatedMutation extends EventCatalogMutationBase {
  session: EventCatalogSession;
  type: 'session-created';
}

export interface SessionUpdatedMutation extends EventCatalogMutationBase {
  changes: Partial<Pick<EventCatalogSession, 'kind' | 'name' | 'notes' | 'scheduledStart' | 'status'>>;
  sessionId: string;
  type: 'session-updated';
}

export interface SessionActivatedMutation extends EventCatalogMutationBase {
  eventId: string;
  sessionId: string;
  type: 'session-activated';
}

export interface SessionDeletedMutation extends EventCatalogMutationBase {
  sessionId: string;
  type: 'session-deleted';
}

export interface CategoryCreatedMutation extends EventCatalogMutationBase {
  category: EventCatalogCategory;
  type: 'category-created';
}

export interface CategoryUpdatedMutation extends EventCatalogMutationBase {
  categoryId: EventCategoryId;
  changes: Partial<Pick<EventCatalogCategory, 'code' | 'description' | 'distance' | 'distanceRule' | 'duration' | 'name' | 'sessionAssignments' | 'startTime' | 'teamRules'>>;
  type: 'category-updated';
}

export interface CategoryDeletedMutation extends EventCatalogMutationBase {
  categoryId: EventCategoryId;
  type: 'category-deleted';
}

export interface EntrantCreatedMutation extends EventCatalogMutationBase {
  entrant: EventCatalogEntrant;
  type: 'entrant-created';
}

export interface EntrantUpdatedMutation extends EventCatalogMutationBase {
  changes: Partial<Pick<EventCatalogEntrant, 'categoryId' | 'categoryIds' | 'dateOfBirth' | 'entrantType' | 'firstName' | 'gender' | 'lastName' | 'memberParticipantIds' | 'name' | 'notes' | 'sessionIds' | 'teamEntrantId' | 'teamMembers'>>;
  entrantId: string;
  type: 'entrant-updated';
}

export interface EntrantDeletedMutation extends EventCatalogMutationBase {
  entrantId: string;
  type: 'entrant-deleted';
}

export type EventCatalogMutation =
  | CategoryCreatedMutation
  | CategoryDeletedMutation
  | CategoryUpdatedMutation
  | EntrantCreatedMutation
  | EntrantDeletedMutation
  | EntrantUpdatedMutation
  | EventActivatedMutation
  | EventCreatedMutation
  | EventUpdatedMutation
  | SessionActivatedMutation
  | SessionCreatedMutation
  | SessionDeletedMutation
  | SessionUpdatedMutation;

export interface EventCatalogLedger {
  mutations: EventCatalogMutation[];
  schemaVersion: 1;
}

export const createDefaultEventCatalogLedger = (): EventCatalogLedger => ({
  mutations: [],
  schemaVersion: 1,
});

export const createDefaultEventCatalogState = (): EventCatalogState => ({
  activeEventId: undefined,
  activeSessionId: undefined,
  categories: [],
  entrants: [],
  events: [],
  sessions: [],
});

export const createSeedEventCatalogLedger = (): EventCatalogLedger => ({
  mutations: [
    {
      event: {
        categoryIds: ['event-2026-racesweet-round-1-category-premier', 'event-2026-racesweet-round-1-category-clubman'],
        date: '2026-06-12',
        entrantIds: ['event-2026-racesweet-round-1-entrant-101'],
        format: 'race-weekend',
        id: 'event-2026-racesweet-round-1',
        name: 'RaceSweet Round 1',
        sessionIds: ['session-1-practice', 'session-1-qualifying', 'session-1-race'],
      },
      id: 'mutation-event-seed',
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
        eventId: 'event-2026-racesweet-round-1',
        id: 'event-2026-racesweet-round-1-category-premier',
        name: 'Premier',
        sessionAssignments: [
          {
            sessionId: 'session-1-race',
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
      id: 'mutation-category-seed-1',
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
        eventId: 'event-2026-racesweet-round-1',
        id: 'event-2026-racesweet-round-1-category-clubman',
        name: 'Clubman',
        sessionAssignments: [
          {
            sessionId: 'session-1-practice',
            startTime: '2026-06-12T09:00:00.000Z',
          },
          {
            sessionId: 'session-1-race',
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
      id: 'mutation-category-seed-2',
      timestamp: '2026-05-30T00:00:40.000Z',
      type: 'category-created',
    },
    {
      entrant: {
        categoryIds: ['event-2026-racesweet-round-1-category-premier'],
        entrantType: 'rider',
        eventId: 'event-2026-racesweet-round-1',
        id: 'event-2026-racesweet-round-1-entrant-101',
        memberParticipantIds: ['101'],
        name: 'Rider 101',
        sessionIds: ['session-1-practice', 'session-1-qualifying', 'session-1-race'],
      },
      id: 'mutation-entrant-seed-1',
      timestamp: '2026-05-30T00:00:45.000Z',
      type: 'entrant-created',
    },
    {
      id: 'mutation-session-seed-1',
      session: {
        eventId: 'event-2026-racesweet-round-1',
        id: 'session-1-practice',
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
      id: 'mutation-session-seed-2',
      session: {
        eventId: 'event-2026-racesweet-round-1',
        id: 'session-1-qualifying',
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
      id: 'mutation-session-seed-3',
      session: {
        eventId: 'event-2026-racesweet-round-1',
        id: 'session-1-race',
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
      eventId: 'event-2026-racesweet-round-1',
      id: 'mutation-event-active',
      timestamp: '2026-05-30T00:04:00.000Z',
      type: 'event-activated',
    },
  ],
  schemaVersion: 1,
});

const removeEntry = (ids: string[], id: string): string[] => ids.filter((entryId) => entryId !== id);

export const applyEventCatalogLedger = (ledger: EventCatalogLedger): EventCatalogState => {
  return ledger.mutations.reduce<EventCatalogState>((state, mutation) => {
    switch (mutation.type) {
    case 'event-created': {
      return {
        ...state,
        activeEventId: state.activeEventId ?? mutation.event.id,
        events: [...state.events, mutation.event],
      };
    }
    case 'event-updated': {
      return {
        ...state,
        events: state.events.map((event) => {
          if (event.id !== mutation.eventId) {
            return event;
          }

          return {
            ...event,
            ...mutation.changes,
          };
        }),
      };
    }
    case 'event-activated': {
      const existingActiveSession = state.sessions.find((session) => session.id === state.activeSessionId && session.eventId === mutation.eventId);
      const firstEventSession = state.sessions.find((session) => session.eventId === mutation.eventId);

      return {
        ...state,
        activeEventId: mutation.eventId,
        activeSessionId: existingActiveSession?.id || firstEventSession?.id,
      };
    }
    case 'category-created': {
      return {
        ...state,
        categories: [...state.categories, mutation.category],
      };
    }
    case 'category-updated': {
      return {
        ...state,
        categories: state.categories.map((category) => {
          if (category.id !== mutation.categoryId) {
            return category;
          }

          return {
            ...category,
            ...mutation.changes,
          };
        }),
      };
    }
    case 'category-deleted': {
      return {
        ...state,
        categories: state.categories.filter((category) => category.id !== mutation.categoryId),
        entrants: state.entrants.map((entrant) => ({
          ...entrant,
          categoryId: entrant.categoryId === mutation.categoryId.toString() ? undefined : entrant.categoryId,
          categoryIds: removeEntry(entrant.categoryIds, mutation.categoryId.toString()),
        })),
        events: state.events.map((event) => ({
          ...event,
          categoryIds: removeEntry(event.categoryIds, mutation.categoryId.toString()),
        })),
      };
    }
    case 'entrant-created': {
      return {
        ...state,
        entrants: [...state.entrants, mutation.entrant],
      };
    }
    case 'entrant-updated': {
      return {
        ...state,
        entrants: state.entrants.map((entrant) => {
          if (entrant.id !== mutation.entrantId) {
            return entrant;
          }

          return {
            ...entrant,
            ...mutation.changes,
          };
        }),
      };
    }
    case 'entrant-deleted': {
      return {
        ...state,
        entrants: state.entrants.filter((entrant) => entrant.id !== mutation.entrantId),
        events: state.events.map((event) => ({
          ...event,
          entrantIds: removeEntry(event.entrantIds, mutation.entrantId),
        })),
      };
    }
    case 'session-created': {
      return {
        ...state,
        sessions: [...state.sessions, mutation.session],
      };
    }
    case 'session-updated': {
      return {
        ...state,
        sessions: state.sessions.map((session) => {
          if (session.id !== mutation.sessionId) {
            return session;
          }

          return {
            ...session,
            ...mutation.changes,
          };
        }),
      };
    }
    case 'session-activated': {
      return {
        ...state,
        activeEventId: mutation.eventId,
        activeSessionId: mutation.sessionId,
      };
    }
    case 'session-deleted': {
      const remainingSessions = state.sessions.filter((session) => session.id !== mutation.sessionId);
      const nextActiveSession = state.activeSessionId === mutation.sessionId
        ? remainingSessions.find((session) => session.eventId === state.activeEventId)?.id
        : state.activeSessionId;

      return {
        ...state,
        activeSessionId: nextActiveSession,
        entrants: state.entrants.map((entrant) => ({
          ...entrant,
          sessionIds: removeEntry(entrant.sessionIds, mutation.sessionId),
        })),
        events: state.events.map((event) => ({
          ...event,
          sessionIds: removeEntry(event.sessionIds, mutation.sessionId),
        })),
        sessions: remainingSessions,
      };
    }
    default: {
      return state;
    }
    }
  }, createDefaultEventCatalogState());
};

export const getSessionsForEvent = (
  state: EventCatalogState,
  eventId: string | undefined
): EventCatalogSession[] => {
  if (!eventId) {
    return [];
  }

  return state.sessions.filter((session) => session.eventId === eventId);
};

export const getCategoriesForEvent = (
  state: EventCatalogState,
  eventId: string | undefined
): EventCatalogCategory[] => {
  if (!eventId) {
    return [];
  }

  return state.categories.filter((category) => category.eventId === eventId);
};

export const getEntrantsForEvent = (
  state: EventCatalogState,
  eventId: string | undefined
): EventCatalogEntrant[] => {
  if (!eventId) {
    return [];
  }

  return state.entrants.filter((entrant) => entrant.eventId === eventId);
};

export const getEntrantsForCategory = (
  state: EventCatalogState,
  eventId: string | undefined,
  categoryId: string | undefined
): EventCatalogEntrant[] => {
  if (!eventId || !categoryId) {
    return [];
  }

  return getEntrantsForEvent(state, eventId).filter((entrant) => {
    return entrant.categoryId === categoryId || entrant.categoryIds.includes(categoryId);
  });
};
