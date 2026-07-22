import { isFlagRecord } from '../processing/flag.js';
import { isCrossingRecord } from '../processing/timerecord.js';
import type { EventCategory } from '../model/eventcategory.js';
import type { EventParticipant } from '../model/eventparticipant.js';
import type { EventTeam } from '../model/eventteam.js';
import type { RaceState } from '../model/racestate.js';
import type { TimeRecord } from '../model/timerecord.js';
import {
  type SessionSourceReloadMode,
  type SessionSourceReloadSummary,
  type SessionSourceReloadSummaryCounts,
} from '../model/sessionSourceReload.js';

export {
  SESSION_SOURCE_RELOAD_OPTIONS,
  type SessionSourceReloadMode,
  type SessionSourceReloadSummary,
  type SessionSourceReloadSummaryCounts,
} from '../model/sessionSourceReload.js';

export interface SessionSourceReloadMergeOptions {
  categoryIdsAssignedToSessions?: Set<string>;
  pruneEmptyReloadEntities?: boolean;
}

export const createEmptySessionSourceReloadSummary = (): SessionSourceReloadSummary => ({
  categories: { created: 0, deleted: 0, updated: 0 },
  crossings: { created: 0, deleted: 0, updated: 0 },
  events: { created: 0, deleted: 0, updated: 0 },
  flags: { created: 0, deleted: 0, updated: 0 },
  participants: { created: 0, deleted: 0, updated: 0 },
  sessions: { created: 0, deleted: 0, updated: 0 },
  teams: { created: 0, deleted: 0, updated: 0 },
});

const getRecordCategoryIds = (record: TimeRecord): string[] => {
  const categoryIds = (record as unknown as { categoryIds?: unknown }).categoryIds;
  return Array.isArray(categoryIds)
    ? categoryIds.filter((categoryId): categoryId is string => typeof categoryId === 'string' && categoryId.trim().length > 0)
    : [];
};

const getRecordEntrantId = (record: TimeRecord): string | undefined => {
  const entrantId = (record as unknown as { entrantId?: unknown }).entrantId;
  return typeof entrantId === 'string' && entrantId.trim().length > 0 ? entrantId : undefined;
};

const getRecordParticipantId = (record: TimeRecord): string | undefined => {
  const participantId = (record as unknown as { participantId?: unknown }).participantId;
  return typeof participantId === 'string' && participantId.trim().length > 0 ? participantId : undefined;
};

const getRecordPlateNumber = (record: TimeRecord): string | undefined => {
  const plateNumber = (record as unknown as { plateNumber?: unknown }).plateNumber;
  if (typeof plateNumber === 'number') {
    return plateNumber.toString();
  }

  return typeof plateNumber === 'string' && plateNumber.trim().length > 0 ? plateNumber : undefined;
};

const getParticipantPlateNumbers = (participant: EventParticipant): string[] => {
  return participant.identifiers.flatMap((identifier) => {
    const racePlate = (identifier as unknown as { racePlate?: unknown }).racePlate;
    if (typeof racePlate === 'number') {
      return [racePlate.toString()];
    }
    if (typeof racePlate === 'string' && racePlate.trim().length > 0) {
      return [racePlate];
    }

    return [];
  });
};

const hasParticipantReloadRecord = (participant: EventParticipant, records: TimeRecord[]): boolean => {
  const plateNumbers = new Set(getParticipantPlateNumbers(participant));
  return records.some((record) => {
    const participantId = getRecordParticipantId(record);
    if (participantId === participant.id.toString()) {
      return true;
    }

    const entrantId = getRecordEntrantId(record);
    if (entrantId === participant.entrantId.toString() || entrantId === participant.id.toString()) {
      return true;
    }

    const plateNumber = getRecordPlateNumber(record);
    return plateNumber !== undefined && plateNumbers.has(plateNumber);
  });
};

