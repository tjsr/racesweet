import { CategoryId, normalizeCategoryResultExclusion } from '../controllers/category.js';
import { EventEntrantId } from '../model/entrant.js';
import type { EventCategory, EventCategoryId } from '../model/eventcategory.js';
import type { EventParticipant } from '../model/eventparticipant.js';
import { EventParticipantId } from '../model/eventparticipant.js';
import { EventId, SessionId } from '../model/raceevent.js';
import type { RaceState } from '../model/racestate.js';
import { IdType } from '../model/types.js';
import { isValidId } from '../validators/isValidId.js';

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
  identifiers?: EventParticipant['identifiers'];
  lastName?: string;
  memberParticipantIds: EventParticipantId[];
  name: string;
  notes?: string;
  sessionIds?: SessionId[];
  teamEntrantId?: EventEntrantId;
  teamMembers?: Array<{
    categoryId?: EventCategoryId;
    dateOfBirth?: string;
    firstName: string;
    gender?: string;
    lastName: string;
    participantId: EventParticipantId;
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
  categoryIds: EventCategoryId[];
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

export interface ParticipantEntrantMembership {
  categories: EventCatalogCategory[];
  entrant: EventCatalogEntrant;
  event: EventCatalogEvent;
  sessions: EventCatalogSession[];
}

export interface ParticipantEntrantMembershipOptions {
  eventId?: EventId;
  includeTeamParents?: boolean;
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
  changes: Partial<Pick<EventCatalogSession, 'categoryIds' | 'eventId' | 'kind' | 'name' | 'notes' | 'scheduledStart' | 'status'>>;
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
  const event = state.events.find((item) => item.id === eventId);
  if (!event) {
    return [];
  }

  const eventCategoryIds = new Set(event.categoryIds);
  return state.categories.filter((category) => category.eventId === eventId && isActiveCategory(category) && eventCategoryIds.has(category.id));
};

export const getCategoryAssignedSessionIds = (
  category: EventCatalogCategory | undefined,
  eventSessions: EventCatalogSession[] = []
): Set<SessionId> => {
  const assignedSessionIds = new Set<SessionId>();

  if (category) {
    eventSessions
      .filter((session) => getCategoryIdsForSession(session).includes(category.id))
      .forEach((session) => assignedSessionIds.add(session.id));
  }

  getLegacyCategorySessionAssignments(category).forEach((assignment) => {
    if (isValidId(assignment.sessionId)) {
      assignedSessionIds.add(assignment.sessionId);
      return;
    }

    const matchingSession = eventSessions.find((session) => session.scheduledStart === assignment.startTime);
    if (matchingSession) {
      assignedSessionIds.add(matchingSession.id.toString());
      return;
    }

    if (eventSessions.length === 1) {
      assignedSessionIds.add(eventSessions[0]!.id?.toString());
    }
  });

  return assignedSessionIds;
};

export const getSessionAssignedCategoryIds = (
  categories: EventCatalogCategory[],
  sessionId: SessionId | undefined,
  eventSessions: EventCatalogSession[] = []
): Set<EventCategoryId> => {
  if (!sessionId) {
    return new Set<EventCategoryId>();
  }

  const activeCategoryIds = new Set(categories.filter(isActiveCategory).map((category) => category.id));
  const sessionCategoryIds = getCategoryIdsForSession(eventSessions.find((session) => session.id === sessionId))
    .filter((categoryId) => activeCategoryIds.has(categoryId));
  const legacyCategoryIds = categories
    .filter((category) => getCategoryAssignedSessionIds(category, eventSessions).has(sessionId))
    .map((category) => category.id);

  return new Set([...sessionCategoryIds, ...legacyCategoryIds]);
};

export const getEntrantCategoryIds = (
  entrant: EventCatalogEntrant | undefined,
  eventEntrants: EventCatalogEntrant[] = []
): Set<EventCategoryId> => {
  const categoryIds = new Set<EventCategoryId>();
  if (!entrant) {
    return categoryIds;
  }

  if (entrant.categoryId) {
    categoryIds.add(entrant.categoryId);
  }
  entrant.categoryIds.forEach((categoryId) => categoryIds.add(categoryId));

  if (entrant.teamEntrantId) {
    const team = eventEntrants.find((candidate) => candidate.id === entrant.teamEntrantId);
    if (team?.categoryId) {
      categoryIds.add(team.categoryId);
    }
    team?.categoryIds.forEach((categoryId) => categoryIds.add(categoryId));
  }

  return categoryIds;
};

export const getEntrantAssignedSessionIds = (
  entrant: EventCatalogEntrant | undefined,
  eventCategories: EventCatalogCategory[] = [],
  eventSessions: EventCatalogSession[] = [],
  eventEntrants: EventCatalogEntrant[] = []
): Set<SessionId> => {
  const entrantCategoryIds = getEntrantCategoryIds(entrant, eventEntrants);
  const assignedSessionIds = new Set<SessionId>();

  eventSessions
    .filter((session) => getCategoryIdsForSession(session).some((categoryId) => entrantCategoryIds.has(categoryId)))
    .forEach((session) => assignedSessionIds.add(session.id));

  eventCategories
    .filter((category) => entrantCategoryIds.has(category.id))
    .forEach((category) => getLegacyCategorySessionAssignments(category)
      .forEach(() => getCategoryAssignedSessionIds(category, eventSessions).forEach((sessionId) => assignedSessionIds.add(sessionId))));

  return assignedSessionIds;
};

export const getParticipantAssignedSessionIds = (
  participant: Pick<EventParticipant, 'categoryId'> | undefined,
  eventCategories: EventCatalogCategory[] = [],
  eventSessions: EventCatalogSession[] = []
): Set<SessionId> => {
  const category = eventCategories.find((candidate) => candidate.id === participant?.categoryId);
  return getCategoryAssignedSessionIds(category, eventSessions);
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

  const categoryIsListedForEvent = getCategoriesForEvent(state, eventId).some((category) => category.id === categoryId);
  if (!categoryIsListedForEvent) {
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

export const getParticipantEntrantMemberships = (
  state: EventCatalogState,
  participantId: IdType | undefined,
  options: ParticipantEntrantMembershipOptions = {}
): ParticipantEntrantMembership[] => {
  if (!participantId) {
    return [];
  }

  const eventIds = options.eventId
    ? [options.eventId]
    : state.events
      .filter((event) => !state.deletedEventIds.includes(event.id))
      .map((event) => event.id);
  const memberships: ParticipantEntrantMembership[] = [];
  const includedMembershipIds = new Set<string>();

  const addMembership = (
    event: EventCatalogEvent,
    entrant: EventCatalogEntrant,
    eventEntrants: EventCatalogEntrant[],
    eventCategories: EventCatalogCategory[],
    eventSessions: EventCatalogSession[]
  ): void => {
    const membershipId = `${event.id}:${entrant.id}`;
    if (includedMembershipIds.has(membershipId)) {
      return;
    }

    const entrantCategoryIds = getEntrantCategoryIds(entrant, eventEntrants);
    const assignedSessionIds = getEntrantAssignedSessionIds(entrant, eventCategories, eventSessions, eventEntrants);
    memberships.push({
      categories: eventCategories.filter((category) => entrantCategoryIds.has(category.id)),
      entrant,
      event,
      sessions: eventSessions.filter((session) => assignedSessionIds.has(session.id)),
    });
    includedMembershipIds.add(membershipId);
  };

  eventIds.forEach((eventId) => {
    const event = state.events.find((candidate) => candidate.id === eventId && !state.deletedEventIds.includes(candidate.id));
    if (!event) {
      return;
    }

    const eventEntrants = getEntrantsForEvent(state, event.id);
    const eventCategories = getCategoriesForEvent(state, event.id);
    const eventSessions = getSessionsForEvent(state, event.id);
    const matchingEntrants = eventEntrants.filter((entrant) => {
      return entrant.id === participantId || entrant.memberParticipantIds.includes(participantId);
    });

    matchingEntrants.forEach((entrant) => {
      addMembership(event, entrant, eventEntrants, eventCategories, eventSessions);

      if (!options.includeTeamParents || !entrant.teamEntrantId) {
        return;
      }

      const teamEntrant = eventEntrants.find((candidate) => candidate.id === entrant.teamEntrantId);
      if (teamEntrant) {
        addMembership(event, teamEntrant, eventEntrants, eventCategories, eventSessions);
      }
    });
  });

  return memberships;
};
