import { validate as validateUuid } from 'uuid';
import { CategoryId, normalizeCategoryResultExclusion } from '../controllers/category.js';
import { EventEntrantId } from '../model/entrant.js';
import type { EventCategory } from '../model/eventcategory.js';
import type { EventParticipant } from '../model/eventparticipant.js';
import type { EventTeam } from '../model/eventteam.js';
import { createCategoryId, createEventEntrantId, createEventId, createId, createSessionId, rewriteImportedObjectIds } from '../model/ids.js';
import { EventId, SessionId } from '../model/raceevent.js';
import type { RaceState } from '../model/racestate.js';
import type { TimeRecord } from '../model/timerecord.js';
import { createSeedEventCatalogLedger } from './createSeedEventCatalogLedger.js';
import {
  type CategoryDistanceRule,
  type CategoryTeamRules,
  type EntrantType,
  type EventCatalogCategory,
  type EventCatalogEntrant,
  type EventCatalogLedger,
  type EventCatalogMutation,
  type EventCatalogSession,
  type EventCatalogState,
  applyEventCatalogLedger,
  getCategoriesForEvent,
  getEntrantsForEvent,
} from './eventCatalog.js';
import type { EventCatalogPersistence } from './eventCatalogPersistence.js';
import { addMissingLinkedCategoryPlaceholders } from './sessionSourceReload.js';
import type { MasterEntrantProfile } from './systemConfig.js';
import { getSystemTimeZone } from './utils/timeutils.js';

interface ApicalCatalogImport {
  apicalDataFilePath?: string;
  eventDate?: string;
  eventId: EventId;
  eventName: string;
  raceState: Partial<RaceState>;
  sessionId: SessionId;
  timeZone?: string;
}

export interface ImportedRaceStateMetadata {
  apicalDataFilePath?: string;
  raceState: Partial<RaceState>;
}

interface EventCatalogServiceOptions {
  onPersistedLedger?: (ledger: EventCatalogLedger) => Promise<void>;
}

const assertEventCatalogPersistence = (persistence: EventCatalogPersistence): void => {
  if (!persistence || typeof persistence.load !== 'function' || typeof persistence.save !== 'function') {
    throw new Error('EventCatalogService.create requires a persistence object with load() and save() methods.');
  }
};

const createMutationId = (): string => createId('mutationId');
const createTimestamp = (): string => new Date().toISOString();

const reviveDate = (value: Date | string | undefined): Date | undefined => {
  if (!value) {
    return undefined;
  }

  return value instanceof Date ? value : new Date(value);
};

const reviveRaceStateDates = (raceState: Partial<RaceState>): Partial<RaceState> => {
  return {
    ...raceState,
    categories: normalizeCategoriesForResultExclusion(raceState.categories || []),
    eventStartTime: reviveDate(raceState.eventStartTime),
    records: (raceState.records || []).map((record): TimeRecord => ({
      ...record,
      time: reviveDate(record.time),
    })),
  };
};

const entrantNameFromMembers = (members: EventParticipant[]): string => {
  if (members.length === 0) {
    return 'Unassigned Entrant';
  }
  if (members.length === 1) {
    return `${members[0].firstname} ${members[0].surname}`.trim();
  }
  return `Team ${members[0].entrantId}`;
};

const unique = (values: string[]): string[] => Array.from(new Set(values.filter((value) => value.trim().length > 0)));
const hasOwn = <T extends object>(value: T, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);
const nonEmpty = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const findProfileForParticipant = (participant: EventParticipant, masterProfiles: MasterEntrantProfile[]): MasterEntrantProfile | undefined => {
  const participantId = participant.id.toString();
  const entrantId = participant.entrantId.toString();

  return masterProfiles.find((profile) => {
    return (profile.participantId && profile.participantId === participantId) ||
      (profile.entrantId && profile.entrantId === entrantId);
  });
};

const deriveDistanceRule = (category: EventCategory): CategoryDistanceRule | undefined => {
  if (typeof category.distance === 'number' && Number.isFinite(category.distance)) {
    return {
      kind: 'laps',
      value: category.distance,
    };
  }

  if (typeof category.duration === 'string' && category.duration.length > 0) {
    return {
      kind: 'time',
      value: category.duration,
    };
  }

  return undefined;
};

const normalizeCategoriesForResultExclusion = (categories: EventCategory[]): EventCategory[] =>
  categories.map((category) => normalizeCategoryResultExclusion(category));

const deriveMaxTeamSizesByCategory = (teams: EventTeam[], participants: EventParticipant[]): Map<string, number> => {
  const participantById = new Map(participants.map((participant) => [participant.id.toString(), participant]));
  const maxTeamSizeByCategory = new Map<string, number>();

  teams.forEach((team) => {
    if (team.members.length <= 1) {
      return;
    }

    const categoryIds = unique([
      team.categoryId?.toString() || '',
      ...team.members.map((memberId) => participantById.get(memberId.toString())?.categoryId.toString() || ''),
    ]);

    categoryIds.forEach((categoryId) => {
      const currentMaxTeamSize = maxTeamSizeByCategory.get(categoryId) || 0;
      maxTeamSizeByCategory.set(categoryId, Math.max(currentMaxTeamSize, team.members.length));
    });
  });

  return maxTeamSizeByCategory;
};

const createCategoryTeamRules = (categoryId: string, maxTeamSizeByCategory: Map<string, number>): CategoryTeamRules => {
  const maxTeamSize = maxTeamSizeByCategory.get(categoryId);

  return {
    ...(maxTeamSize && maxTeamSize > 1 ? { maxTeamSize } : {}),
    teamCompositionRules: [],
  };
};

