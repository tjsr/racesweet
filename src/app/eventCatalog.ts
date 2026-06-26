import { CategoryId, normalizeCategoryResultExclusion } from '../controllers/category.js';
import { EventEntrantId } from '../model/entrant.js';
import type { EventCategory, EventCategoryId } from '../model/eventcategory.js';
import { EventId, SessionId } from '../model/raceevent.js';
import type { RaceState } from '../model/racestate.js';
import { IdType } from '../model/types.js';

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
  sessionId: SessionId;
  startTime: string;
}

export type EventCatalogCategory = EventCategory & {
  distanceRule?: CategoryDistanceRule;
  eventId: EventId;
  sessionAssignments?: CategorySessionAssignment[];
  teamRules?: CategoryTeamRules;
};

export interface EventCatalogEntrant {
  categoryId?: EventCategoryId;
  categoryIds: EventCategoryId[];
  dateOfBirth?: string;
  entrantType: EntrantType;
  eventId: EventId;
  firstName?: string;
  gender?: string;
  id: EventEntrantId;
  lastName?: string;
  memberParticipantIds: EventEntrantId[];
  name: string;
  notes?: string;
  sessionIds: SessionId[];
  teamEntrantId?: EventEntrantId;
  teamMembers?: Array<{
    categoryId?: EventCategoryId;
    dateOfBirth?: string;
    firstName: string;
    gender?: string;
    lastName: string;
    participantId: EventEntrantId;
  }>;
}

export interface EventCatalogEvent {
  categoryIds: EventCategoryId[];
  date: string;
  entrantIds: EventEntrantId[];
  format: EventFormat;
  id: EventId;
  name: string;
  sessionIds: SessionId[];
  timeZone?: string;
}

export interface EventCatalogSession {
  eventId: EventId;
  id: SessionId;
  kind: EventSessionKind;
  name: string;
  notes?: string;
  scheduledStart: string;
  status: EventSessionStatus;
}

export interface EventCatalogState {
  activeEventId?: EventId;
  activeSessionId?: SessionId;
  categories: EventCatalogCategory[];
  deletedEventIds: EventId[];
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
  changes: Partial<Pick<EventCatalogEvent, 'categoryIds' | 'date' | 'entrantIds' | 'format' | 'name' | 'sessionIds' | 'timeZone'>>;
  eventId: EventId;
  type: 'event-updated';
}

export interface EventDeletedMutation extends EventCatalogMutationBase {
  eventId: EventId;
  type: 'event-deleted';
}

export interface EventActivatedMutation extends EventCatalogMutationBase {
  eventId: EventId;
  type: 'event-activated';
}

export interface SessionCreatedMutation extends EventCatalogMutationBase {
  session: EventCatalogSession;
  type: 'session-created';
}

export interface SessionUpdatedMutation extends EventCatalogMutationBase {
  changes: Partial<Pick<EventCatalogSession, 'eventId' | 'kind' | 'name' | 'notes' | 'scheduledStart' | 'status'>>;
  sessionId: SessionId;
  type: 'session-updated';
}

export interface SessionActivatedMutation extends EventCatalogMutationBase {
  eventId: EventId;
  sessionId: SessionId;
  type: 'session-activated';
}

export interface SessionDeletedMutation extends EventCatalogMutationBase {
  sessionId: SessionId;
  type: 'session-deleted';
}

export interface RaceStateImportedMutation extends EventCatalogMutationBase {
  apicalDataFilePath?: string;
  eventId: EventId;
  raceState: Partial<RaceState>;
  sessionId: SessionId;
  type: 'race-state-imported';
}

export interface CategoryCreatedMutation extends EventCatalogMutationBase {
  category: EventCatalogCategory;
  type: 'category-created';
}

export interface CategoryUpdatedMutation extends EventCatalogMutationBase {
  categoryId: EventCategoryId;
  changes: Partial<Pick<EventCatalogCategory, 'code' | 'description' | 'distance' | 'distanceRule' | 'duration' | 'excludeFromResults' | 'name' | 'sessionAssignments' | 'startTime' | 'teamRules'>>;
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
  entrantId: EventEntrantId;
  type: 'entrant-updated';
}

export interface EntrantDeletedMutation extends EventCatalogMutationBase {
  entrantId: EventEntrantId;
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
  | EventDeletedMutation
  | EventUpdatedMutation
  | RaceStateImportedMutation
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
  deletedEventIds: [],
  entrants: [],
  events: [],
  sessions: [],
});

