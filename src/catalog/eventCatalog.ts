import { CategoryId } from '../processing/category.js';
import { EventEntrantId } from '../model/entrant.js';
import type { EventEntry, EventEntryId } from '../model/entry.js';
import type { EventCategory, EventCategoryId } from '../model/eventcategory.js';
import type { EventParticipant } from '../model/eventparticipant.js';
import { EventParticipantId } from '../model/eventparticipant.js';
import { EventId, SessionId } from '../model/raceevent.js';
import { IdType } from '../model/types.js';
import { isValidId } from '../validators/isValidId.js';

export type EventFormat = 'race-weekend' | 'test-day' | 'track-day' | 'other';
export type EventDiscipline = 'cycling' | 'motorsport';
export type EventSessionKind = 'practice' | 'qualifying' | 'race' | 'warmup' | 'other';
export type EventSessionStatus = 'draft' | 'scheduled' | 'live' | 'completed';
export type EntrantType = 'rider' | 'team';

export interface EventTrackTimingLine {
  label?: string;
  lineNumber: number;
  progress: number;
}

export interface EventTrackMap {
  gpxContent?: string;
  gpxFileName?: string;
  racingLineCsvContent?: string;
  racingLineCsvFileName?: string;
  sourceType?: 'gpx' | 'racetrack-csv';
  timingLines: EventTrackTimingLine[];
  trackCsvContent?: string;
  trackCsvFileName?: string;
}

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
  identityMode?: 'single' | 'multiple';
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
  entryIds?: EventEntryId[];
  eventId: EventId;
  firstName?: string;
  gender?: string;
  id: EventEntrantId;
  identifiers?: EventParticipant['identifiers'];
  /** True while this entrant was created only to represent unidentified timing data. */
  isPlaceholder?: boolean;
  /** True when this is the person or organisation responsible for Entries. */
  isEntryOwner?: boolean;
  lastName?: string;
  memberParticipantIds: EventParticipantId[];
  name: string;
  notes?: string;
  sessionIds?: SessionId[];
  startOrder?: number;
  teamEntrantId?: EventEntrantId;
  teamMembers?: Array<{
    categoryId?: EventCategoryId;
    dateOfBirth?: string;
    firstName: string;
    gender?: string;
    lastName: string;
    participantId: EventParticipantId;
  }>;
  vehicle?: string;
}

export type EventCatalogEntry = EventEntry & {
  isPlaceholder?: boolean;
  sessionIds?: SessionId[];
  startOrder?: number;
  vehicle?: string;
};

export interface EventCatalogEvent {
  categoryIds: EventCategoryId[];
  date: string;
  discipline?: EventDiscipline;
  entryIds?: EventEntryId[];
  entrantIds: EventEntrantId[];
  format: EventFormat;
  id: EventId;
  minimumLapTimeMilliseconds?: number | null;
  name: string;
  sessionIds: SessionId[];
  timeZone?: string;
  trackMap?: EventTrackMap;
}

export interface EventCatalogSession {
  categoryIds: EventCategoryId[];
  eventId: EventId;
  id: SessionId;
  kind: EventSessionKind;
  minimumLapTimeMilliseconds?: number | null;
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
  entries?: EventCatalogEntry[];
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

export const createDefaultEventCatalogState = (): EventCatalogState => ({
  activeEventId: undefined,
  activeSessionId: undefined,
  categories: [],
  deletedEventIds: [],
  entries: [],
  entrants: [],
  events: [],
  sessions: [],
});

export interface EventDisciplineLabels {
  plural: string;
  singular: string;
}

export const getEventDisciplineLabels = (discipline: EventDiscipline | undefined): EventDisciplineLabels => {
  return discipline === 'cycling'
    ? {
      plural: 'Riders',
      singular: 'Rider',
    }
    : {
      plural: 'Drivers',
      singular: 'Driver',
    };
};

const isActiveCategory = (category: EventCatalogCategory): boolean => category.deleted !== true;
const getLegacyCategorySessionAssignments = (category: EventCatalogCategory | undefined): CategorySessionAssignment[] => {
  return ((category as EventCatalogCategory & { sessionAssignments?: CategorySessionAssignment[] } | undefined)?.sessionAssignments || []);
};

const getCategoryIdsForSession = (session: EventCatalogSession | undefined): EventCategoryId[] => session?.categoryIds || [];

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

export const getEntriesForEvent = (
  state: EventCatalogState,
  eventId: EventId | undefined,
): EventCatalogEntry[] => {
  if (!eventId || !state.events.some((event) => event.id === eventId)) {
    return [];
  }

  return (state.entries || []).filter((entry) => entry.eventId === eventId);
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
