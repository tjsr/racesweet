import { validate as validateUuid } from 'uuid';
import { CategoryId } from '../controllers/category.js';
import { EventEntrantId } from '../model/entrant.js';
import type { EventCategory } from '../model/eventcategory.js';
import type { EventParticipant } from '../model/eventparticipant.js';
import { createCategoryId, createEventEntrantId, createEventId, createSessionId, rewriteImportedObjectIds } from '../model/ids.js';
import { EventId, SessionId } from '../model/raceevent.js';
import type { RaceState } from '../model/racestate.js';
import type { TimeRecord } from '../model/timerecord.js';
import {
  type CategoryDistanceRule,
  type EntrantType,
  type EventCatalogCategory,
  type EventCatalogEntrant,
  type EventCatalogLedger,
  type EventCatalogSession,
  type EventCatalogState,
  applyEventCatalogLedger,
  createSeedEventCatalogLedger,
  getEntrantsForEvent,
} from './eventCatalog.js';
import type { EventCatalogPersistence } from './eventCatalogPersistence.js';
import type { MasterEntrantProfile } from './systemConfig.js';
import { getSystemTimeZone } from './utils/timeutils.js';

interface ApicalCatalogImport {
  apicalDataFilePath?: string;
  eventDate?: string;
  eventId: string;
  eventName: string;
  raceState: Partial<RaceState>;
  sessionId: string;
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

const createMutationId = (): string => `event-catalog-${Date.now()}-${Math.round(Math.random() * 100000)}`;
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

const deriveCategoriesFromEventData = (eventId: EventId, categories: EventCategory[], participants: EventParticipant[]): EventCatalogCategory[] => {
  const byId = new Map<EventId, EventCatalogCategory>();

  categories.forEach((category) => {
    const id = validateUuid(category.id) ? category.id : createCategoryId(category.id);
    byId.set(id, {
      ...category,
      distanceRule: deriveDistanceRule(category),
      eventId,
      sessionAssignments: category.startTime
        ? [
          {
            sessionId: '',
            startTime: category.startTime,
          },
        ]
        : [],
      teamRules: {
        teamCompositionRules: [],
      },
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
        sessionAssignments: [],
        teamRules: {
          teamCompositionRules: [],
        },
      });
    }
  });

  return Array.from(byId.values());
};

const deriveEntrantsFromParticipants = (
  eventId: EventId,
  participants: EventParticipant[],
  defaultSessionIds: string[],
  masterProfiles: MasterEntrantProfile[] = []
): EventCatalogEntrant[] => {
  const groups = new Map<string, EventParticipant[]>();
  participants.forEach((participant) => {
    const entrantId = nonEmpty(participant.entrantId?.toString()) || participant.id.toString();
    const existing = groups.get(entrantId) || [];
    existing.push(participant);
    groups.set(entrantId, existing);
  });

  return Array.from(groups.entries()).flatMap(([entrantId, members]) => {
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

    const categoryIds = unique(enrichedMembers.map((member) => member.categoryId || ''));
    const memberParticipantIds = unique(enrichedMembers.map((member) => member.participantId));
    const entrantType = members.length > 1 ? 'team' : 'rider';
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
        sessionIds: [...defaultSessionIds],
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
        name: entrantNameFromMembers(members),
        sessionIds: [...defaultSessionIds],
        teamMembers: enrichedMembers,
      },
      ...riderEntries,
    ];
  });
};