const mergeSessionCategoryIds = (existingCategoryIds: string[] = [], nextCategoryIds: string[] = []): string[] => {
  return unique([...existingCategoryIds, ...nextCategoryIds]);
};

const deriveCategoriesFromEventData = (
  eventId: EventId,
  categories: EventCategory[],
  participants: EventParticipant[],
  teams: EventTeam[] = [],
  _assignedSessionId?: SessionId,
  _assignedSessionStart?: string
): EventCatalogCategory[] => {
  const byId = new Map<EventId, EventCatalogCategory>();
  const maxTeamSizeByCategory = deriveMaxTeamSizesByCategory(teams, participants);

  normalizeCategoriesForResultExclusion(categories).forEach((category) => {
    const id = validateUuid(category.id) ? category.id : createCategoryId(category.id);
    byId.set(id, {
      ...category,
      distanceRule: deriveDistanceRule(category),
      eventId,
      teamRules: createCategoryTeamRules(id.toString(), maxTeamSizeByCategory),
    });
  });

  unique(participants.map((participant) => participant.categoryId.toString())).forEach((categoryId) => {
    if (!byId.has(categoryId)) {
      byId.set(categoryId, {
        code: '',
        description: '',
        distanceRule: {
          kind: 'unspecified',
        },
        eventId,
        id: categoryId,
        name: `Category ${categoryId}`,
        teamRules: createCategoryTeamRules(categoryId, maxTeamSizeByCategory),
      });
    }
  });

  return Array.from(byId.values());
};

const deriveEntrantsFromParticipants = (
  eventId: EventId,
  participants: EventParticipant[],
  masterProfiles: MasterEntrantProfile[] = [],
  teams: EventTeam[] = []
): EventCatalogEntrant[] => {
  const groups = new Map<string, EventParticipant[]>();
  const teamsById = new Map<string, EventTeam>(teams.map((team) => [team.id.toString(), team]));
  participants.forEach((participant) => {
    const entrantId = nonEmpty(participant.entrantId?.toString()) || participant.id.toString();
    const existing = groups.get(entrantId) || [];
    existing.push(participant);
    groups.set(entrantId, existing);
  });

  return Array.from(groups.entries()).flatMap(([entrantId, members]) => {
    const importedTeam = teamsById.get(entrantId);
    const enrichedMembers = members.map((member) => {
      const profile = findProfileForParticipant(member, masterProfiles);
      const fallbackCategoryId = nonEmpty(profile?.categoryId);

      return {
        categoryId: nonEmpty(member.categoryId.toString()) || fallbackCategoryId,
        dateOfBirth: nonEmpty(profile?.dateOfBirth),
        firstName: nonEmpty(member.firstname) || nonEmpty(profile?.firstName) || '',
        gender: nonEmpty(profile?.gender),
        lastName: nonEmpty(member.surname) || nonEmpty(profile?.lastName) || '',
        participantId: member.id.toString(),
      };
    });

    const importedTeamCategoryId = nonEmpty((importedTeam as EventTeam & { categoryId?: string } | undefined)?.categoryId);
    const categoryIds = unique([
      importedTeamCategoryId || '',
      ...enrichedMembers.map((member) => member.categoryId || ''),
    ]);
    const memberParticipantIds = unique(enrichedMembers.map((member) => member.participantId));
    const entrantType = importedTeam ? 'team' : members.length > 1 ? 'team' : 'rider';
    const riderEntries = members.map((member) => {
      const profile = findProfileForParticipant(member, masterProfiles);
      const riderFirstName = nonEmpty(member.firstname) || nonEmpty(profile?.firstName);
      const riderLastName = nonEmpty(member.surname) || nonEmpty(profile?.lastName);
      const riderCategoryId = nonEmpty(member.categoryId?.toString()) || nonEmpty(profile?.categoryId);
      const riderName = [riderFirstName, riderLastName].filter((part) => !!part).join(' ').trim();
      const participantId = member.id.toString();

      return {
        categoryId: riderCategoryId,
        categoryIds: riderCategoryId ? [riderCategoryId] : [],
        dateOfBirth: nonEmpty(profile?.dateOfBirth),
        entrantType: 'rider' as const,
        eventId,
        firstName: riderFirstName,
        gender: nonEmpty(profile?.gender),
        id: entrantType === 'team' ? participantId : entrantId,
        lastName: riderLastName,
        memberParticipantIds: [participantId],
        name: riderName || `${member.firstname || ''} ${member.surname || ''}`.trim() || participantId,
        teamEntrantId: entrantType === 'team' ? entrantId : undefined,
      };
    });

    if (entrantType === 'rider') {
      return riderEntries;
    }

    return [
      {
        categoryId: categoryIds[0],
        categoryIds,
        entrantType,
        eventId,
        id: entrantId,
        memberParticipantIds,
        name: nonEmpty(importedTeam?.name) || entrantNameFromMembers(members),
        teamMembers: enrichedMembers,
      },
      ...riderEntries,
    ];
  });
};

const normalizeEntrantChanges = (
  changes: Partial<Pick<EventCatalogEntrant, 'categoryId' | 'categoryIds' | 'dateOfBirth' | 'entrantType' | 'firstName' | 'gender' | 'lastName' | 'memberParticipantIds' | 'name' | 'notes' | 'teamEntrantId' | 'teamMembers'>>
): Partial<Pick<EventCatalogEntrant, 'categoryId' | 'categoryIds' | 'dateOfBirth' | 'entrantType' | 'firstName' | 'gender' | 'lastName' | 'memberParticipantIds' | 'name' | 'notes' | 'teamEntrantId' | 'teamMembers'>> => {
  if (!hasOwn(changes, 'categoryId')) {
    return changes;
  }

  const categoryId = nonEmpty(changes.categoryId);
  return {
    ...changes,
    categoryId,
    categoryIds: categoryId ? [categoryId] : [],
  };
};

