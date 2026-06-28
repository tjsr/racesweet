import type { EventCategory } from '../model/eventcategory.js';
import type { EventParticipant } from '../model/eventparticipant.js';
import type { EventTeam } from '../model/eventteam.js';
import type { RaceState } from '../model/racestate.js';
import type { TimeRecord } from '../model/timerecord.js';
import { normalizeCategoryResultExclusion } from '../controllers/category.js';
import { rewriteImportedObjectIds } from '../model/ids.js';
import { validate as validateUuid } from 'uuid';
import { addMissingLinkedCategoryPlaceholders } from './sessionSourceReload.js';

interface SessionSourceSink {
  addCategories(categories: EventCategory[]): Promise<unknown>;
  addParticipants(participants: EventParticipant[]): void;
  addRecords(records: TimeRecord[], validate?: boolean): Promise<void>;
  addTeams?(teams: EventTeam[]): void;
  categories: EventCategory[];
  records: TimeRecord[];
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

const validateRaceStateIds = (raceState: Partial<RaceState>, existingCategories: EventCategory[]): void => {
  const errors: string[] = [];
  const categoryIds = new Set<string>();
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
    assertUuid(errors, `participant ${participant.id} categoryId`, participant.categoryId);
    assertUuid(errors, `participant ${participant.id} entrantId`, participant.entrantId);
    participantIds.add(participant.id);
    if (participant.categoryId && !categoryIds.has(participant.categoryId)) {
      errors.push(`participant ${participant.id} references missing category ${participant.categoryId}.`);
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
    if (participant.entrantId && !teamIds.has(participant.entrantId) && !participantIds.has(participant.entrantId)) {
      errors.push(`participant ${participant.id} references missing entrant ${participant.entrantId}.`);
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
      if (!teamIds.has(entrantId) && !participantIds.has(entrantId)) {
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
    throw new Error(`Pulled race state contains invalid IDs or parent relationships:\n${errors.join('\n')}`);
  }
};

const normalizeRaceStateForSession = (
  raceState: Partial<RaceState>,
  existingCategories: EventCategory[]
): Partial<RaceState> => {
  const rewrittenRaceState = rewriteImportedObjectIds(raceState).value;
  const normalizedRaceState = {
    ...rewrittenRaceState,
    categories: (rewrittenRaceState.categories || []).map((category) => normalizeCategoryResultExclusion(category)),
  };
  const linkedCategorySafeRaceState = addMissingLinkedCategoryPlaceholders(normalizedRaceState);
  validateRaceStateIds(linkedCategorySafeRaceState, existingCategories);
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
  raceState: Partial<RaceState>
): Promise<void> => {
  const normalizedRaceState = normalizeRaceStateForSession(raceState, sessionState.categories);
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

  sessionState.addParticipants(normalizedRaceState.participants || []);
  sessionState.addTeams?.(normalizedRaceState.teams || []);
  const incomingRecords = (normalizedRaceState.records as TimeRecord[]) || [];
  await sessionState.addRecords(incomingRecords, false);
};
