import {
  type CategoryDistanceRule,
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
import type { EventCategory } from '../model/eventcategory.js';
import type { EventParticipant } from '../model/eventparticipant.js';
import type { MasterEntrantProfile } from './systemConfig.js';

interface EventCatalogServiceOptions {
  onPersistedLedger?: (ledger: EventCatalogLedger) => Promise<void>;
}

const createMutationId = (): string => `event-catalog-${Date.now()}-${Math.round(Math.random() * 100000)}`;
const createTimestamp = (): string => new Date().toISOString();
const createEntityId = (prefix: string): string => `${prefix}-${Date.now()}-${Math.round(Math.random() * 100000)}`;

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

const deriveCategoriesFromEventData = (eventId: string, categories: EventCategory[], participants: EventParticipant[]): EventCatalogCategory[] => {
  const byId = new Map<string, EventCatalogCategory>();

  categories.forEach((category) => {
    const id = category.id.toString();
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
  eventId: string,
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

  return Array.from(groups.entries()).map(([entrantId, members]) => {
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
    const primaryMember = members[0];
    const primaryProfile = primaryMember ? findProfileForParticipant(primaryMember, masterProfiles) : undefined;
    const entrantType = members.length > 1 ? 'team' : 'rider';
    const riderFirstName = entrantType === 'rider'
      ? (nonEmpty(primaryMember?.firstname) || nonEmpty(primaryProfile?.firstName))
      : undefined;
    const riderLastName = entrantType === 'rider'
      ? (nonEmpty(primaryMember?.surname) || nonEmpty(primaryProfile?.lastName))
      : undefined;
    const riderCategoryId = entrantType === 'rider'
      ? (nonEmpty(primaryMember?.categoryId?.toString()) || nonEmpty(primaryProfile?.categoryId))
      : undefined;
    const riderName = [riderFirstName, riderLastName].filter((part) => !!part).join(' ').trim();

    return {
      categoryId: riderCategoryId,
      categoryIds,
      dateOfBirth: entrantType === 'rider' ? nonEmpty(primaryProfile?.dateOfBirth) : undefined,
      entrantType,
      eventId,
      firstName: riderFirstName,
      gender: entrantType === 'rider' ? nonEmpty(primaryProfile?.gender) : undefined,
      id: entrantId,
      lastName: riderLastName,
      memberParticipantIds,
      name: riderName || entrantNameFromMembers(members),
      sessionIds: [...defaultSessionIds],
      teamMembers: entrantType === 'team'
        ? enrichedMembers
        : undefined,
    };
  });
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
    let ledger = await persistence.load();
    if (ledger.mutations.length === 0) {
      ledger = createSeedEventCatalogLedger();
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

  public async createEvent(): Promise<EventCatalogState> {
    const eventId = createEntityId('event');
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
        },
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: 'event-created',
      },
    ]);
  }

  public async activateEvent(eventId: string): Promise<EventCatalogState> {
    return this.appendMutations([
      {
        eventId,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: 'event-activated',
      },
    ]);
  }

  public async updateEvent(eventId: string, changes: { date?: string; format?: EventCatalogState['events'][number]['format']; name?: string; }): Promise<EventCatalogState> {
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

  public async syncEventScaffold(eventId: string, categories: EventCategory[], participants: EventParticipant[], masterProfiles: MasterEntrantProfile[] = []): Promise<EventCatalogState> {
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

  public async createSession(eventId: string): Promise<EventCatalogState> {
    const sessionId = createEntityId('session');
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

  public async deleteSession(eventId: string, sessionId: string): Promise<EventCatalogState> {
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

  public async createCategory(eventId: string): Promise<EventCatalogState> {
    const categoryId = createEntityId('category');
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

  public async updateCategory(categoryId: string, changes: Partial<Pick<EventCatalogCategory, 'code' | 'description' | 'distance' | 'distanceRule' | 'duration' | 'name' | 'sessionAssignments' | 'startTime' | 'teamRules'>>): Promise<EventCatalogState> {
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

  public async deleteCategory(eventId: string, categoryId: string): Promise<EventCatalogState> {
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

  public async createEntrant(eventId: string): Promise<EventCatalogState> {
    const entrantId = createEntityId('entrant');
    const event = this.state.events.find((item) => item.id === eventId);
    const entrant: EventCatalogEntrant = {
      categoryIds: [...(event?.categoryIds || [])],
      entrantType: 'rider',
      eventId,
      id: entrantId,
      memberParticipantIds: [],
      name: 'New Entrant',
      notes: '',
      sessionIds: [...(event?.sessionIds || [])],
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

  public async updateEntrant(entrantId: string, changes: Partial<Pick<EventCatalogEntrant, 'categoryId' | 'categoryIds' | 'dateOfBirth' | 'entrantType' | 'firstName' | 'gender' | 'lastName' | 'memberParticipantIds' | 'name' | 'notes' | 'sessionIds' | 'teamMembers'>>): Promise<EventCatalogState> {
    return this.appendMutations([
      {
        changes,
        entrantId,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: 'entrant-updated',
      },
    ]);
  }

  public async deleteEntrant(eventId: string, entrantId: string): Promise<EventCatalogState> {
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
