import { normalizeCategoryResultExclusion } from '../controllers/category.js';
import type { EventEntrantId } from '../model/entrant.js';
import type { EventCategoryId } from '../model/eventcategory.js';
import type { EventId, SessionId } from '../model/raceevent.js';
import type { RaceState } from '../model/racestate.js';
import type { IdType } from '../model/types.js';
import { incrementLoadingMetric } from '../loadingMetrics.js';
import { isValidId } from '../validators/isValidId.js';
import {
  type CategorySessionAssignment,
  createDefaultEventCatalogState,
  type EventCatalogCategory,
  type EventCatalogEntrant,
  type EventCatalogEvent,
  type EventCatalogSession,
  type EventCatalogState,
} from '../catalog/eventCatalog.js';

interface EventCatalogMutationBase {
  id: string;
  timestamp: string;
}

export interface EventCreatedMutation extends EventCatalogMutationBase {
  event: EventCatalogEvent;
  type: 'event-created';
}

export interface EventUpdatedMutation extends EventCatalogMutationBase {
  changes: Partial<Pick<EventCatalogEvent, 'categoryIds' | 'date' | 'entrantIds' | 'format' | 'minimumLapTimeMilliseconds' | 'name' | 'sessionIds' | 'timeZone'>>;
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
  changes: Partial<Pick<EventCatalogSession, 'categoryIds' | 'eventId' | 'kind' | 'minimumLapTimeMilliseconds' | 'name' | 'notes' | 'scheduledStart' | 'status'>>;
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
  changes: Partial<Pick<EventCatalogCategory, 'code' | 'deleted' | 'description' | 'distance' | 'distanceRule' | 'duration' | 'excludeFromResults' | 'name' | 'startTime' | 'teamRules'>>;
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
  changes: Partial<Pick<EventCatalogEntrant, 'categoryId' | 'categoryIds' | 'dateOfBirth' | 'entrantType' | 'firstName' | 'gender' | 'identifiers' | 'lastName' | 'memberParticipantIds' | 'name' | 'notes' | 'teamEntrantId' | 'teamMembers'>>;
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

const removeEntry = (ids: IdType[], id: IdType): IdType[] => ids.filter((entryId) => entryId !== id);
const addUniqueEntry = <TValue extends IdType>(ids: TValue[], id: TValue): TValue[] => ids.includes(id) ? ids : [...ids, id];
const isActiveCategory = (category: EventCatalogCategory): boolean => category.deleted !== true;
const getLegacyCategorySessionAssignments = (category: EventCatalogCategory | undefined): CategorySessionAssignment[] => {
  return ((category as EventCatalogCategory & { sessionAssignments?: CategorySessionAssignment[] } | undefined)?.sessionAssignments || []);
};

const getCategoryIdsForSession = (session: EventCatalogSession | undefined): EventCategoryId[] => session?.categoryIds || [];

const migrateLegacyCategoryAssignments = (state: EventCatalogState): EventCatalogState => {
  const activeCategories = state.categories.filter(isActiveCategory);
  if (!activeCategories.some((category) => getLegacyCategorySessionAssignments(category).length > 0)) {
    return state;
  }

  return {
    ...state,
    sessions: state.sessions.map((session) => {
      const categoryIds = activeCategories.reduce<EventCategoryId[]>((assignedCategoryIds, category) => {
        const isAssigned = getLegacyCategorySessionAssignments(category).some((assignment) => {
          if (isValidId(assignment.sessionId)) {
            return assignment.sessionId === session.id;
          }

          return assignment.startTime === session.scheduledStart;
        });

        return isAssigned ? addUniqueEntry(assignedCategoryIds, category.id) : assignedCategoryIds;
      }, getCategoryIdsForSession(session));

      return {
        ...session,
        categoryIds,
      };
    }),
  };
};

export const applyEventCatalogLedger = (ledger: EventCatalogLedger): EventCatalogState => {
  const state = ledger.mutations.reduce<EventCatalogState>((currentState, mutation) => {
    incrementLoadingMetric('Apply event catalog ledger mutation', mutation.type);
    switch (mutation.type) {
    case 'event-created': {
      if (currentState.deletedEventIds.includes(mutation.event.id)) {
        return currentState;
      }

      return {
        ...currentState,
        activeEventId: currentState.activeEventId ?? mutation.event.id,
        events: [...currentState.events, mutation.event],
      };
    }
    case 'event-updated': {
      if (currentState.deletedEventIds.includes(mutation.eventId)) {
        return currentState;
      }

      return {
        ...currentState,
        events: currentState.events.map((event) => {
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
      const remainingEvents = currentState.events.filter((event) => event.id !== mutation.eventId);
      const nextActiveEventId = currentState.activeEventId === mutation.eventId
        ? remainingEvents[0]?.id
        : currentState.activeEventId;
      const nextActiveSessionId = currentState.activeEventId === mutation.eventId
        ? currentState.sessions.find((session) => session.eventId === nextActiveEventId)?.id
        : currentState.activeSessionId;

      return {
        ...currentState,
        activeEventId: nextActiveEventId,
        activeSessionId: nextActiveSessionId,
        deletedEventIds: [...currentState.deletedEventIds, mutation.eventId],
        events: remainingEvents,
      };
    }
    case 'event-activated': {
      if (currentState.deletedEventIds.includes(mutation.eventId) || !currentState.events.some((event) => event.id === mutation.eventId)) {
        return currentState;
      }

      const existingActiveSession = currentState.sessions.find((session) => session.id === currentState.activeSessionId && session.eventId === mutation.eventId);
      const firstEventSession = currentState.sessions.find((session) => session.eventId === mutation.eventId);

      return {
        ...currentState,
        activeEventId: mutation.eventId,
        activeSessionId: existingActiveSession?.id || firstEventSession?.id,
      };
    }
    case 'category-created': {
      const category = normalizeCategoryResultExclusion({ ...mutation.category, deleted: false });
      return {
        ...currentState,
        categories: [
          ...currentState.categories.map((existingCategory) => (
            existingCategory.id === category.id && isActiveCategory(existingCategory)
              ? { ...existingCategory, deleted: true }
              : existingCategory
          )),
          category,
        ],
      };
    }
    case 'category-updated': {
      return {
        ...currentState,
        categories: currentState.categories.map((category) => {
          if (category.id !== mutation.categoryId || !isActiveCategory(category)) {
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
        ...currentState,
        categories: currentState.categories.map((category) => (
          category.id === mutation.categoryId && isActiveCategory(category)
            ? { ...category, deleted: true }
            : category
        )),
        entrants: currentState.entrants.map((entrant) => ({
          ...entrant,
          categoryId: entrant.categoryId === mutation.categoryId.toString() ? undefined : entrant.categoryId,
          categoryIds: removeEntry(entrant.categoryIds, mutation.categoryId.toString()),
        })),
        events: currentState.events.map((event) => ({
          ...event,
          categoryIds: removeEntry(event.categoryIds, mutation.categoryId.toString()),
        })),
        sessions: currentState.sessions.map((session) => ({
          ...session,
          categoryIds: removeEntry(getCategoryIdsForSession(session), mutation.categoryId.toString()),
        })),
      };
    }
    case 'entrant-created': {
      return {
        ...currentState,
        entrants: [...currentState.entrants, mutation.entrant],
      };
    }
    case 'entrant-updated': {
      return {
        ...currentState,
        entrants: currentState.entrants.map((entrant) => {
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
        ...currentState,
        entrants: currentState.entrants.filter((entrant) => entrant.id !== mutation.entrantId),
        events: currentState.events.map((event) => ({
          ...event,
          entrantIds: removeEntry(event.entrantIds, mutation.entrantId),
        })),
      };
    }
    case 'session-created': {
      return {
        ...currentState,
        sessions: [...currentState.sessions, { ...mutation.session, categoryIds: getCategoryIdsForSession(mutation.session) }],
      };
    }
    case 'session-updated': {
      return {
        ...currentState,
        sessions: currentState.sessions.map((session) => {
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
        ...currentState,
        activeEventId: mutation.eventId,
        activeSessionId: mutation.sessionId,
      };
    }
    case 'session-deleted': {
      const remainingSessions = currentState.sessions.filter((session) => session.id !== mutation.sessionId);
      const nextActiveSession = currentState.activeSessionId === mutation.sessionId
        ? remainingSessions.find((session) => session.eventId === currentState.activeEventId)?.id
        : currentState.activeSessionId;

      return {
        ...currentState,
        activeSessionId: nextActiveSession,
        events: currentState.events.map((event) => ({
          ...event,
          sessionIds: removeEntry(event.sessionIds, mutation.sessionId),
        })),
        sessions: remainingSessions,
      };
    }
    case 'race-state-imported': {
      return currentState;
    }
    default: {
      return currentState;
    }
    }
  }, createDefaultEventCatalogState());

  return migrateLegacyCategoryAssignments(state);
};
