import { isFlagRecord } from '../controllers/flag.js';
import { isCrossingRecord } from '../controllers/timerecord.js';
import type { EventCategory } from '../model/eventcategory.js';
import type { RaceState } from '../model/racestate.js';
import type { TimeRecord } from '../model/timerecord.js';

export type SessionSourceReloadMode = 'all' | 'categories' | 'entrants' | 'time-records';

export const SESSION_SOURCE_RELOAD_OPTIONS: Array<{ label: string; value: SessionSourceReloadMode }> = [
  { label: 'All data', value: 'all' },
  { label: 'Categories', value: 'categories' },
  { label: 'Entrants', value: 'entrants' },
  { label: 'Time records', value: 'time-records' },
];

export interface SessionSourceReloadSummaryCounts {
  created: number;
  deleted: number;
  updated: number;
}

export interface SessionSourceReloadSummary {
  categories: SessionSourceReloadSummaryCounts;
  crossings: SessionSourceReloadSummaryCounts;
  flags: SessionSourceReloadSummaryCounts;
  participants: SessionSourceReloadSummaryCounts;
  teams: SessionSourceReloadSummaryCounts;
}

export const createEmptySessionSourceReloadSummary = (): SessionSourceReloadSummary => ({
  categories: { created: 0, deleted: 0, updated: 0 },
  crossings: { created: 0, deleted: 0, updated: 0 },
  flags: { created: 0, deleted: 0, updated: 0 },
  participants: { created: 0, deleted: 0, updated: 0 },
  teams: { created: 0, deleted: 0, updated: 0 },
});

const getRecordCategoryIds = (record: TimeRecord): string[] => {
  const categoryIds = (record as unknown as { categoryIds?: unknown }).categoryIds;
  return Array.isArray(categoryIds)
    ? categoryIds.filter((categoryId): categoryId is string => typeof categoryId === 'string' && categoryId.trim().length > 0)
    : [];
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
  flags: addSummaryCounts(left.flags, right.flags),
  participants: addSummaryCounts(left.participants, right.participants),
  teams: addSummaryCounts(left.teams, right.teams),
});

const createMissingCategoryPlaceholder = (categoryId: string): EventCategory => ({
  code: 'MISSING',
  description: `Category ${categoryId} was not found in the reloaded source data, but participants, entrants, or time records still reference it.`,
  excludeFromResults: true,
  id: categoryId,
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
  return category.code === 'MISSING' &&
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
    eventStartTime: raceState.eventStartTime || merged.eventStartTime,
    participants: [...(merged.participants || []), ...(raceState.participants || [])],
    records: [...(merged.records || []), ...(raceState.records || [])],
    teams: [...(merged.teams || []), ...(raceState.teams || [])],
  }), {
    categories: [],
    participants: [],
    records: [],
    teams: [],
  });

  return addMissingLinkedCategoryPlaceholders(mergedRaceState);
};

export const mergeRaceStateForReload = (
  existingRaceState: Partial<RaceState> | undefined,
  reloadedRaceState: Partial<RaceState>,
  mode: SessionSourceReloadMode
): Partial<RaceState> => {
  const existing = existingRaceState || {};

  if (mode === 'all') {
    return addMissingLinkedCategoryPlaceholders({
      categories: reloadedRaceState.categories || [],
      eventStartTime: reloadedRaceState.eventStartTime,
      participants: reloadedRaceState.participants || [],
      records: reloadedRaceState.records || [],
      teams: reloadedRaceState.teams || [],
    });
  }

  const nextCategories = mode === 'categories' ? reloadedRaceState.categories || [] : existing.categories || [];
  const nextParticipants = mode === 'entrants' ? reloadedRaceState.participants || [] : existing.participants || [];
  const nextRecords = mode === 'time-records' ? reloadedRaceState.records || [] : existing.records || [];
  const nextTeams = mode === 'entrants' ? reloadedRaceState.teams || [] : existing.teams || [];
  const categorySnapshotCandidates = mode === 'categories'
    ? existing.categories || []
    : reloadedRaceState.categories || [];
  const deletedAffectedCategorySnapshots = getAffectedDeletedCategorySnapshots(
    categorySnapshotCandidates,
    nextCategories,
    {
      participants: nextParticipants,
      records: nextRecords,
      teams: nextTeams,
    }
  );

  return addMissingLinkedCategoryPlaceholders({
    categories: [...nextCategories, ...deletedAffectedCategorySnapshots],
    eventStartTime: mode === 'time-records' ? reloadedRaceState.eventStartTime || existing.eventStartTime : existing.eventStartTime,
    participants: nextParticipants,
    records: nextRecords,
    teams: nextTeams,
  });
};