const pruneReloadRaceState = (
  existingRaceState: Partial<RaceState> | undefined,
  nextRaceState: Partial<RaceState>,
  options: SessionSourceReloadMergeOptions = {}
): Partial<RaceState> => {
  if (!options.pruneEmptyReloadEntities) {
    return nextRaceState;
  }

  const records = nextRaceState.records || [];
  const existingParticipantIds = new Set((existingRaceState?.participants || []).map((participant) => participant.id.toString()));
  const existingTeamIds = new Set((existingRaceState?.teams || []).map((team) => team.id.toString()));
  const keptParticipants = (nextRaceState.participants || []).filter((participant) => {
    const wasAddedDuringReload = !existingParticipantIds.has(participant.id.toString());
    if (wasAddedDuringReload) {
      return true;
    }

    return getParticipantPlateNumbers(participant).length > 0 && hasParticipantReloadRecord(participant, records);
  });
  const keptParticipantIds = new Set(keptParticipants.map((participant) => participant.id.toString()));
  const keptEntries = (nextRaceState.entries || []).flatMap((entry) => {
    const participantIds = entry.participantIds.filter((participantId) => keptParticipantIds.has(participantId.toString()));
    return participantIds.length > 0 ? [{ ...entry, participantIds }] : [];
  });
  const keptTeams = (nextRaceState.teams || []).flatMap((team): EventTeam[] => {
    const wasAddedDuringReload = !existingTeamIds.has(team.id.toString());
    const members = team.members.filter((memberId) => keptParticipantIds.has(memberId.toString()));
    if (wasAddedDuringReload || members.length > 0) {
      return [{ ...team, members }];
    }

    return [];
  });
  const categoryIdsWithEntrants = new Set<string>();
  keptParticipants.forEach((participant) => {
    if (participant.categoryId) {
      categoryIdsWithEntrants.add(participant.categoryId.toString());
    }
  });
  keptEntries.forEach((entry) => {
    if (entry.categoryId) {
      categoryIdsWithEntrants.add(entry.categoryId.toString());
    }
  });
  keptTeams.forEach((team) => {
    if (team.categoryId) {
      categoryIdsWithEntrants.add(team.categoryId.toString());
    }
  });

  const categories = (nextRaceState.categories || []).filter((category) => {
    const categoryId = category.id.toString();
    return categoryIdsWithEntrants.has(categoryId) || options.categoryIdsAssignedToSessions?.has(categoryId);
  });

  return {
    ...nextRaceState,
    categories,
    entries: keptEntries,
    participants: keptParticipants,
    teams: keptTeams,
  };
};

const normalizeForComparison = (value: unknown): unknown => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeForComparison(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalizeForComparison(item)]));
  }

  return value;
};

const hasSameReloadValue = (left: unknown, right: unknown): boolean => {
  return JSON.stringify(normalizeForComparison(left)) === JSON.stringify(normalizeForComparison(right));
};

const countReloadChanges = <T extends { id: string }>(
  existingItems: T[],
  nextItems: T[],
  countMatchingIdsAsUpdated: boolean
): SessionSourceReloadSummaryCounts => {
  const existingById = new Map(existingItems.map((item) => [item.id.toString(), item] as const));
  const nextById = new Map(nextItems.map((item) => [item.id.toString(), item] as const));

  const created = Array.from(nextById.keys()).filter((id) => !existingById.has(id)).length;
  const deleted = Array.from(existingById.keys()).filter((id) => !nextById.has(id)).length;
  const updated = Array.from(nextById.entries()).filter(([id, nextItem]) => {
    const existingItem = existingById.get(id);
    return existingItem !== undefined && (countMatchingIdsAsUpdated || !hasSameReloadValue(existingItem, nextItem));
  }).length;

  return { created, deleted, updated };
};

const getActiveCategories = (raceState: Partial<RaceState> | undefined): EventCategory[] => {
  return (raceState?.categories || []).filter((category) => !isCategoryDeleted(category));
};

const getFlagRecords = (raceState: Partial<RaceState> | undefined): TimeRecord[] => {
  return (raceState?.records || []).filter((record) => isFlagRecord(record));
};

const getCrossingRecords = (raceState: Partial<RaceState> | undefined): TimeRecord[] => {
  return (raceState?.records || []).filter((record) => isCrossingRecord(record));
};

export const summarizeSessionSourceReload = (
  existingRaceState: Partial<RaceState> | undefined,
  nextRaceState: Partial<RaceState>,
  mode: SessionSourceReloadMode
): SessionSourceReloadSummary => {
  const summary = createEmptySessionSourceReloadSummary();
  const countMatchingIdsAsUpdated = true;

  if (mode === 'all' || mode === 'categories') {
    summary.categories = countReloadChanges(getActiveCategories(existingRaceState), getActiveCategories(nextRaceState), countMatchingIdsAsUpdated);
  }
  if (mode === 'all' || mode === 'entrants') {
    summary.participants = countReloadChanges(existingRaceState?.participants || [], nextRaceState.participants || [], countMatchingIdsAsUpdated);
    summary.teams = countReloadChanges(existingRaceState?.teams || [], nextRaceState.teams || [], countMatchingIdsAsUpdated);
  }
  if (mode === 'all' || mode === 'time-records') {
    summary.crossings = countReloadChanges(getCrossingRecords(existingRaceState), getCrossingRecords(nextRaceState), countMatchingIdsAsUpdated);
    summary.flags = countReloadChanges(getFlagRecords(existingRaceState), getFlagRecords(nextRaceState), countMatchingIdsAsUpdated);
  }

  return summary;
};