const hasSameMembers = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const hasSameSerializedValue = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

const hasSameCategoryScaffold = (existing: EventCatalogCategory, next: EventCatalogCategory): boolean => {
  return existing.code === next.code &&
    existing.description === next.description &&
    existing.distance === next.distance &&
    hasSameSerializedValue(existing.distanceRule, next.distanceRule) &&
    existing.duration === next.duration &&
    existing.excludeFromResults === next.excludeFromResults &&
    existing.name === next.name &&
    existing.startTime === next.startTime &&
    hasSameSerializedValue(existing.teamRules, next.teamRules);
};

const hasSameEntrantScaffold = (existing: EventCatalogEntrant, next: EventCatalogEntrant): boolean => {
  return existing.categoryId === next.categoryId &&
    hasSameMembers(existing.categoryIds, next.categoryIds) &&
    existing.dateOfBirth === next.dateOfBirth &&
    existing.entrantType === next.entrantType &&
    existing.firstName === next.firstName &&
    existing.gender === next.gender &&
    existing.lastName === next.lastName &&
    hasSameMembers(existing.memberParticipantIds, next.memberParticipantIds) &&
    existing.name === next.name &&
    existing.notes === next.notes &&
    existing.teamEntrantId === next.teamEntrantId &&
    hasSameSerializedValue(existing.teamMembers, next.teamMembers);
};

const getCategoryScaffoldChanges = (category: EventCatalogCategory): NonNullable<Extract<EventCatalogMutation, { type: 'category-updated' }>['changes']> => ({
  code: category.code,
  description: category.description,
  distance: category.distance,
  distanceRule: category.distanceRule,
  duration: category.duration,
  excludeFromResults: category.excludeFromResults,
  name: category.name,
  startTime: category.startTime,
  teamRules: category.teamRules,
});

const getEntrantScaffoldChanges = (entrant: EventCatalogEntrant): NonNullable<Extract<EventCatalogMutation, { type: 'entrant-updated' }>['changes']> => ({
  categoryId: entrant.categoryId,
  categoryIds: entrant.categoryIds,
  dateOfBirth: entrant.dateOfBirth,
  entrantType: entrant.entrantType,
  firstName: entrant.firstName,
  gender: entrant.gender,
  lastName: entrant.lastName,
  memberParticipantIds: entrant.memberParticipantIds,
  name: entrant.name,
  notes: entrant.notes,
  teamEntrantId: entrant.teamEntrantId,
  teamMembers: entrant.teamMembers,
});

const assertUuid = (errors: string[], label: string, value: string | undefined): void => {
  if (!value || !validateUuid(value)) {
    errors.push(`${label} "${value || ''}" is not a valid UUID.`);
  }
};

const validateEventCatalogStateIds = (state: EventCatalogState): void => {
  const errors: string[] = [];
  const eventsById = new Map(state.events.map((event) => [event.id, event]));
  const categoriesById = new Map(state.categories.map((category) => [category.id, category]));
  const entrantsById = new Map(state.entrants.map((entrant) => [entrant.id, entrant]));
  const sessionsById = new Map(state.sessions.map((session) => [session.id, session]));
  const deletedEventIds = new Set(state.deletedEventIds);

  state.events.forEach((event) => {
    assertUuid(errors, 'event.id', event.id);
    event.categoryIds.forEach((categoryId) => assertUuid(errors, `event ${event.id} categoryId`, categoryId));
    event.entrantIds.forEach((entrantId) => assertUuid(errors, `event ${event.id} entrantId`, entrantId));
    event.sessionIds.forEach((sessionId) => assertUuid(errors, `event ${event.id} sessionId`, sessionId));
  });
  state.categories.forEach((category) => {
    assertUuid(errors, 'category.id', category.id);
    assertUuid(errors, `category ${category.id} eventId`, category.eventId);
    if (!eventsById.has(category.eventId) && !deletedEventIds.has(category.eventId)) {
      errors.push(`category ${category.id} references missing parent event ${category.eventId}.`);
    }
  });
  state.entrants.forEach((entrant) => {
    assertUuid(errors, 'entrant.id', entrant.id);
    assertUuid(errors, `entrant ${entrant.id} eventId`, entrant.eventId);
    entrant.categoryIds.forEach((categoryId) => assertUuid(errors, `entrant ${entrant.id} categoryId`, categoryId));
    entrant.memberParticipantIds.forEach((participantId) => assertUuid(errors, `entrant ${entrant.id} memberParticipantId`, participantId));
    if (!eventsById.has(entrant.eventId) && !deletedEventIds.has(entrant.eventId)) {
      errors.push(`entrant ${entrant.id} references missing parent event ${entrant.eventId}.`);
    }
  });
  state.sessions.forEach((session) => {
    assertUuid(errors, 'session.id', session.id);
    assertUuid(errors, `session ${session.id} eventId`, session.eventId);
    if (!eventsById.has(session.eventId) && !deletedEventIds.has(session.eventId)) {
      errors.push(`session ${session.id} references missing parent event ${session.eventId}.`);
    }
  });
  if (state.activeEventId) {
    assertUuid(errors, 'activeEventId', state.activeEventId);
    if (!eventsById.has(state.activeEventId)) {
      errors.push(`activeEventId ${state.activeEventId} does not reference an existing event.`);
    }
  }
  if (state.activeSessionId) {
    assertUuid(errors, 'activeSessionId', state.activeSessionId);
    const activeSession = sessionsById.get(state.activeSessionId);
    if (!activeSession) {
      errors.push(`activeSessionId ${state.activeSessionId} does not reference an existing session.`);
    } else if (state.activeEventId && activeSession.eventId !== state.activeEventId) {
      errors.push(`activeSessionId ${state.activeSessionId} belongs to event ${activeSession.eventId}, not active event ${state.activeEventId}.`);
    }
  }

  state.events.forEach((event) => {
    event.categoryIds.forEach((categoryId) => {
      const category = categoriesById.get(categoryId);
      if (!category || category.eventId !== event.id) {
        errors.push(`event ${event.id} categoryIds contains ${categoryId}, but that category does not belong to the event.`);
      }
    });
    event.entrantIds.forEach((entrantId) => {
      const entrant = entrantsById.get(entrantId);
      if (!entrant || entrant.eventId !== event.id) {
        errors.push(`event ${event.id} entrantIds contains ${entrantId}, but that entrant does not belong to the event.`);
      }
    });
    event.sessionIds.forEach((sessionId) => {
      const session = sessionsById.get(sessionId);
      if (!session || session.eventId !== event.id) {
        errors.push(`event ${event.id} sessionIds contains ${sessionId}, but that session does not belong to the event.`);
      }
    });
  });

  if (errors.length > 0) {
    throw new Error(`Loaded event catalog ledger contains invalid IDs or parent relationships:\n${errors.join('\n')}`);
  }
};