const removeEntry = (ids: IdType[], id: IdType): IdType[] => ids.filter((entryId) => entryId !== id);

export const applyEventCatalogLedger = (ledger: EventCatalogLedger): EventCatalogState => {
  return ledger.mutations.reduce<EventCatalogState>((state, mutation) => {
    switch (mutation.type) {
    case 'event-created': {
      if (state.deletedEventIds.includes(mutation.event.id)) {
        return state;
      }

      return {
        ...state,
        activeEventId: state.activeEventId ?? mutation.event.id,
        events: [...state.events, mutation.event],
      };
    }
    case 'event-updated': {
      if (state.deletedEventIds.includes(mutation.eventId)) {
        return state;
      }

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
    case 'event-deleted': {
      const remainingEvents = state.events.filter((event) => event.id !== mutation.eventId);
      const nextActiveEventId = state.activeEventId === mutation.eventId
        ? remainingEvents[0]?.id
        : state.activeEventId;
      const nextActiveSessionId = state.activeEventId === mutation.eventId
        ? state.sessions.find((session) => session.eventId === nextActiveEventId)?.id
        : state.activeSessionId;

      return {
        ...state,
        activeEventId: nextActiveEventId,
        activeSessionId: nextActiveSessionId,
        deletedEventIds: [...state.deletedEventIds, mutation.eventId],
        events: remainingEvents,
      };
    }
    case 'event-activated': {
      if (state.deletedEventIds.includes(mutation.eventId) || !state.events.some((event) => event.id === mutation.eventId)) {
        return state;
      }

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
        categories: [...state.categories, normalizeCategoryResultExclusion(mutation.category)],
      };
    }
    case 'category-updated': {
      return {
        ...state,
        categories: state.categories.map((category) => {
          if (category.id !== mutation.categoryId) {
            return category;
          }

          return normalizeCategoryResultExclusion({
            ...category,
            ...mutation.changes,
          });
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
    case 'race-state-imported': {
      return state;
    }
    default: {
      return state;
    }
    }
  }, createDefaultEventCatalogState());
};

export const getSessionsForEvent = (
  state: EventCatalogState,
  eventId: EventId | undefined
): EventCatalogSession[] => {
  if (!eventId || !state.events.some((event) => event.id === eventId)) {
    return [];
  }

  return state.sessions.filter((session) => session.eventId === eventId);
};

export const getCategoriesForEvent = (
  state: EventCatalogState,
  eventId: EventId | undefined
): EventCatalogCategory[] => {
  if (!eventId || !state.events.some((event) => event.id === eventId)) {
    return [];
  }

  return state.categories.filter((category) => category.eventId === eventId);
};

export const getEntrantsForEvent = (
  state: EventCatalogState,
  eventId: EventId | undefined
): EventCatalogEntrant[] => {
  if (!eventId || !state.events.some((event) => event.id === eventId)) {
    return [];
  }

  return state.entrants.filter((entrant) => entrant.eventId === eventId);
};

export const getEntrantsForCategory = (
  state: EventCatalogState,
  eventId: EventId | undefined,
  categoryId: CategoryId | undefined
): EventCatalogEntrant[] => {
  if (!eventId || !categoryId) {
    return [];
  }

  const eventEntrants = getEntrantsForEvent(state, eventId);
  const categoryTeamIds = new Set(eventEntrants
    .filter((entrant) => entrant.entrantType === 'team')
    .filter((entrant) => entrant.categoryId === categoryId || entrant.categoryIds.includes(categoryId))
    .map((entrant) => entrant.id));

  return eventEntrants.filter((entrant) => {
    if (entrant.teamEntrantId && categoryTeamIds.has(entrant.teamEntrantId)) {
      return true;
    }

    return entrant.categoryId === categoryId || entrant.categoryIds.includes(categoryId);
  });
};

export const getTeamsForParticipant = (
  state: EventCatalogState,
  eventId: EventId | undefined,
  participantId: IdType | undefined
): EventCatalogEntrant[] => {
  if (!participantId) {
    return [];
  }

  return getEntrantsForEvent(state, eventId)
    .filter((entrant) => entrant.entrantType === 'team')
    .filter((entrant) => entrant.memberParticipantIds.includes(participantId));
};