const addSummaryCounts = (
  left: SessionSourceReloadSummaryCounts,
  right: SessionSourceReloadSummaryCounts
): SessionSourceReloadSummaryCounts => ({
  created: left.created + right.created,
  deleted: left.deleted + right.deleted,
  updated: left.updated + right.updated,
});

export const addSessionSourceReloadSummaries = (
  left: SessionSourceReloadSummary,
  right: SessionSourceReloadSummary
): SessionSourceReloadSummary => ({
  categories: addSummaryCounts(left.categories, right.categories),
  crossings: addSummaryCounts(left.crossings, right.crossings),
  events: addSummaryCounts(left.events, right.events),
  flags: addSummaryCounts(left.flags, right.flags),
  participants: addSummaryCounts(left.participants, right.participants),
  sessions: addSummaryCounts(left.sessions, right.sessions),
  teams: addSummaryCounts(left.teams, right.teams),
});

const createMissingCategoryPlaceholder = (categoryId: string): EventCategory => ({
  code: 'MISSING',
  description: `Category ${categoryId} was not found in the reloaded source data, but participants, entrants, or time records still reference it.`,
  excludeFromResults: true,
  id: categoryId,
  isPlaceholder: true,
  name: `Missing category ${categoryId}`,
});

const isCategoryDeleted = (category: EventCategory): boolean => category.deleted === true;

const getActiveCategoryIds = (categories: EventCategory[]): Set<string> => {
  return new Set(categories
    .filter((category) => !isCategoryDeleted(category))
    .map((category) => category.id.toString()));
};

const getReferencedCategoryIds = (raceState: Partial<RaceState>): Set<string> => {
  const referencedCategoryIds = new Set<string>();

  (raceState.participants || []).forEach((participant) => {
    if (participant.categoryId) {
      referencedCategoryIds.add(participant.categoryId.toString());
    }
  });
  (raceState.entries || []).forEach((entry) => {
    if (entry.categoryId) {
      referencedCategoryIds.add(entry.categoryId.toString());
    }
  });
  (raceState.teams || []).forEach((team) => {
    if (team.categoryId) {
      referencedCategoryIds.add(team.categoryId.toString());
    }
  });
  (raceState.records || []).forEach((record) => {
    getRecordCategoryIds(record).forEach((categoryId) => referencedCategoryIds.add(categoryId));
  });

  return referencedCategoryIds;
};

const getAffectedDeletedCategorySnapshots = (
  candidateCategories: EventCategory[],
  nextCategories: EventCategory[],
  referencedRaceState: Partial<RaceState>
): EventCategory[] => {
  const activeNextCategoryIds = getActiveCategoryIds(nextCategories);
  return Array.from(getReferencedCategoryIds(referencedRaceState))
    .filter((categoryId) => !activeNextCategoryIds.has(categoryId))
    .flatMap((categoryId) => {
      const category = findCategoryVersion(candidateCategories, categoryId);
      return category ? [{ ...category, deleted: true }] : [];
    });
};

const findCategoryVersion = (categories: EventCategory[], categoryId: string): EventCategory | undefined => {
  return categories.find((category) => category.id.toString() === categoryId && !isCategoryDeleted(category)) ||
    categories.find((category) => category.id.toString() === categoryId);
};

const createMissingCategoryPlaceholderForVersion = (categoryId: string, category: EventCategory | undefined): EventCategory => {
  const basePlaceholder = createMissingCategoryPlaceholder(categoryId);
  if (!category) {
    return basePlaceholder;
  }

  return {
    ...basePlaceholder,
    description: `Category ${category.name} (${categoryId}) was not found in the reloaded source data, but participants, entrants, or time records still reference it.`,
    name: `Missing category ${category.name}`,
  };
};

export const isMissingLinkedCategoryPlaceholder = (category: EventCategory): boolean => {
  return category.isPlaceholder === true &&
    category.code === 'MISSING' &&
    category.excludeFromResults === true &&
    category.name.startsWith('Missing category ');
};