const createLedgerRelationshipRepairMutations = (state: EventCatalogState): EventCatalogLedger['mutations'] => {
  const categoriesByEventId = new Map<string, string[]>();
  const entrantsByEventId = new Map<string, string[]>();
  const sessionsByEventId = new Map<string, string[]>();

  state.categories.forEach((category) => {
    categoriesByEventId.set(category.eventId, [...(categoriesByEventId.get(category.eventId) || []), category.id]);
  });
  state.entrants.forEach((entrant) => {
    entrantsByEventId.set(entrant.eventId, [...(entrantsByEventId.get(entrant.eventId) || []), entrant.id]);
  });
  state.sessions.forEach((session) => {
    sessionsByEventId.set(session.eventId, [...(sessionsByEventId.get(session.eventId) || []), session.id]);
  });

  return state.events.flatMap((event) => {
    const categoryIds = unique([
      ...event.categoryIds.filter((categoryId) => categoriesByEventId.get(event.id)?.includes(categoryId)),
      ...(categoriesByEventId.get(event.id) || []),
    ]);
    const entrantIds = unique([
      ...event.entrantIds.filter((entrantId) => entrantsByEventId.get(event.id)?.includes(entrantId)),
      ...(entrantsByEventId.get(event.id) || []),
    ]);
    const sessionIds = unique([
      ...event.sessionIds.filter((sessionId) => sessionsByEventId.get(event.id)?.includes(sessionId)),
      ...(sessionsByEventId.get(event.id) || []),
    ]);

    if (
      hasSameMembers(event.categoryIds, categoryIds) &&
      hasSameMembers(event.entrantIds, entrantIds) &&
      hasSameMembers(event.sessionIds, sessionIds)
    ) {
      return [];
    }

    return [{
      changes: {
        categoryIds,
        entrantIds,
        sessionIds,
      },
      eventId: event.id,
      id: createMutationId(),
      timestamp: createTimestamp(),
      type: 'event-updated' as const,
    }];
  });
};

const repairAndValidateLoadedLedger = (ledger: EventCatalogLedger): EventCatalogLedger => {
  let repairedLedger = rewriteImportedObjectIds(ledger).value;
  const repairMutations = createLedgerRelationshipRepairMutations(applyEventCatalogLedger(repairedLedger));
  if (repairMutations.length > 0) {
    repairedLedger = {
      ...repairedLedger,
      mutations: [...repairedLedger.mutations, ...repairMutations],
    };
  }

  validateEventCatalogStateIds(applyEventCatalogLedger(repairedLedger));
  return repairedLedger;
};

export class EventCatalogService {
  private ledger: EventCatalogLedger;
  private state: EventCatalogState;
  private readonly options: EventCatalogServiceOptions;
  private readonly persistence: EventCatalogPersistence;

  private constructor(persistence: EventCatalogPersistence, ledger: EventCatalogLedger, options: EventCatalogServiceOptions = {}) {
    this.ledger = ledger;
    this.options = options;
    this.persistence = persistence;
    this.state = applyEventCatalogLedger(ledger);
  }

  public static async create(persistence: EventCatalogPersistence, options: EventCatalogServiceOptions = {}): Promise<EventCatalogService> {
    assertEventCatalogPersistence(persistence);
    let ledger: EventCatalogLedger = await persistence.load();
    if (ledger.mutations.length === 0) {
      ledger = createSeedEventCatalogLedger();
      await persistence.save(ledger);
      if (options.onPersistedLedger) {
        await options.onPersistedLedger(ledger);
      }
    } else {
      const repairedLedger: EventCatalogLedger = repairAndValidateLoadedLedger(ledger);
      if (JSON.stringify(repairedLedger) !== JSON.stringify(ledger)) {
        ledger = repairedLedger;
        await persistence.save(ledger);
        if (options.onPersistedLedger) {
          await options.onPersistedLedger(ledger);
        }
      } else {
        ledger = repairedLedger;
      }
    }

    return new EventCatalogService(persistence, ledger, options);
  }

  public get catalog(): EventCatalogState {
    return this.state;
  }

  public getImportedRaceStateMetadata(eventId: EventId, sessionId: SessionId): ImportedRaceStateMetadata | undefined {
    const mutation = [...this.ledger.mutations].reverse().find((candidate) => {
      return candidate.type === 'race-state-imported' &&
        candidate.eventId === eventId &&
        candidate.sessionId === sessionId;
    });

    if (mutation?.type !== 'race-state-imported') {
      return undefined;
    }

    return {
      apicalDataFilePath: mutation.apicalDataFilePath,
      raceState: reviveRaceStateDates(mutation.raceState),
    };
  }

