import { validate as validateUuid } from 'uuid';
import { normalizeCategoryResultExclusion } from '../controllers/category.js';
import type { EventCategory } from '../model/eventcategory.js';
import { getParticipantEntryId, type EventEntry } from '../model/entry.js';
import type { EventParticipant } from '../model/eventparticipant.js';
import type { EventTeam } from '../model/eventteam.js';
import { rewriteImportedObjectIds } from '../model/ids.js';
import { getParticipantDisplayName } from '../model/participantDisplay.js';
import type { RaceState } from '../model/racestate.js';
import type { TimeRecord, TimeRecordSource } from '../model/timerecord.js';
import { incrementLoadingMetric } from '../loadingMetrics.js';
import type { EventCatalogEntrant, EventCatalogEvent, EventCatalogSession, EventCatalogState, EventSessionKind } from '../catalog/eventCatalog.js';
import { addMissingLinkedCategoryPlaceholders } from '../service/sessionSourceReload.js';

interface SessionSourceSink {
  addCategories(categories: EventCategory[]): Promise<unknown>;
  addEntries?(entries: EventEntry[]): void;
  addParticipants(participants: EventParticipant[]): void;
  addRecords(records: TimeRecord[], validate?: boolean): Promise<void>;
  addTeams?(teams: EventTeam[]): void;
  addTimeRecordSources?(timeRecordSources: TimeRecordSource[]): void;
  beginBulkProcess?(): Promise<boolean>;
  categories: EventCategory[];
  endBulkProcess?(): Promise<void>;
  records: TimeRecord[];
  setFinishLineNumbers?(finishLineNumbers: number[] | undefined): void;
  setMinimumLapTimeMilliseconds?(minimumLapTimeMilliseconds: number | undefined): void;
  setSessionValidCategoryIds?(sessionValidCategoryIds: Set<string> | undefined): void;
  setSessionKind?(sessionKind: EventSessionKind | undefined): void;
}

interface SessionSourceApplicationOptions {
  catalog?: EventCatalogState;
  eventId?: string;
  finishLineNumbers?: number[];
  sessionId?: string;
}

export const getMinimumLapTimeMillisecondsForSession = (
  catalog: EventCatalogState | undefined,
  eventId: string | undefined,
  sessionId: string | undefined
): number | undefined => {
  const session = catalog?.sessions.find((item) => item.id === sessionId);
  const event = catalog?.events.find((item) => item.id === (eventId || session?.eventId));

  return session?.minimumLapTimeMilliseconds ?? event?.minimumLapTimeMilliseconds ?? undefined;
};

export const getSessionKindForSession = (
  catalog: EventCatalogState | undefined,
  sessionId: string | undefined
): EventSessionKind | undefined => {
  return catalog?.sessions.find((item) => item.id === sessionId)?.kind;
};

export const getSessionAssignedCategoryIds = (
  catalog: EventCatalogState | undefined,
  eventId: string | undefined,
  sessionId: string | undefined
): Set<string> | undefined => {
  if (!catalog || !eventId || !sessionId) {
    return undefined;
  }

  const session = catalog.sessions.find((item) => item.id === sessionId && item.eventId === eventId);
  const assignedCategoryIds = (session?.categoryIds || []).map((categoryId) => categoryId.toString());

  return assignedCategoryIds.length > 0 ? new Set(assignedCategoryIds) : undefined;
};

interface EntrantCatalogMatch {
  entrant: EventCatalogEntrant;
  event: EventCatalogEvent;
  matchKind: 'entrant' | 'member';
}

const assertUuid = (errors: string[], label: string, value: string | undefined | null): void => {
  if (!value || !validateUuid(value)) {
    errors.push(`${label} "${value || ''}" is not a valid UUID.`);
  }
};