export const getMissingLinkedCategoryIds = (raceState: Partial<RaceState>): string[] => {
  const categoryIds = getActiveCategoryIds(raceState.categories || []);
  const referencedCategoryIds = getReferencedCategoryIds(raceState);

  return Array.from(referencedCategoryIds).filter((categoryId) => !categoryIds.has(categoryId));
};

export const addMissingLinkedCategoryPlaceholders = (raceState: Partial<RaceState>): Partial<RaceState> => {
  const missingCategoryIds = getMissingLinkedCategoryIds(raceState);
  if (missingCategoryIds.length === 0) {
    return raceState;
  }

  return {
    ...raceState,
    categories: [
      ...(raceState.categories || []),
      ...missingCategoryIds.flatMap((categoryId) => {
        const categoryVersion = findCategoryVersion(raceState.categories || [], categoryId);
        return [
          ...(categoryVersion && !isCategoryDeleted(categoryVersion)
            ? [{ ...categoryVersion, deleted: true }]
            : []),
          createMissingCategoryPlaceholderForVersion(categoryId, categoryVersion),
        ];
      }),
    ],
  };
};

export const mergePulledRaceStates = (raceStates: Partial<RaceState>[]): Partial<RaceState> => {
  const mergedRaceState = raceStates.reduce<Partial<RaceState>>((merged, raceState) => ({
    categories: [...(merged.categories || []), ...(raceState.categories || [])],
    entries: [...(merged.entries || []), ...(raceState.entries || [])],
    eventStartTime: raceState.eventStartTime || merged.eventStartTime,
    participants: [...(merged.participants || []), ...(raceState.participants || [])],
    records: [...(merged.records || []), ...(raceState.records || [])],
    teams: [...(merged.teams || []), ...(raceState.teams || [])],
    timeRecordSources: [...(merged.timeRecordSources || []), ...(raceState.timeRecordSources || [])],
  }), {
    categories: [],
    entries: [],
    participants: [],
    records: [],
    teams: [],
    timeRecordSources: [],
  });

  return addMissingLinkedCategoryPlaceholders(mergedRaceState);
};

export const mergeRaceStateForReload = (
  existingRaceState: Partial<RaceState> | undefined,
  reloadedRaceState: Partial<RaceState>,
  mode: SessionSourceReloadMode,
  options: SessionSourceReloadMergeOptions = {}
): Partial<RaceState> => {
  const existing = existingRaceState || {};

  if (mode === 'all') {
    return pruneReloadRaceState(existingRaceState, addMissingLinkedCategoryPlaceholders({
      categories: reloadedRaceState.categories || [],
      entries: reloadedRaceState.entries || [],
      eventStartTime: reloadedRaceState.eventStartTime,
      participants: reloadedRaceState.participants || [],
      records: reloadedRaceState.records || [],
      teams: reloadedRaceState.teams || [],
      timeRecordSources: reloadedRaceState.timeRecordSources || [],
    }), options);
  }

  const nextCategories = mode === 'categories' ? reloadedRaceState.categories || [] : existing.categories || [];
  const nextEntries = mode === 'entrants' ? reloadedRaceState.entries || [] : existing.entries || [];
  const nextParticipants = mode === 'entrants' ? reloadedRaceState.participants || [] : existing.participants || [];
  const nextRecords = mode === 'time-records' ? reloadedRaceState.records || [] : existing.records || [];
  const nextTeams = mode === 'entrants' ? reloadedRaceState.teams || [] : existing.teams || [];
  const nextTimeRecordSources = mode === 'time-records' ? reloadedRaceState.timeRecordSources || [] : existing.timeRecordSources || [];
  const categorySnapshotCandidates = mode === 'categories'
    ? existing.categories || []
    : reloadedRaceState.categories || [];
  const deletedAffectedCategorySnapshots = getAffectedDeletedCategorySnapshots(
    categorySnapshotCandidates,
    nextCategories,
    {
      entries: nextEntries,
      participants: nextParticipants,
      records: nextRecords,
      teams: nextTeams,
    }
  );

  return pruneReloadRaceState(existingRaceState, addMissingLinkedCategoryPlaceholders({
    categories: [...nextCategories, ...deletedAffectedCategorySnapshots],
    entries: nextEntries,
    eventStartTime: mode === 'time-records' ? reloadedRaceState.eventStartTime || existing.eventStartTime : existing.eventStartTime,
    participants: nextParticipants,
    records: nextRecords,
    teams: nextTeams,
    timeRecordSources: nextTimeRecordSources,
  }), options);
};