  public getImportedRaceState(eventId: EventId, sessionId: SessionId): Partial<RaceState> | undefined {
    return this.getImportedRaceStateMetadata(eventId, sessionId)?.raceState;
  }

  public async createEvent(): Promise<EventCatalogState> {
    const eventId = createEventId();
    return this.appendMutations([
      {
        event: {
          categoryIds: [],
          date: createTimestamp().slice(0, 10),
          entrantIds: [],
          format: 'race-weekend',
          id: eventId,
          name: 'New Event',
          sessionIds: [],
          timeZone: getSystemTimeZone(),
        },
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: 'event-created',
      },
    ]);
  }

  public async activateEvent(eventId: EventId): Promise<EventCatalogState> {
    return this.appendMutations([
      {
        eventId,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: 'event-activated',
      },
    ]);
  }

  public async updateEvent(eventId: EventId, changes: { date?: string; format?: EventCatalogState['events'][number]['format']; name?: string; timeZone?: string; }): Promise<EventCatalogState> {
    return this.appendMutations([
      {
        changes,
        eventId,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: 'event-updated',
      },
    ]);
  }

  public async deleteEvent(eventId: EventId): Promise<EventCatalogState> {
    return this.appendMutations([
      {
        eventId,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: 'event-deleted',
      },
    ]);
  }

  public async syncEventScaffold(
    eventId: EventId,
    categories: EventCategory[],
    participants: EventParticipant[],
    masterProfiles: MasterEntrantProfile[] = [],
    teams: EventTeam[] = [],
    assignedSessionId?: SessionId
  ): Promise<EventCatalogState> {
    const event = this.state.events.find((item) => item.id === eventId);
    const assignedSession = assignedSessionId
      ? this.state.sessions.find((session) => session.id === assignedSessionId)
      : undefined;

    const scaffoldCategories = deriveCategoriesFromEventData(eventId, categories, participants, teams);
    const categoryIds = scaffoldCategories.map((category) => category.id.toString());
    const entrants = deriveEntrantsFromParticipants(eventId, participants, masterProfiles, teams);

    const existingCategoriesById = new Map(this.state.categories
      .filter((category) => category.eventId === eventId)
      .map((category) => [category.id.toString(), category] as const));
    const existingEntrantsById = new Map(getEntrantsForEvent(this.state, eventId).map((entrant) => [entrant.id.toString(), entrant] as const));
    const categoryMutations = scaffoldCategories.map((category) => {
      const existingCategory = existingCategoriesById.get(category.id.toString());
      if (existingCategory) {
        if (hasSameCategoryScaffold(existingCategory, category)) {
          return undefined;
        }

        return {
          categoryId: category.id,
          changes: getCategoryScaffoldChanges(category),
          id: createMutationId(),
          timestamp: createTimestamp(),
          type: 'category-updated' as const,
        };
      }

      return {
        category,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: 'category-created' as const,
      };
    }).filter((mutation): mutation is NonNullable<typeof mutation> => mutation !== undefined);

    const sessionCategoryMutation = assignedSession
      ? (() => {
        const nextCategoryIds = mergeSessionCategoryIds(assignedSession.categoryIds, categoryIds);
        if (hasSameMembers(assignedSession.categoryIds || [], nextCategoryIds)) {
          return undefined;
        }

        return {
          changes: {
            categoryIds: nextCategoryIds,
          },
          id: createMutationId(),
          sessionId: assignedSession.id,
          timestamp: createTimestamp(),
          type: 'session-updated' as const,
        };
      })()
      : undefined;

    const entrantMutations = entrants.map((entrant) => {
      const existingEntrant = existingEntrantsById.get(entrant.id.toString());
      if (existingEntrant) {
        if (hasSameEntrantScaffold(existingEntrant, entrant)) {
          return undefined;
        }

        return {
          changes: getEntrantScaffoldChanges(entrant),
          entrantId: entrant.id,
          id: createMutationId(),
          timestamp: createTimestamp(),
          type: 'entrant-updated' as const,
        };
      }

      return {
        entrant,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: 'entrant-created' as const,
      };
    }).filter((mutation): mutation is NonNullable<typeof mutation> => mutation !== undefined);

    const eventCategoryIds = [...(event?.categoryIds || [])];
    const eventEntrantIds = [...(event?.entrantIds || [])];
    const eventSessionIds = [...(event?.sessionIds || [])];
    const nextEventCategoryIds = unique([...eventCategoryIds, ...categoryIds]);
    const nextEventEntrantIds = entrants.map((entrant) => entrant.id);
    const nextEventSessionIds = eventSessionIds;
    const eventChanges = event && (
      !hasSameMembers(eventCategoryIds, nextEventCategoryIds) ||
      !hasSameMembers(eventEntrantIds, nextEventEntrantIds) ||
      !hasSameMembers(eventSessionIds, nextEventSessionIds)
    ) ? {
      categoryIds: nextEventCategoryIds,
      entrantIds: nextEventEntrantIds,
      sessionIds: nextEventSessionIds,
    } : undefined;

    if (categoryMutations.length === 0 && entrantMutations.length === 0 && !eventChanges) {
      if (!sessionCategoryMutation) {
        return this.state;
      }
    }

    return this.appendMutations([
      ...categoryMutations,
      ...entrantMutations,
      ...(sessionCategoryMutation ? [sessionCategoryMutation] : []),
      ...(eventChanges ? [{
        changes: eventChanges,
        eventId,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: 'event-updated' as const,
      }] : []),
    ]);
  }