const getRecordStringValue = (record: TimeRecord, key: string): string | undefined => {
  const value = (record as unknown as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
};

const getRecordStringArrayValue = (record: TimeRecord, key: string): string[] => {
  const value = (record as unknown as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
};

const getEntrantCatalogMatches = (
  catalog: EventCatalogState | undefined,
  entrantId: string
): EntrantCatalogMatch[] => {
  if (!catalog) {
    return [];
  }

  const activeEventsById = new Map(catalog.events
    .filter((event) => !catalog.deletedEventIds.includes(event.id))
    .map((event) => [event.id, event] as const));

  return catalog.entrants.reduce<EntrantCatalogMatch[]>((matches, entrant) => {
    const event = activeEventsById.get(entrant.eventId);
    if (!event) {
      return matches;
    }

    if (entrant.id === entrantId) {
      matches.push({ entrant, event, matchKind: 'entrant' });
      return matches;
    }

    if (entrant.memberParticipantIds.includes(entrantId)) {
      matches.push({ entrant, event, matchKind: 'member' });
    }

    return matches;
  }, []);
};

const formatEntrantCatalogSearch = (
  catalog: EventCatalogState | undefined,
  entrantId: string
): string => {
  if (!catalog) {
    return 'Catalog search was not available.';
  }

  const matches = getEntrantCatalogMatches(catalog, entrantId);
  if (matches.length === 0) {
    return 'Catalog search: entrant ID was not found in any active event.';
  }

  const matchSummary = matches.map(({ entrant, event, matchKind }) => {
    const relation = matchKind === 'entrant'
      ? `${entrant.entrantType} entrant`
      : `member of ${entrant.entrantType} entrant`;
    return `${event.name} (${event.id}): ${relation} "${entrant.name}" (${entrant.id})`;
  });

  return `Catalog search: found ${matches.length} possible match${matches.length === 1 ? '' : 'es'}: ${matchSummary.join('; ')}.`;
};

const formatEventContext = (event: EventCatalogEvent | undefined, eventId: string): string => {
  return event
    ? `event "${event.name}" (${event.id})`
    : `event ${eventId}`;
};

const formatSessionContext = (session: EventCatalogSession | undefined, sessionId: string): string => {
  return session
    ? `session "${session.name}" (${session.id})`
    : `session ${sessionId}`;
};

const formatRaceStateValidationContext = (options: SessionSourceApplicationOptions): string => {
  const contextParts: string[] = [];

  if (options.eventId) {
    const event = options.catalog?.events.find((candidate) => candidate.id === options.eventId);
    contextParts.push(formatEventContext(event, options.eventId));
  }

  if (options.sessionId) {
    const session = options.catalog?.sessions.find((candidate) => candidate.id === options.sessionId);
    contextParts.push(formatSessionContext(session, options.sessionId));
  }

  return contextParts.length > 0
    ? ` for ${contextParts.join(', ')}`
    : '';
};

const catalogHasEntrantForEvent = (
  options: SessionSourceApplicationOptions,
  entrantId: string
): boolean => {
  if (!options.catalog || !options.eventId) {
    return false;
  }

  const event = options.catalog.events.find((candidate) => candidate.id === options.eventId);
  const entrant = options.catalog.entrants.find((candidate) => candidate.id === entrantId && candidate.eventId === options.eventId);

  return !!event?.entrantIds.includes(entrantId) && !!entrant;
};

const validateRaceStateIds = (
  raceState: Partial<RaceState>,
  existingCategories: EventCategory[],
  options: SessionSourceApplicationOptions = {}
): void => {
  const errors: string[] = [];
  const categoryIds = new Set<string>();
  const entryIds = new Set<string>();
  const participantIds = new Set<string>();
  const teamIds = new Set<string>();
  const recordIds = new Set<string>();

  existingCategories.forEach((category) => {
    assertUuid(errors, 'existing category.id', category.id);
    categoryIds.add(category.id);
  });

  (raceState.categories || []).forEach((category) => {
    assertUuid(errors, 'category.id', category.id);
    categoryIds.add(category.id);
  });

  (raceState.participants || []).forEach((participant) => {
    assertUuid(errors, 'participant.id', participant.id);
    if (!participant.entrantId) {
      assertUuid(errors, `participant ${participant.id} categoryId`, participant.categoryId);
    }
    assertUuid(errors, `participant ${participant.id} entrantId`, participant.entrantId);
    participantIds.add(participant.id);
    if (participant.categoryId && !categoryIds.has(participant.categoryId)) {
      errors.push(`participant ${participant.id} references missing category ${participant.categoryId}.`);
    }
  });

  (raceState.entries || []).forEach((entry) => {
    assertUuid(errors, 'entry.id', entry.id);
    assertUuid(errors, `entry ${entry.id} eventId`, entry.eventId);
    entryIds.add(entry.id);
    if (entry.categoryId) {
      assertUuid(errors, `entry ${entry.id} categoryId`, entry.categoryId);
      if (!categoryIds.has(entry.categoryId)) {
        errors.push(`entry ${entry.id} references missing category ${entry.categoryId}.`);
      }
    }
    entry.participantIds.forEach((participantId) => {
      assertUuid(errors, `entry ${entry.id} participantId`, participantId);
      if (!participantIds.has(participantId)) {
        errors.push(`entry ${entry.id} references missing participant ${participantId}.`);
      }
    });
  });

  (raceState.participants || []).forEach((participant) => {
    if (entryIds.size > 0 && participant.entryId && !entryIds.has(participant.entryId)) {
      errors.push(`participant ${participant.id} references missing entry ${participant.entryId}.`);
    }
  });

  (raceState.teams || []).forEach((team) => {
    assertUuid(errors, 'team.id', team.id);
    assertUuid(errors, `team ${team.id} categoryId`, team.categoryId);
    teamIds.add(team.id);
    if (team.categoryId && !categoryIds.has(team.categoryId)) {
      errors.push(`team ${team.id} references missing category ${team.categoryId}.`);
    }
    team.members.forEach((participantId) => {
      assertUuid(errors, `team ${team.id} member participantId`, participantId);
      if (!participantIds.has(participantId)) {
        errors.push(`team ${team.id} references missing participant ${participantId}.`);
      }
    });
  });

  (raceState.participants || []).forEach((participant) => {
    if (participant.entrantId && !teamIds.has(participant.entrantId) && !participantIds.has(participant.entrantId) && !catalogHasEntrantForEvent(options, participant.entrantId)) {
      errors.push(
        `participant ${participant.id} (${getParticipantDisplayName(participant)}) references missing entrant ${participant.entrantId}. ${formatEntrantCatalogSearch(options.catalog, participant.entrantId)}`
      );
    }
  });

  (raceState.records || []).forEach((record) => {
    assertUuid(errors, 'record.id', record.id);
    assertUuid(errors, `record ${record.id} source`, record.source);
    recordIds.add(record.id);
    const participantId = getRecordStringValue(record, 'participantId');
    const entrantId = getRecordStringValue(record, 'entrantId');
    const eventId = getRecordStringValue(record, 'eventId');
    const sessionId = getRecordStringValue(record, 'sessionId');
    const participantStartRecordId = getRecordStringValue(record, 'participantStartRecordId');
    const startingLapRecordId = getRecordStringValue(record, 'startingLapRecordId');
    if (eventId) {
      assertUuid(errors, `record ${record.id} eventId`, eventId);
    }
    if (sessionId) {
      assertUuid(errors, `record ${record.id} sessionId`, sessionId);
    }
    if (participantId) {
      assertUuid(errors, `record ${record.id} participantId`, participantId);
      if (!participantIds.has(participantId)) {
        errors.push(`record ${record.id} references missing participant ${participantId}.`);
      }
    }
    if (entrantId) {
      assertUuid(errors, `record ${record.id} entrantId`, entrantId);
      if (!teamIds.has(entrantId) && !participantIds.has(entrantId) && !catalogHasEntrantForEvent(options, entrantId)) {
        errors.push(`record ${record.id} references missing entrant ${entrantId}.`);
      }
    }
    getRecordStringArrayValue(record, 'categoryIds').forEach((categoryId) => {
      assertUuid(errors, `record ${record.id} categoryId`, categoryId);
      if (!categoryIds.has(categoryId)) {
        errors.push(`record ${record.id} references missing category ${categoryId}.`);
      }
    });
    if (participantStartRecordId) {
      assertUuid(errors, `record ${record.id} participantStartRecordId`, participantStartRecordId);
    }
    if (startingLapRecordId) {
      assertUuid(errors, `record ${record.id} startingLapRecordId`, startingLapRecordId);
    }
  });

  (raceState.records || []).forEach((record) => {
    const participantStartRecordId = getRecordStringValue(record, 'participantStartRecordId');
    const startingLapRecordId = getRecordStringValue(record, 'startingLapRecordId');
    if (participantStartRecordId && !recordIds.has(participantStartRecordId)) {
      errors.push(`record ${record.id} references missing participantStartRecord ${participantStartRecordId}.`);
    }
    if (startingLapRecordId && !recordIds.has(startingLapRecordId)) {
      errors.push(`record ${record.id} references missing startingLapRecord ${startingLapRecordId}.`);
    }
  });

  if (errors.length > 0) {
    throw new Error(`Pulled race state contains invalid IDs or parent relationships${formatRaceStateValidationContext(options)}:\n${errors.join('\n')}`);
  }
};

const normalizeRaceStateForSession = (
  raceState: Partial<RaceState>,
  existingCategories: EventCategory[],
  options: SessionSourceApplicationOptions = {}
): Partial<RaceState> => {
  const rewrittenRaceState = rewriteImportedObjectIds(raceState).value;
  const normalizedRaceState = {
    ...rewrittenRaceState,
    categories: (rewrittenRaceState.categories || []).map((category) => normalizeCategoryResultExclusion(category)),
  };
  const catalogEntrants = options.catalog?.entrants.filter(
    (entrant) => entrant.eventId === options.eventId,
  ) || [];
  const normalizedParticipants = (normalizedRaceState.participants || []).map((participant) => {
    const driver = catalogEntrants.find((entrant) => (
      entrant.entrantType === 'rider' && entrant.memberParticipantIds.includes(participant.id)
    ));
    return driver
      ? {
          ...participant,
          firstname: driver.firstName || participant.firstname,
          surname: driver.lastName || participant.surname,
        }
      : participant;
  });
  const catalogEntriesById = new Map((options.catalog?.entries || [])
    .filter((entry) => entry.eventId === options.eventId)
    .map((entry) => [entry.id.toString(), entry] as const));
  const participantIdsByEntryId = new Map<string, EventParticipant['id'][]>();
  normalizedParticipants.forEach((participant) => {
    const entryId = getParticipantEntryId(participant).toString();
    participantIdsByEntryId.set(entryId, [
      ...(participantIdsByEntryId.get(entryId) || []),
      participant.id,
    ]);
  });
  const entriesById = new Map<string, EventEntry>((normalizedRaceState.entries || [])
    .filter((entry) => participantIdsByEntryId.has(entry.id.toString()))
    .map((entry): [string, EventEntry] => {
    const catalogEntry = catalogEntriesById.get(entry.id.toString());
    return [entry.id.toString(), {
      ...entry,
      categoryId: catalogEntry?.categoryId || entry.categoryId,
      entrantId: catalogEntry?.entrantId || entry.entrantId,
      identifiers: catalogEntry?.identifiers.length ? [...catalogEntry.identifiers] : entry.identifiers,
      participantIds: participantIdsByEntryId.get(entry.id.toString()) || [],
      raceNumber: catalogEntry?.raceNumber || entry.raceNumber,
    }];
  }));
  normalizedParticipants.forEach((participant) => {
    const entryId = getParticipantEntryId(participant);
    const existingEntry = entriesById.get(entryId.toString());
    if (existingEntry) {
      existingEntry.participantIds = Array.from(new Set([...existingEntry.participantIds, participant.id]));
      return;
    }
    const catalogEntry = catalogEntriesById.get(entryId.toString());
    if (catalogEntry) {
      entriesById.set(entryId.toString(), {
        ...catalogEntry,
        identifiers: [...catalogEntry.identifiers],
        participantIds: Array.from(new Set([...catalogEntry.participantIds, participant.id])),
      });
      return;
    }
    const entrant = catalogEntrants.find(
      (candidate) => candidate.id === participant.entrantId || candidate.memberParticipantIds.includes(participant.id),
    );
    const eventId = options.eventId || entrant?.eventId;
    if (!eventId) {
      return;
    }
    entriesById.set(entryId.toString(), {
      categoryId: entrant?.categoryId || entrant?.categoryIds[0] || participant.categoryId,
      entrantId: entrant?.id || participant.entrantId,
      eventId,
      id: entryId,
      identifiers: [...(entrant?.identifiers || participant.identifiers)],
      name: entrant?.name || getParticipantDisplayName(participant),
      participantIds: [participant.id],
      raceNumber: undefined,
    });
  });
  const linkedCategorySafeRaceState = addMissingLinkedCategoryPlaceholders({
    ...normalizedRaceState,
    entries: Array.from(entriesById.values()),
    participants: normalizedParticipants,
  });
  validateRaceStateIds(linkedCategorySafeRaceState, existingCategories, options);
  return linkedCategorySafeRaceState;
};

const getUniqueCategories = (categories: EventCategory[]): EventCategory[] => {
  const byId = new Map<string, EventCategory>();
  categories.forEach((category) => {
    byId.set(category.id.toString(), category);
  });
  return Array.from(byId.values());
};

const normalizeCategoryText = (value?: string): string => (value || '').trim().toLowerCase();

const categorySeriesKey = (category: EventCategory): string => {
  const code = normalizeCategoryText(category.code);
  const name = normalizeCategoryText(category.name);
  return `${code}|${name}`;
};

export const getCategoriesToAdd = (
  existingCategories: EventCategory[],
  incomingCategories: EventCategory[]
): EventCategory[] => {
  const existingIds = new Set(existingCategories.map((category) => category.id.toString()));
  const existingSeries = new Set(existingCategories.map((category) => categorySeriesKey(category)));
  return getUniqueCategories(incomingCategories).filter((category) => {
    if (existingIds.has(category.id.toString())) {
      return false;
    }

    const seriesKey = categorySeriesKey(category);
    if (existingSeries.has(seriesKey)) {
      return false;
    }

    existingSeries.add(seriesKey);
    return true;
  });
};

export const applyPulledRaceStateToSession = async (
  sessionState: SessionSourceSink,
  raceState: Partial<RaceState>,
  options: SessionSourceApplicationOptions = {}
): Promise<void> => {
  incrementLoadingMetric('Apply pulled race state to session', options.sessionId || options.eventId);
  const normalizedRaceState = normalizeRaceStateForSession(raceState, sessionState.categories, options);
  (normalizedRaceState.categories || []).forEach((category) => incrementLoadingMetric('Normalize pulled category', category.name || category.id.toString()));
  (normalizedRaceState.participants || []).forEach((participant) => incrementLoadingMetric('Normalize pulled participant', participant.id.toString()));
  (normalizedRaceState.teams || []).forEach((team) => incrementLoadingMetric('Normalize pulled team', team.id.toString()));
  (normalizedRaceState.timeRecordSources || []).forEach((source) => incrementLoadingMetric('Normalize pulled source', source.name || source.id.toString()));
  ((normalizedRaceState.records as TimeRecord[]) || []).forEach((record) => incrementLoadingMetric('Normalize pulled record', record.id.toString()));
  const bulkStarted = await sessionState.beginBulkProcess?.() === true;
  try {
    sessionState.setMinimumLapTimeMilliseconds?.(getMinimumLapTimeMillisecondsForSession(
      options.catalog,
      options.eventId,
      options.sessionId
    ));
    sessionState.setSessionValidCategoryIds?.(getSessionAssignedCategoryIds(
      options.catalog,
      options.eventId,
      options.sessionId
    ));
    sessionState.setFinishLineNumbers?.(options.finishLineNumbers);
    sessionState.setSessionKind?.(getSessionKindForSession(options.catalog, options.sessionId));
    const categoriesToAdd = getCategoriesToAdd(
      sessionState.categories,
      normalizedRaceState.categories || []
    );
    if (categoriesToAdd.length > 0) {
      try {
        await sessionState.addCategories(categoriesToAdd);
      } catch (error: unknown) {
        const message = (error as Error)?.message || '';
        if (!message.includes('already exists')) {
          throw error;
        }
      }
    }
    const assignedCategoryIds = getSessionAssignedCategoryIds(
      options.catalog,
      options.eventId,
      options.sessionId,
    );
    const requiredCatalogCategories = (options.catalog?.categories || []).filter((category) => (
      category.deleted !== true &&
      category.eventId === options.eventId &&
      assignedCategoryIds?.has(category.id.toString()) &&
      !sessionState.categories.some((existing) => existing.id === category.id)
    ));
    if (requiredCatalogCategories.length > 0) {
      await sessionState.addCategories(requiredCatalogCategories);
    }

    sessionState.addEntries?.(normalizedRaceState.entries || []);
    sessionState.addParticipants(normalizedRaceState.participants || []);
    sessionState.addTeams?.(normalizedRaceState.teams || []);
    sessionState.addTimeRecordSources?.(normalizedRaceState.timeRecordSources || []);
    const incomingRecords = (normalizedRaceState.records as TimeRecord[]) || [];
    await sessionState.addRecords(incomingRecords, false);
  } finally {
    if (bulkStarted) {
      await sessionState.endBulkProcess?.();
    }
  }
};