const normalizeEntrantChanges = (
  changes: Partial<Pick<EventCatalogEntrant, 'categoryId' | 'categoryIds' | 'dateOfBirth' | 'entrantType' | 'firstName' | 'gender' | 'lastName' | 'memberParticipantIds' | 'name' | 'notes' | 'sessionIds' | 'teamEntrantId' | 'teamMembers'>>
): Partial<Pick<EventCatalogEntrant, 'categoryId' | 'categoryIds' | 'dateOfBirth' | 'entrantType' | 'firstName' | 'gender' | 'lastName' | 'memberParticipantIds' | 'name' | 'notes' | 'sessionIds' | 'teamEntrantId' | 'teamMembers'>> => {
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
    let ledger = await persistence.load();
    if (ledger.mutations.length === 0) {
      ledger = rewriteImportedObjectIds(createSeedEventCatalogLedger()).value;
      await persistence.save(ledger);
      if (options.onPersistedLedger) {
        await options.onPersistedLedger(ledger);
      }
    }

    return new EventCatalogService(persistence, ledger, options);
  }

  public get catalog(): EventCatalogState {
    return this.state;
  }

  public getImportedRaceStateMetadata(eventId: string, sessionId: string): ImportedRaceStateMetadata | undefined {
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

  public getImportedRaceState(eventId: string, sessionId: string): Partial<RaceState> | undefined {
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

  public async syncEventScaffold(eventId: EventId, categories: EventCategory[], participants: EventParticipant[], masterProfiles: MasterEntrantProfile[] = []): Promise<EventCatalogState> {
    const event = this.state.events.find((item) => item.id === eventId);
    const sessionIds = event?.sessionIds || this.state.sessions.filter((session) => session.eventId === eventId).map((session) => session.id.toString());

    const scaffoldCategories = deriveCategoriesFromEventData(eventId, categories, participants);
    const categoryIds = scaffoldCategories.map((category) => category.id.toString());
    const entrants = deriveEntrantsFromParticipants(eventId, participants, sessionIds, masterProfiles);

    const existingCategoryIds = new Set(this.state.categories.filter((category) => category.eventId === eventId).map((category) => category.id.toString()));
    const categoryMutations = scaffoldCategories.map((category) => {
      if (existingCategoryIds.has(category.id.toString())) {
        return {
          categoryId: category.id,
          changes: {
            code: category.code,
            description: category.description,
            distance: category.distance,
            distanceRule: category.distanceRule,
            duration: category.duration,
            name: category.name,
            sessionAssignments: category.sessionAssignments,
            startTime: category.startTime,
            teamRules: category.teamRules,
          },
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
    });

    const existingEntrantsById = new Set(getEntrantsForEvent(this.state, eventId).map((entrant) => entrant.id));
    const entrantMutations = entrants.map((entrant) => {
      if (existingEntrantsById.has(entrant.id)) {
        return {
          changes: {
            categoryId: entrant.categoryId,
            categoryIds: entrant.categoryIds,
            dateOfBirth: entrant.dateOfBirth,
            entrantType: entrant.entrantType,
            firstName: entrant.firstName,
            gender: entrant.gender,
            lastName: entrant.lastName,
            memberParticipantIds: entrant.memberParticipantIds,
            name: entrant.name,
            sessionIds: entrant.sessionIds,
            teamEntrantId: entrant.teamEntrantId,
            teamMembers: entrant.teamMembers,
          },
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
    });

    return this.appendMutations([
      ...categoryMutations,
      ...entrantMutations,
      {
        changes: {
          categoryIds,
          entrantIds: entrants.map((entrant) => entrant.id),
        },
        eventId,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: 'event-updated',
      },
    ]);
  }

  public async importApicalRaceState(importData: ApicalCatalogImport, masterProfiles: MasterEntrantProfile[] = []): Promise<EventCatalogState> {
    const normalizedImportData = rewriteImportedObjectIds(importData).value;
    const existingEvent = this.state.events.find((event) => event.id === normalizedImportData.eventId);
    const existingSession = this.state.sessions.find((session) => session.id === normalizedImportData.sessionId);
    const sessionIds = Array.from(new Set([...(existingEvent?.sessionIds || []), normalizedImportData.sessionId]));
    const mutations: EventCatalogLedger['mutations'] = [];
    const scheduledStart = normalizedImportData.eventDate ? new Date(normalizedImportData.eventDate).toISOString() : createTimestamp();
    const timeZone = normalizedImportData.timeZone || existingEvent?.timeZone || getSystemTimeZone();

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
      masterProfiles
    );
  }

  public async createSession(eventId: string): Promise<EventCatalogState> {
    const sessionId = createSessionId();
    const session: EventCatalogSession = {
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

  public async updateSession(sessionId: string, changes: Partial<Pick<EventCatalogSession, 'kind' | 'name' | 'notes' | 'scheduledStart' | 'status'>>): Promise<EventCatalogState> {
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

  public async moveSessionToEvent(sessionId: string, nextEventId: string): Promise<EventCatalogState> {
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
      sessionAssignments: [],
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

  public async updateCategory(categoryId: CategoryId, changes: Partial<Pick<EventCatalogCategory, 'code' | 'description' | 'distance' | 'distanceRule' | 'duration' | 'name' | 'sessionAssignments' | 'startTime' | 'teamRules'>>): Promise<EventCatalogState> {
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
      sessionIds: [...(event?.sessionIds || [])],
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

  public async updateEntrant(entrantId: EventEntrantId, changes: Partial<Pick<EventCatalogEntrant, 'categoryId' | 'categoryIds' | 'dateOfBirth' | 'entrantType' | 'firstName' | 'gender' | 'lastName' | 'memberParticipantIds' | 'name' | 'notes' | 'sessionIds' | 'teamEntrantId' | 'teamMembers'>>): Promise<EventCatalogState> {
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

  private async persist(): Promise<void> {
    this.state = applyEventCatalogLedger(this.ledger);
    await this.persistence.save(this.ledger);
    if (this.options.onPersistedLedger) {
      await this.options.onPersistedLedger(this.ledger);
    }
  }
}