  public async importApicalRaceState(importData: ApicalCatalogImport, masterProfiles: MasterEntrantProfile[] = []): Promise<EventCatalogState> {
    const normalizedImportData = rewriteImportedObjectIds(importData).value;
    normalizedImportData.raceState = {
      ...normalizedImportData.raceState,
      categories: normalizeCategoriesForResultExclusion(normalizedImportData.raceState.categories || []),
    };
    const existingEvent = this.state.events.find((event) => event.id === normalizedImportData.eventId);
    const existingSession = this.state.sessions.find((session) => session.id === normalizedImportData.sessionId);
    const sessionIds = Array.from(new Set([...(existingEvent?.sessionIds || []), normalizedImportData.sessionId]));
    const mutations: EventCatalogLedger['mutations'] = [];
    const scheduledStart = normalizedImportData.eventDate ? new Date(normalizedImportData.eventDate).toISOString() : createTimestamp();
    const timeZone = normalizedImportData.timeZone || existingEvent?.timeZone || getSystemTimeZone();
    const existingImportedRaceState = this.getImportedRaceStateMetadata(normalizedImportData.eventId, normalizedImportData.sessionId);
    const derivedCategories = deriveCategoriesFromEventData(
      normalizedImportData.eventId,
      normalizedImportData.raceState.categories || [],
      normalizedImportData.raceState.participants || [],
      normalizedImportData.raceState.teams || []
    );
    const categoryIds = derivedCategories.map((category) => category.id.toString());
    const derivedEntrants = deriveEntrantsFromParticipants(
      normalizedImportData.eventId,
      normalizedImportData.raceState.participants || [],
      masterProfiles,
      normalizedImportData.raceState.teams || []
    );
    const existingCategories = new Map(getCategoriesForEvent(this.state, normalizedImportData.eventId).map((category) => [category.id.toString(), category] as const));
    const existingEntrants = new Map(getEntrantsForEvent(this.state, normalizedImportData.eventId).map((entrant) => [entrant.id.toString(), entrant] as const));
    const importMatchesExistingState = existingEvent &&
      existingSession &&
      existingEvent.name === normalizedImportData.eventName &&
      existingEvent.timeZone === timeZone &&
      existingEvent.date === scheduledStart.slice(0, 10) &&
      hasSameSerializedValue(existingImportedRaceState?.apicalDataFilePath, normalizedImportData.apicalDataFilePath) &&
      hasSameSerializedValue(existingImportedRaceState?.raceState, normalizedImportData.raceState);
    const scaffoldMatchesExistingState = derivedCategories.every((category) => {
      const existingCategory = existingCategories.get(category.id.toString());
      return !!existingCategory && hasSameCategoryScaffold(existingCategory, category);
    }) &&
      derivedEntrants.every((entrant) => {
        const existingEntrant = existingEntrants.get(entrant.id.toString());
        return !!existingEntrant && hasSameEntrantScaffold(existingEntrant, entrant);
      }) &&
      derivedCategories.every((category) => (existingSession?.categoryIds || []).includes(category.id));

    if (importMatchesExistingState && scaffoldMatchesExistingState) {
      return this.state;
    }

    if (!existingEvent) {
      mutations.push({
        event: {
          categoryIds: [],
          date: scheduledStart.slice(0, 10),
          entrantIds: [],
          format: 'race-weekend',
          id: normalizedImportData.eventId,
          name: normalizedImportData.eventName,
          sessionIds,
          timeZone,
        },
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: 'event-created',
      });
    } else {
      mutations.push({
        changes: {
          date: scheduledStart.slice(0, 10),
          name: normalizedImportData.eventName,
          sessionIds,
          timeZone,
        },
        eventId: normalizedImportData.eventId,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: 'event-updated',
      });
    }

    if (!existingSession) {
      mutations.push({
        id: createMutationId(),
        session: {
          categoryIds: categoryIds,
          eventId: normalizedImportData.eventId,
          id: normalizedImportData.sessionId,
          kind: 'race',
          name: normalizedImportData.eventName,
          notes: 'Imported from Apical data file endpoint.',
          scheduledStart,
          status: 'completed',
        },
        timestamp: createTimestamp(),
        type: 'session-created',
      });
    } else {
      mutations.push({
        changes: {
          name: normalizedImportData.eventName,
          scheduledStart,
        },
        id: createMutationId(),
        sessionId: normalizedImportData.sessionId,
        timestamp: createTimestamp(),
        type: 'session-updated',
      });
    }

    mutations.push({
      apicalDataFilePath: normalizedImportData.apicalDataFilePath,
      eventId: normalizedImportData.eventId,
      id: createMutationId(),
      raceState: normalizedImportData.raceState,
      sessionId: normalizedImportData.sessionId,
      timestamp: createTimestamp(),
      type: 'race-state-imported',
    });

    if (mutations.length > 0) {
      await this.appendMutations(mutations);
    }

    return this.syncEventScaffold(
      normalizedImportData.eventId,
      normalizedImportData.raceState.categories || [],
      normalizedImportData.raceState.participants || [],
      masterProfiles,
      normalizedImportData.raceState.teams || [],
      normalizedImportData.sessionId
    );
  }

  public async updateImportedRaceState(
    eventId: EventId,
    sessionId: SessionId,
    raceState: Partial<RaceState>,
    apicalDataFilePath?: string
  ): Promise<EventCatalogState> {
    const existingMetadata = this.getImportedRaceStateMetadata(eventId, sessionId);

    return this.appendMutations([
      {
        apicalDataFilePath: apicalDataFilePath ?? existingMetadata?.apicalDataFilePath,
        eventId,
        id: createMutationId(),
        raceState,
        sessionId,
        timestamp: createTimestamp(),
        type: 'race-state-imported',
      },
    ]);
  }

  public async reloadImportedRaceState(
    eventId: EventId,
    sessionId: SessionId,
    raceState: Partial<RaceState>,
    apicalDataFilePath?: string,
    masterProfiles: MasterEntrantProfile[] = []
  ): Promise<EventCatalogState> {
    const normalizedRaceState = rewriteImportedObjectIds(raceState).value;
    normalizedRaceState.categories = normalizeCategoriesForResultExclusion(normalizedRaceState.categories || []);
    const linkedCategorySafeRaceState = addMissingLinkedCategoryPlaceholders(normalizedRaceState);
    const existingMetadata = this.getImportedRaceStateMetadata(eventId, sessionId);
    const replayMutations = this.getManualScaffoldMutationsAfterLatestImport(eventId, sessionId, masterProfiles);

    await this.appendMutations([
      {
        apicalDataFilePath: apicalDataFilePath ?? existingMetadata?.apicalDataFilePath,
        eventId,
        id: createMutationId(),
        raceState: linkedCategorySafeRaceState,
        sessionId,
        timestamp: createTimestamp(),
        type: 'race-state-imported',
      },
    ]);

    await this.syncEventScaffold(
      eventId,
      linkedCategorySafeRaceState.categories || [],
      linkedCategorySafeRaceState.participants || [],
      masterProfiles,
      linkedCategorySafeRaceState.teams || [],
      sessionId
    );

    return replayMutations.length > 0
      ? this.appendMutations(replayMutations)
      : this.state;
  }

  public async createSession(eventId: EventId): Promise<EventCatalogState> {
    const sessionId = createSessionId();
    const session: EventCatalogSession = {
      categoryIds: [],
      eventId,
      id: sessionId,
      kind: 'practice',
      name: 'New Session',
      notes: '',
      scheduledStart: createTimestamp(),
      status: 'draft',
    };
    const event = this.state.events.find((item) => item.id === eventId);

    return this.appendMutations([
      {
        id: createMutationId(),
        session,
        timestamp: createTimestamp(),
        type: 'session-created',
      },
      {
        changes: {
          sessionIds: [...(event?.sessionIds || []), sessionId],
        },
        eventId,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: 'event-updated',
      },
    ]);
  }

  public async updateSession(sessionId: SessionId, changes: Partial<Pick<EventCatalogSession, 'categoryIds' | 'kind' | 'name' | 'notes' | 'scheduledStart' | 'status'>>): Promise<EventCatalogState> {
    return this.appendMutations([
      {
        changes,
        id: createMutationId(),
        sessionId,
        timestamp: createTimestamp(),
        type: 'session-updated',
      },
    ]);
  }

  public async moveSessionToEvent(sessionId: SessionId, nextEventId: EventId): Promise<EventCatalogState> {
    const session = this.state.sessions.find((item) => item.id === sessionId);
    const nextEvent = this.state.events.find((item) => item.id === nextEventId);
    if (!session || !nextEvent || session.eventId === nextEventId) {
      return this.state;
    }

    const previousEvent = this.state.events.find((item) => item.id === session.eventId);
    const mutations: EventCatalogLedger['mutations'] = [
      {
        changes: {
          eventId: nextEventId,
        },
        id: createMutationId(),
        sessionId,
        timestamp: createTimestamp(),
        type: 'session-updated',
      },
      {
        changes: {
          sessionIds: unique([...(nextEvent.sessionIds || []), sessionId]),
        },
        eventId: nextEventId,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: 'event-updated',
      },
    ];

    if (previousEvent) {
      mutations.push({
        changes: {
          sessionIds: (previousEvent.sessionIds || []).filter((id) => id !== sessionId),
        },
        eventId: previousEvent.id,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: 'event-updated',
      });
    }

    return this.appendMutations(mutations);
  }

  public async activateSession(eventId: EventId, sessionId: SessionId): Promise<EventCatalogState> {
    return this.appendMutations([
      {
        eventId,
        id: createMutationId(),
        sessionId,
        timestamp: createTimestamp(),
        type: 'session-activated',
      },
      {
        changes: {
          status: 'live',
        },
        id: createMutationId(),
        sessionId,
        timestamp: createTimestamp(),
        type: 'session-updated',
      },
    ]);
  }

  public async deleteSession(eventId: EventId, sessionId: SessionId): Promise<EventCatalogState> {
    const event = this.state.events.find((item) => item.id === eventId);
    return this.appendMutations([
      {
        id: createMutationId(),
        sessionId,
        timestamp: createTimestamp(),
        type: 'session-deleted',
      },
      {
        changes: {
          sessionIds: (event?.sessionIds || []).filter((id) => id !== sessionId),
        },
        eventId,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: 'event-updated',
      },
    ]);
  }

  public async createCategory(eventId: EventId): Promise<EventCatalogState> {
    const categoryId = createCategoryId();
    const category: EventCatalogCategory = {
      code: '',
      description: '',
      distanceRule: {
        kind: 'unspecified',
      },
      eventId,
      id: categoryId,
      name: 'New Category',
      teamRules: {
        teamCompositionRules: [],
      },
    };
    const event = this.state.events.find((item) => item.id === eventId);

    return this.appendMutations([
      {
        category,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: 'category-created',
      },
      {
        changes: {
          categoryIds: [...(event?.categoryIds || []), categoryId],
        },
        eventId,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: 'event-updated',
      },
    ]);
  }

  public async updateCategory(categoryId: CategoryId, changes: Partial<Pick<EventCatalogCategory, 'code' | 'deleted' | 'description' | 'distance' | 'distanceRule' | 'duration' | 'excludeFromResults' | 'name' | 'startTime' | 'teamRules'>>): Promise<EventCatalogState> {
    return this.appendMutations([
      {
        categoryId,
        changes,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: 'category-updated',
      },
    ]);
  }

  public async deleteCategory(eventId: EventId, categoryId: CategoryId): Promise<EventCatalogState> {
    const event = this.state.events.find((item) => item.id === eventId);

    return this.appendMutations([
      {
        categoryId,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: 'category-deleted',
      },
      {
        changes: {
          categoryIds: (event?.categoryIds || []).filter((id) => id !== categoryId),
        },
        eventId,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: 'event-updated',
      },
    ]);
  }

  public async createEntrant(eventId: EventId, entrantType: EntrantType = 'rider'): Promise<EventCatalogState> {
    const entrantId = createEventEntrantId();
    const event = this.state.events.find((item) => item.id === eventId);
    const categoryId = event?.categoryIds[0];
    const entrant: EventCatalogEntrant = {
      categoryId,
      categoryIds: categoryId ? [categoryId] : [],
      entrantType,
      eventId,
      id: entrantId,
      memberParticipantIds: [],
      name: entrantType === 'team' ? 'New Team' : 'New Entrant',
      notes: '',
      teamMembers: entrantType === 'team' ? [] : undefined,
    };

    return this.appendMutations([
      {
        entrant,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: 'entrant-created',
      },
      {
        changes: {
          entrantIds: [...(event?.entrantIds || []), entrantId],
        },
        eventId,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: 'event-updated',
      },
    ]);
  }

  public async updateEntrant(entrantId: EventEntrantId, changes: Partial<Pick<EventCatalogEntrant, 'categoryId' | 'categoryIds' | 'dateOfBirth' | 'entrantType' | 'firstName' | 'gender' | 'lastName' | 'memberParticipantIds' | 'name' | 'notes' | 'teamEntrantId' | 'teamMembers'>>): Promise<EventCatalogState> {
    return this.appendMutations([
      {
        changes: normalizeEntrantChanges(changes),
        entrantId,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: 'entrant-updated',
      },
    ]);
  }

  public async deleteEntrant(eventId: EventId, entrantId: EventEntrantId): Promise<EventCatalogState> {
    const event = this.state.events.find((item) => item.id === eventId);

    return this.appendMutations([
      {
        entrantId,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: 'entrant-deleted',
      },
      {
        changes: {
          entrantIds: (event?.entrantIds || []).filter((id) => id !== entrantId),
        },
        eventId,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: 'event-updated',
      },
    ]);
  }

  private async appendMutations(mutations: EventCatalogLedger['mutations']): Promise<EventCatalogState> {
    this.ledger = {
      ...this.ledger,
      mutations: [...this.ledger.mutations, ...mutations],
    };
    await this.persist();
    return this.state;
  }

  private cloneReplayMutation<TMutation extends EventCatalogMutation>(mutation: TMutation): TMutation {
    return {
      ...mutation,
      id: createMutationId(),
      timestamp: createTimestamp(),
    };
  }

  private getManualScaffoldMutationsAfterLatestImport(
    eventId: EventId,
    sessionId: SessionId,
    masterProfiles: MasterEntrantProfile[]
  ): EventCatalogLedger['mutations'] {
    const latestImportIndex = this.ledger.mutations.findLastIndex((mutation) => {
      return mutation.type === 'race-state-imported' &&
        mutation.eventId === eventId &&
        mutation.sessionId === sessionId;
    });
    if (latestImportIndex < 0) {
      return [];
    }

    const importedRaceState = this.getImportedRaceState(eventId, sessionId);
    const importedCategories = deriveCategoriesFromEventData(
      eventId,
      importedRaceState?.categories || [],
      importedRaceState?.participants || [],
      importedRaceState?.teams || []
    );
    const importedEntrants = deriveEntrantsFromParticipants(
      eventId,
      importedRaceState?.participants || [],
      masterProfiles,
      importedRaceState?.teams || []
    );
    const importedCategoryChangesById = new Map(importedCategories.map((category) => [
      category.id.toString(),
      getCategoryScaffoldChanges(category),
    ] as const));
    const importedEntrantChangesById = new Map(importedEntrants.map((entrant) => [
      entrant.id.toString(),
      getEntrantScaffoldChanges(entrant),
    ] as const));

    return this.ledger.mutations.slice(latestImportIndex + 1).reduce<EventCatalogLedger['mutations']>((replayMutations, mutation) => {
      if (mutation.type === 'category-updated') {
        const importedChanges = importedCategoryChangesById.get(mutation.categoryId.toString());
        if (!importedChanges || !hasSameSerializedValue(mutation.changes, importedChanges)) {
          replayMutations.push(this.cloneReplayMutation(mutation));
        }
        return replayMutations;
      }

      if (mutation.type === 'entrant-updated') {
        const importedChanges = importedEntrantChangesById.get(mutation.entrantId.toString());
        if (!importedChanges || !hasSameSerializedValue(mutation.changes, importedChanges)) {
          replayMutations.push(this.cloneReplayMutation(mutation));
        }
        return replayMutations;
      }

      if (mutation.type === 'category-deleted' || mutation.type === 'entrant-deleted') {
        replayMutations.push(this.cloneReplayMutation(mutation));
      }

      return replayMutations;
    }, []);
  }

  private async persist(): Promise<void> {
    this.state = applyEventCatalogLedger(this.ledger);
    await this.persistence.save(this.ledger);
    if (this.options.onPersistedLedger) {
      await this.options.onPersistedLedger(this.ledger);
    }
  }
}
