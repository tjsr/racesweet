import type { RaceState, RaceStateLookup } from '../../model/racestate.js';

import { MenuItem, TextField } from '@mui/material';
import React from 'react';
import type { EventCatalogEntrant, EventCatalogEntry, EventCatalogEvent } from '../../catalog/eventCatalog.js';
import { millisecondsToTime, tableTimeString } from '../../app/utils/timeutils.js';
import { shouldExcludeCategoryFromResults } from '../../processing/category.js';
import { getSourceLapCompletion, isCountedLapPassing } from '../../processing/laps.js';
import { getParticipantNumber } from '../../processing/participant.js';
import { calculateYellowFlagPeriods } from '../../processing/yellowFlagPeriods.js';
import { getParticipantEntryId } from '../../model/entry.js';
import { EventEntrantId } from '../../model/entrant.js';
import type { EventParticipant, EventParticipantId } from '../../model/eventparticipant.js';
import { EventCategoryId } from '../../model/index.js';
import { EventId, SessionId } from '../../model/raceevent.js';
import type { ParticipantPassingRecord } from '../../model/timerecord.js';
import { LapTimesReport, type LapTimesReportState } from '../reports/LapTimesReport.js';
import { TrackMapReport } from '../reports/TrackMapReport.js';
import { HandicapView } from './handicap.js';

interface CategoryOption {
  deleted?: boolean;
  excludeFromResults?: boolean;
  id: string;
  name: string;
}

export interface EventSessionOption {
  eventId: EventId;
  eventName: string;
  sessionId?: SessionId;
  sessionName?: string;
  value: string;
}

interface EntrantSummaryRow {
  categoryIds: string[];
  categoryKeys: string[];
  categoryName: string;
  entrantId: EventEntrantId;
  entrantName: string;
  fastestLap?: number;
  fastestLapNo?: number;
  fastestLapPlate?: string;
  lapCount: number;
  laps: ParticipantPassingRecord[];
  memberDetails: Array<{
    categoryName: string;
    participantDisplayName: string;
    participantId: EventParticipantId;
    participantName: string;
    raceNumber: string;
    racePlate?: string;
  }>;
  totalTime?: number;
}

const getRowDriverName = (row: EntrantSummaryRow): string => Array.from(new Set(
  row.memberDetails.map((member) => member.participantDisplayName).filter((name) => name.length > 0),
)).join(' / ');

const getRowRaceNumber = (row: EntrantSummaryRow): string => Array.from(new Set(
  row.memberDetails.map((member) => member.racePlate).filter((number): number is string => !!number),
)).join(' / ');

const getEntrantRaceNumber = (entrant: EventCatalogEntrant | undefined): string | undefined => {
  const identifier = entrant?.identifiers?.find((candidate) => 'racePlate' in candidate) as { racePlate?: unknown } | undefined;
  return typeof identifier?.racePlate === 'string' && identifier.racePlate.length > 0 ? identifier.racePlate : undefined;
};

interface LapChartEntry {
  categoryName: string;
  crossingTime: number;
  entrantId: EventEntrantId;
  entrantName: string;
  lapNo: number;
  lapTime?: number;
  participantId: EventParticipantId;
  participantName: string;
  position: number;
  raceNumber: string;
}

interface LapChartColumn {
  entries: LapChartEntry[];
  lapNo: number;
}

interface FastestLapTimelineRow {
  elapsedTime: number;
  entrantId: EventEntrantId;
  lapNo: number;
  lapTime: number;
  participantId: EventParticipantId;
  participantName: string;
  raceNumber: string;
  teamName: string;
  time?: Date;
}

interface LapChartLinePoint {
  domOrder: number;
  entrantId: EventEntrantId;
  lapNo: number;
  position: number;
  x: number;
  y: number;
}

interface LapChartLineSegment {
  color: string;
  entrantId: EventEntrantId;
  key: string;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

interface BaseRaceAnalyticsProps {
  categories: CategoryOption[];
  catalogEntries?: EventCatalogEntry[];
  catalogEntrants: EventCatalogEntrant[];
  eventSessionOptions?: EventSessionOption[];
  event?: EventCatalogEvent;
  onSelectEventSession?: (value: string) => void;
  raceState: RaceState & RaceStateLookup;
  selectedEventSessionValue?: string;
}

interface ResultsPageProps extends BaseRaceAnalyticsProps {
  selectedCategoryId?: EventCategoryId;
}

export type ReportType = 'fastest-laps' | 'fastest-lap-timeline' | 'lap-times' | 'lap-chart' | 'yellow-flag-periods' | 'handicap-data' | 'track-map';

export interface ReportsViewState {
  drawLineChart: boolean;
  handicapShowFilter: 'all' | 'event-participants-only';
  ignoreFirstLapForFastestLaps: boolean;
  ignoreFirstLapForTimeline: boolean;
  lapTimes: LapTimesReportState;
  reportType: ReportType;
  selectedCategory: CategoryFilter;
}

export const createDefaultReportsViewState = (): ReportsViewState => ({
  drawLineChart: false,
  handicapShowFilter: 'all',
  ignoreFirstLapForFastestLaps: true,
  ignoreFirstLapForTimeline: true,
  lapTimes: { selectedCategoryId: '__all__', selectedParticipantId: '', showAs: 'individual' },
  reportType: 'fastest-laps',
  selectedCategory: 'overall',
});

interface ReportsPageProps extends BaseRaceAnalyticsProps {
  onViewStateChange?: (changes: Partial<ReportsViewState>) => void;
  selectedCategoryId?: EventCategoryId;
  viewState?: ReportsViewState;
}

type CategoryFilter = 'overall' | string;

const lapChartLineColors: string[] = ['#0057b8', '#b00020', '#217a34', '#7a4cc2', '#a65f00', '#007a78'];

const normalizeText = (value: string): string => value.trim().toLowerCase();

const getLapChartEntrantLineColor = (_entrantId: EventEntrantId, entrantIndex: number): string => {
  return lapChartLineColors[entrantIndex % lapChartLineColors.length];
};

const getCategoryByIdSafely = (
  raceState: RaceState & RaceStateLookup,
  categoryId?: EventCategoryId
): CategoryOption | undefined => {
  if (!categoryId) {
    return undefined;
  }

  try {
    return raceState.getCategoryById(categoryId);
  } catch {
    return undefined;
  }
};

const categoryNameFromId = (raceState: RaceState & RaceStateLookup, categoryId?: EventCategoryId): string => {
  if (!categoryId) {
    return 'Unknown';
  }

  return getCategoryByIdSafely(raceState, categoryId)?.name || categoryId;
};

const categoryKeyFromName = (name: string): string => normalizeText(name);

const _categoryKeyFromId = (raceState: RaceState & RaceStateLookup, categoryId?: EventCategoryId): string => {
  return categoryKeyFromName(categoryNameFromId(raceState, categoryId));
};

const dedupeCategoryOptions = (categories: CategoryOption[]): CategoryOption[] => {
  const byId = new Map<string, CategoryOption>();
  categories.filter((category) => category.deleted !== true).forEach((category) => {
    byId.set(category.id, category);
  });
  return Array.from(byId.values());
};

const getExcludedCategoryKeys = (
  raceState: RaceState & RaceStateLookup,
  categories: CategoryOption[]
): Set<string> => {
  const excludedKeys = new Set<string>();

  categories.forEach((category) => {
    const stateCategory = getCategoryByIdSafely(raceState, category.id);
    if (category.excludeFromResults || shouldExcludeCategoryFromResults(stateCategory)) {
      excludedKeys.add(categoryKeyFromName(category.name));
      excludedKeys.add(_categoryKeyFromId(raceState, category.id));
    }
  });

  raceState.categories.forEach((category) => {
    if (shouldExcludeCategoryFromResults(category)) {
      excludedKeys.add(categoryKeyFromName(category.name));
    }
  });

  return excludedKeys;
};

const isParticipantExcludedFromResults = (
  raceState: RaceState & RaceStateLookup,
  participant: EventParticipant,
  excludedCategoryKeys: Set<string>
): boolean => {
  const category = getCategoryByIdSafely(raceState, participant.categoryId);
  return shouldExcludeCategoryFromResults(category) || excludedCategoryKeys.has(_categoryKeyFromId(raceState, participant.categoryId));
};

const formatDuration = (duration?: number): string => {
  if (!duration || duration <= 0) {
    return '--:--:--.---';
  }
  return millisecondsToTime(duration);
};

const isValidLap = (
  lap: ParticipantPassingRecord,
  raceState: RaceStateLookup
): boolean => {
  return isCountedLapPassing(lap, raceState.getFinishLineNumbers?.(), (passing) => (
    getSourceLapCompletion(passing, raceState.getTimeRecordSourceById?.(passing.source))
  ));
};

const findEntrantName = (entrantId: EventEntrantId, members: EventParticipant[], catalogEntrantsById: Map<EventEntrantId, EventCatalogEntrant>): string => {
  const catalogName = catalogEntrantsById.get(entrantId)?.name?.trim();
  if (catalogName && catalogName.length > 0) {
    return catalogName;
  }

  const names = members
    .map((member) => `${member.firstname || ''} ${member.surname || ''}`.trim())
    .filter((name) => name.length > 0);

  if (names.length === 0) {
    return entrantId;
  }
  if (names.length === 1) {
    return names[0];
  }

  return names.join(' / ');
};

const findFastestLapRecord = (laps: ParticipantPassingRecord[], ignoreFirstLap: boolean): ParticipantPassingRecord | undefined => {
  return laps
    .filter((lap) => typeof lap.lapTime === 'number' && lap.lapTime > 0 && (!ignoreFirstLap || lap.lapNo !== 1))
    .sort((left, right) => {
      if (left.lapTime !== right.lapTime) {
        return (left.lapTime || 0) - (right.lapTime || 0);
      }
      return (left.lapNo || 0) - (right.lapNo || 0);
    })[0];
};

const findFastestLapPlate = (row: EntrantSummaryRow, fastestLapRecord: ParticipantPassingRecord | undefined): string | undefined => {
  if (!fastestLapRecord?.participantId) {
    return undefined;
  }
  return row.memberDetails.find((member) => member.participantId === fastestLapRecord.participantId?.toString())?.raceNumber;
};

const buildEntrantRows = (
  raceState: RaceState & RaceStateLookup,
  catalogEntrants: EventCatalogEntrant[],
  catalogEntries: EventCatalogEntry[],
  excludedCategoryKeys: Set<string>,
): EntrantSummaryRow[] => {
  const catalogEntrantsById = new Map(catalogEntrants.map((entrant) => [entrant.id, entrant]));
  const catalogEntriesById = new Map(catalogEntries.map((entry) => [entry.id, entry]));
  const participantGroups = new Map<EventEntrantId, EventParticipant[]>();

  raceState.participants.forEach((participant) => {
    const entrantId = getParticipantEntryId(participant).toString();
    const group = participantGroups.get(entrantId) || [];
    group.push(participant);
    participantGroups.set(entrantId, group);
  });

  const rows: EntrantSummaryRow[] = [];

  participantGroups.forEach((members, entrantId: EventEntrantId) => {
    const catalogEntry = catalogEntriesById.get(entrantId);
    const entryCategoryId = catalogEntry?.categoryId;
    const entryCategory = getCategoryByIdSafely(raceState, entryCategoryId);
    const isEntryExcluded = shouldExcludeCategoryFromResults(entryCategory) ||
      excludedCategoryKeys.has(_categoryKeyFromId(raceState, entryCategoryId));
    const includedMembers = members.filter((member) => entryCategoryId
      ? !isEntryExcluded
      : !isParticipantExcludedFromResults(raceState, member, excludedCategoryKeys));
    if (includedMembers.length === 0) {
      return;
    }

    const laps = includedMembers
      .flatMap((member) => raceState.getParticipantLaps(member.id) || [])
      .filter((lap) => isValidLap(lap, raceState))
      .sort((a, b) => {
        const at = a.time?.getTime() || Number.MAX_SAFE_INTEGER;
        const bt = b.time?.getTime() || Number.MAX_SAFE_INTEGER;
        if (at !== bt) {
          return at - bt;
        }
        return (a.elapsedTime || 0) - (b.elapsedTime || 0);
      });

    const fastestLapRecord = findFastestLapRecord(laps, false);

    const totalTime = laps.length > 0 ? laps[laps.length - 1].elapsedTime || undefined : undefined;
    const memberDetails = includedMembers.map((member) => {
      const raceNumber = catalogEntry?.raceNumber || getParticipantNumber(member) || getEntrantRaceNumber(catalogEntrantsById.get(entrantId));
      return {
        categoryId: (entryCategoryId || member.categoryId)?.toString(),
        categoryName: categoryNameFromId(raceState, entryCategoryId || member.categoryId),
        participantDisplayName: `${member.firstname || ''} ${member.surname ? member.surname.toUpperCase() : ''}`.trim() || member.id.toString(),
        participantId: member.id.toString(),
        participantName: `${member.firstname || ''} ${member.surname || ''}`.trim() || member.id.toString(),
        raceNumber: raceNumber ? raceNumber.toString() : member.id.toString(),
        racePlate: raceNumber ? raceNumber.toString() : undefined,
      };
    });
    const categoryIds = Array.from(new Set(memberDetails.map((member) => member.categoryId).filter((categoryId): categoryId is string => !!categoryId)));
    const categoryKeys = Array.from(new Set(memberDetails.map((member) => categoryKeyFromName(member.categoryName))));
    const categoryName = memberDetails.map((member) => member.categoryName).filter((value, index, values) => values.indexOf(value) === index).join(', ');

    rows.push({
      categoryIds,
      categoryKeys,
      categoryName,
      entrantId,
      entrantName: catalogEntry?.name?.trim() || findEntrantName(entrantId, members, catalogEntrantsById),
      fastestLap: fastestLapRecord?.lapTime || undefined,
      fastestLapNo: fastestLapRecord?.lapNo || undefined,
      fastestLapPlate: undefined,
      lapCount: laps.length,
      laps,
      memberDetails,
      totalTime,
    });
  });

  return rows.sort((left, right) => {
    if (left.lapCount !== right.lapCount) {
      return right.lapCount - left.lapCount;
    }
    if (typeof left.totalTime !== 'number') {
      return 1;
    }
    if (typeof right.totalTime !== 'number') {
      return -1;
    }
    return left.totalTime - right.totalTime;
  });
};

const buildLapChart = (rows: EntrantSummaryRow[]): LapChartColumn[] => {
  const byLap = new Map<number, Map<string, LapChartEntry>>();

  rows.forEach((row) => {
    const memberById = new Map(row.memberDetails.map((detail) => [detail.participantId, detail]));
    row.laps.forEach((lap) => {
      if (!lap.lapNo || !lap.participantId) {
        return;
      }
      const detail = memberById.get(lap.participantId.toString());
      if (!detail) {
        return;
      }

      const chartEntry: LapChartEntry = {
        categoryName: detail.categoryName,
        crossingTime: lap.time?.getTime() || Number.MAX_SAFE_INTEGER,
        entrantId: row.entrantId,
        entrantName: row.entrantName,
        lapNo: lap.lapNo,
        lapTime: lap.lapTime || undefined,
        participantId: lap.participantId,
        participantName: detail.participantName,
        position: 0,
        raceNumber: detail.raceNumber,
      };

      const lapMap = byLap.get(lap.lapNo) || new Map<string, LapChartEntry>();
      const participantKey = lap.participantId.toString();
      if (!lapMap.has(participantKey)) {
        lapMap.set(participantKey, chartEntry);
        byLap.set(lap.lapNo, lapMap);
        return;
      }

      const existingEntry = lapMap.get(participantKey)!;
      const existingTime = existingEntry.crossingTime;
      const nextTime = lap.time?.getTime() || Number.MAX_SAFE_INTEGER;
      if (nextTime < existingTime) {
        lapMap.set(participantKey, chartEntry);
      } else {
        lapMap.set(participantKey, existingEntry);
      }
    });
  });

  return Array.from(byLap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([lapNo, entriesMap]) => {
      const entries = Array.from(entriesMap.values())
        .sort((left, right) => left.crossingTime - right.crossingTime)
        .map((entry, index) => ({ ...entry, position: index + 1 }));

      return {
        entries,
        lapNo,
      };
    });
};

const getRaceStateContentSignature = (raceState: RaceState & RaceStateLookup): string => {
  const entrySignature = (raceState.entries || [])
    .map((entry) => [
      entry.id,
      entry.entrantId,
      entry.categoryId,
      entry.raceNumber,
      JSON.stringify(entry.identifiers),
      entry.participantIds.join(','),
    ].join(':'))
    .join('|');
  const participantSignature = raceState.participants
    .map((participant) => [
      participant.id,
      participant.entrantId,
      participant.categoryId,
      participant.firstname,
      participant.surname,
      JSON.stringify(participant.identifiers || []),
    ].join(':'))
    .join('|');
  const categorySignature = raceState.categories
    .map((category) => `${category.id}:${category.name}:${category.excludeFromResults === true}`)
    .join('|');
  const recordSignature = raceState.records
    .map((record) => {
      const passing = record as ParticipantPassingRecord;
      const sourceLapCompletion = getSourceLapCompletion(
        passing,
        raceState.getTimeRecordSourceById?.(passing.source),
      );
      return [
        record.id,
        passing.participantId,
        passing.entrantId,
        passing.source,
        passing.sourceLineNumber,
        passing.lineNumber,
        passing.loopNumber,
        passing.isLapCompletion,
        sourceLapCompletion,
        passing.isValid,
        passing.isExcluded,
        passing.isManuallyExcluded,
        passing.unrelatedReasonCode,
        passing.lapNo,
        passing.lapTime,
        passing.elapsedTime,
        record.time?.getTime(),
        record.timeTenthOfMillisecond,
      ].join(':');
    })
    .join('|');

  return `${entrySignature}::${participantSignature}::${categorySignature}::${recordSignature}`;
};

const buildFastestLapTimeline = (rows: EntrantSummaryRow[], ignoreFirstLap: boolean): FastestLapTimelineRow[] => {
  const candidates = rows.flatMap((row) => {
    const memberById = new Map(row.memberDetails.map((detail) => [detail.participantId, detail]));
    const isTeamEntrant = row.memberDetails.length > 1;

    return row.laps
      .filter((lap) => {
        return typeof lap.lapTime === 'number' &&
          lap.lapTime > 0 &&
          !!lap.participantId &&
          !!lap.lapNo &&
          (!ignoreFirstLap || lap.lapNo !== 1);
      })
      .map((lap) => {
        const participantId = lap.participantId!.toString();
        const detail = memberById.get(participantId);
        if (!detail) {
          return undefined;
        }

        const timelineRow: FastestLapTimelineRow = {
          elapsedTime: lap.elapsedTime!,
          entrantId: row.entrantId,
          lapNo: lap.lapNo!,
          lapTime: lap.lapTime!,
          participantId: detail.participantId,
          participantName: detail.participantName,
          raceNumber: detail.raceNumber,
          teamName: isTeamEntrant ? row.entrantName : '',
          time: lap.time,
        };
        return timelineRow;
      })
      .filter((lap): lap is FastestLapTimelineRow => !!lap);
  }).sort((left, right) => {
    const leftTime = left.time?.getTime() || Number.MAX_SAFE_INTEGER;
    const rightTime = right.time?.getTime() || Number.MAX_SAFE_INTEGER;
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    if (left.elapsedTime !== right.elapsedTime) {
      return left.elapsedTime - right.elapsedTime;
    }
    return left.lapTime - right.lapTime;
  });

  const timeline: FastestLapTimelineRow[] = [];
  candidates.forEach((lap) => {
    const currentFastest = timeline[timeline.length - 1]?.lapTime;
    if (typeof currentFastest !== 'number' || lap.lapTime < currentFastest) {
      timeline.push(lap);
    }
  });

  return timeline;
};

const buildFastestLapReportRows = (rows: EntrantSummaryRow[], ignoreFirstLap: boolean): EntrantSummaryRow[] => {
  return rows
    .map((row) => {
      const fastestLapRecord = findFastestLapRecord(row.laps, ignoreFirstLap);
      return {
        ...row,
        fastestLap: fastestLapRecord?.lapTime || undefined,
        fastestLapNo: fastestLapRecord?.lapNo || undefined,
        fastestLapPlate: findFastestLapPlate(row, fastestLapRecord),
      };
    })
    .sort((left, right) => {
      if (typeof left.fastestLap !== 'number') {
        return 1;
      }
      if (typeof right.fastestLap !== 'number') {
        return -1;
      }
      return left.fastestLap - right.fastestLap;
    });
};

const CategorySelector = (props: {
  categories: CategoryOption[];
  selectedCategory: CategoryFilter;
  onSelectCategory: (next: CategoryFilter) => void;
}): React.ReactElement => {
  const selectedCategory: CategoryFilter = props.selectedCategory === 'overall' ||
    props.categories.some((category: CategoryOption): boolean => category.id === props.selectedCategory)
    ? props.selectedCategory
    : 'overall';
  return (
    <>
      <TextField
        className="page-filter-label"
        label="Category"
        select
        slotProps={{
          select: {
            'aria-label': 'Race View Category',
          },
        }}
        value={selectedCategory}
        onChange={(event) => props.onSelectCategory(event.target.value as CategoryFilter)}
      >
        <MenuItem value="overall">Overall</MenuItem>
        {props.categories.map((category) => (
          <MenuItem key={category.id} value={category.id}>{category.name}</MenuItem>
        ))}
      </TextField>
      <select
        aria-label="Race View Category"
        hidden
        value={selectedCategory}
        onChange={(event: React.ChangeEvent<HTMLSelectElement>): void =>
          props.onSelectCategory(event.target.value as CategoryFilter)}
      >
        <option value="overall">Overall</option>
        {props.categories.map((category: CategoryOption) => (
          <option key={category.id} value={category.id}>{category.name}</option>
        ))}
      </select>
    </>
  );
};

const EventSessionSelector = (props: {
  onSelectEventSession?: (value: string) => void;
  options?: EventSessionOption[];
  selectedValue?: string;
}): React.ReactElement | null => {
  if (!props.options || props.options.length === 0 || !props.onSelectEventSession) {
    return null;
  }

  const selectableOptions = props.options.filter((option) => option.sessionId);
  const selectedValue = selectableOptions.some((option) => option.value === props.selectedValue)
    ? props.selectedValue
    : selectableOptions[0]?.value || '';

  return (
    <>
      <TextField
        className="page-filter-label"
        label="Event/Session"
        select
        slotProps={{
          select: {
            'aria-label': 'Race View Event Session',
          },
        }}
        value={selectedValue}
        onChange={(event) => props.onSelectEventSession?.(event.target.value)}
      >
        {props.options.map((option) => (
          <MenuItem key={option.value} disabled={!option.sessionId} value={option.value}>
            {option.sessionId ? `-> ${option.sessionName || option.sessionId}` : option.eventName}
          </MenuItem>
        ))}
      </TextField>
      <select
        aria-label="Race View Event Session"
        hidden
        value={selectedValue}
        onChange={(event: React.ChangeEvent<HTMLSelectElement>): void =>
          props.onSelectEventSession?.(event.target.value)}
      >
        {props.options.map((option: EventSessionOption) => (
          <option key={option.value} disabled={!option.sessionId} value={option.value}>
            {option.sessionId ? `-> ${option.sessionName || option.sessionId}` : option.eventName}
          </option>
        ))}
      </select>
    </>
  );
};

export const ResultsPage = (props: ResultsPageProps): React.ReactElement => {
  const isMotorsport = props.event?.discipline === 'motorsport';
  const isCycling = props.event?.discipline === 'cycling';
  const useParticipantIdentity = isMotorsport || isCycling;
  const participantLabel = isMotorsport ? 'Driver' : isCycling ? 'Participant' : 'Entrant';
  const numberLabel = 'No.';
  const excludedCategoryKeys = React.useMemo(() => getExcludedCategoryKeys(props.raceState, props.categories), [props.categories, props.raceState]);
  const categories = React.useMemo(() => {
    return dedupeCategoryOptions(props.categories);
  }, [props.categories]);
  const [selectedCategory, setSelectedCategory] = React.useState<CategoryFilter>(
    props.selectedCategoryId && categories.some(
      (category: CategoryOption): boolean => category.id === props.selectedCategoryId,
    )
      ? props.selectedCategoryId
      : 'overall',
  );
  const [selectedLapEntry, setSelectedLapEntry] = React.useState<LapChartEntry | undefined>(undefined);
  const [viewType, setViewType] = React.useState<'results' | 'lap-chart'>('results');

  React.useEffect(() => {
    if (!props.selectedCategoryId) {
      return;
    }
    if (categories.some((category) => category.id === props.selectedCategoryId)) {
      setSelectedCategory(props.selectedCategoryId);
    }
  }, [categories, props.selectedCategoryId]);

  React.useEffect(() => {
    if (selectedCategory !== 'overall' && !categories.some((category) => category.id === selectedCategory)) {
      setSelectedCategory('overall');
    }
  }, [categories, selectedCategory]);

  const raceStateContentSignature = getRaceStateContentSignature(props.raceState);
  const allRows = React.useMemo(() => {
    return buildEntrantRows(props.raceState, props.catalogEntrants, props.catalogEntries || [], excludedCategoryKeys);
  }, [excludedCategoryKeys, props.catalogEntries, props.catalogEntrants, props.raceState, raceStateContentSignature]);

  const rows = React.useMemo(() => {
    if (selectedCategory === 'overall') {
      return allRows;
    }
    const categoryName = categories.find((category) => category.id === selectedCategory)?.name || selectedCategory;
    const categoryKey = categoryKeyFromName(categoryName);
    return allRows.filter((row) => row.categoryKeys.includes(categoryKey));
  }, [allRows, categories, selectedCategory]);

  const lapChart = React.useMemo(() => {
    return buildLapChart(rows);
  }, [rows]);

  const maxLapPosition = React.useMemo(() => {
    return lapChart.reduce((maxValue, lap) => Math.max(maxValue, lap.entries.length), 0);
  }, [lapChart]);

  return (
    <section className="events-screen">
      <h1>Results</h1>
      <p>Session race standings and lap-chart view for the selected category scope.</p>
      <section className="events-panel">
        <div className="events-actions">
          <EventSessionSelector
            onSelectEventSession={props.onSelectEventSession}
            options={props.eventSessionOptions}
            selectedValue={props.selectedEventSessionValue}
          />
          <CategorySelector categories={categories} selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory} />
          <TextField
            className="page-filter-label"
            label="View"
            select
            slotProps={{
              select: {
                'aria-label': 'Results View Type',
              },
            }}
            value={viewType}
            onChange={(event) => setViewType(event.target.value as 'results' | 'lap-chart')}
          >
            <MenuItem value="results">Results</MenuItem>
            <MenuItem value="lap-chart">Lap Chart</MenuItem>
          </TextField>
          <select
            aria-label="Results View Type"
            hidden
            value={viewType}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>): void =>
              setViewType(event.target.value as 'results' | 'lap-chart')}
          >
            <option value="results">Results</option>
            <option value="lap-chart">Lap Chart</option>
          </select>
        </div>
      </section>

      {viewType === 'results' ? (
        <section className="events-panel">
          <h2>Results</h2>
          <table aria-label="Results Table">
            <thead>
              <tr>
                <th>Position</th>
                <th>{numberLabel}</th>
                <th>{participantLabel}</th>
                <th>Category</th>
                <th>Laps</th>
                <th>Total Time</th>
                <th>Fastest Lap</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.entrantId}>
                  <td>{index + 1}</td>
                  <td>{getRowRaceNumber(row) || '-'}</td>
                  <td>{useParticipantIdentity ? getRowDriverName(row) || '-' : row.entrantName}</td>
                  <td>{row.categoryName}</td>
                  <td>{row.lapCount}</td>
                  <td>{formatDuration(row.totalTime)}</td>
                  <td>{formatDuration(row.fastestLap)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="events-panel">
          <h2>Lap Chart</h2>
          <table aria-label="Results Lap Chart Table" className="lap-chart-table">
            <thead>
              <tr>
                <th>Position</th>
                {lapChart.map((column) => (
                  <th key={`results-lap-column-${column.lapNo}`}>Lap {column.lapNo}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxLapPosition }, (_, rowIndex) => (
                <tr key={`results-lap-row-${rowIndex + 1}`}>
                  <td>{rowIndex + 1}</td>
                  {lapChart.map((column) => {
                    const entry = column.entries[rowIndex];
                    return (
                      <td key={`results-lap-cell-${column.lapNo}-${rowIndex + 1}`}>
                        {entry ? (
                          <button
                            type="button"
                            className="lap-entry-button"
                            onClick={() => setSelectedLapEntry(entry)}
                          >
                            {entry.raceNumber}
                          </button>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {selectedLapEntry ? (
            <aside className="events-panel lap-entry-info" aria-label="Lap Entry Details">
              <h3>Lap Entry Details</h3>
              <p>Rider: {selectedLapEntry.raceNumber} · {selectedLapEntry.participantName}</p>
              <p>Entrant: {selectedLapEntry.entrantName} ({selectedLapEntry.entrantId})</p>
              <p>Category: {selectedLapEntry.categoryName}</p>
              <p>Lap: {selectedLapEntry.lapNo}</p>
              <p>Position: {selectedLapEntry.position}</p>
              <p>Lap Time: {formatDuration(selectedLapEntry.lapTime)}</p>
            </aside>
          ) : null}
        </section>
      )}
    </section>
  );
};

export const ReportsPage = (props: ReportsPageProps): React.ReactElement => {
  const isMotorsport = props.event?.discipline === 'motorsport';
  const isCycling = props.event?.discipline === 'cycling';
  const useParticipantIdentity = isMotorsport || isCycling;
  const participantLabel = isMotorsport ? 'Driver' : isCycling ? 'Participant' : 'Entrant';
  const timelineParticipantLabel = isMotorsport ? 'Driver' : 'Participant';
  const numberLabel = isMotorsport ? 'No.' : 'Plate';
  const excludedCategoryKeys = React.useMemo(() => getExcludedCategoryKeys(props.raceState, props.categories), [props.categories, props.raceState]);
  const categories = React.useMemo(() => {
    return dedupeCategoryOptions(props.categories);
  }, [props.categories]);
  const [localViewState, setLocalViewState] = React.useState<ReportsViewState>({
    ...createDefaultReportsViewState(),
    selectedCategory: props.selectedCategoryId && categories.some(
      (category: CategoryOption): boolean => category.id === props.selectedCategoryId,
    ) ? props.selectedCategoryId : 'overall',
  });
  const viewState = props.viewState || localViewState;
  const updateViewState = (changes: Partial<ReportsViewState>): void => {
    setLocalViewState((currentState: ReportsViewState): ReportsViewState => ({ ...currentState, ...changes }));
    props.onViewStateChange?.(changes);
  };
  const selectedCategory = viewState.selectedCategory;
  const [selectedLapEntry, setSelectedLapEntry] = React.useState<LapChartEntry | undefined>(undefined);
  const drawLineChart = viewState.drawLineChart;
  const [lapChartLineSegments, setLapChartLineSegments] = React.useState<LapChartLineSegment[]>([]);
  const reportType = viewState.reportType;
  const ignoreFirstLapForFastestLaps = viewState.ignoreFirstLapForFastestLaps;
  const ignoreFirstLapForTimeline = viewState.ignoreFirstLapForTimeline;
  const handicapShowFilter = viewState.handicapShowFilter;
  const lapChartWrapperRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (selectedCategory !== 'overall' && !categories.some((category) => category.id === selectedCategory)) {
      updateViewState({ selectedCategory: 'overall' });
    }
  }, [categories, selectedCategory]);

  const raceStateContentSignature = getRaceStateContentSignature(props.raceState);
  const allRows = React.useMemo(() => {
    return buildEntrantRows(props.raceState, props.catalogEntrants, props.catalogEntries || [], excludedCategoryKeys);
  }, [excludedCategoryKeys, props.catalogEntries, props.catalogEntrants, props.raceState, raceStateContentSignature]);

  const rows = React.useMemo(() => {
    if (selectedCategory === 'overall') {
      return allRows;
    }
    const categoryName = categories.find((category) => category.id === selectedCategory)?.name || selectedCategory;
    const categoryKey = categoryKeyFromName(categoryName);
    return allRows.filter((row) => row.categoryKeys.includes(categoryKey));
  }, [allRows, categories, selectedCategory]);

  const lapTimePassings = React.useMemo(() => {
    const map = new Map<string, ParticipantPassingRecord[]>();
    rows.forEach((row) => {
      map.set(row.entrantId, row.laps);
    });
    return map;
  }, [rows]);

  const reportParticipants = React.useMemo(() => rows.map((row) => ({
    categoryIds: row.categoryIds,
    id: row.entrantId,
    name: row.entrantName,
    participantIds: row.memberDetails.map((member) => member.participantId),
    participantNames: row.memberDetails.map((member) => member.participantDisplayName),
    raceNumber: Array.from(new Set(row.memberDetails.map((member) => member.racePlate).filter((value): value is string => !!value))).join(' / '),
    teamName: row.entrantName,
  })), [rows]);

  const lapChart = React.useMemo(() => {
    return buildLapChart(rows);
  }, [rows]);

  const fastestLapTimelineRows = React.useMemo(() => {
    return buildFastestLapTimeline(rows, ignoreFirstLapForTimeline);
  }, [ignoreFirstLapForTimeline, rows]);

  const maxLapPosition = React.useMemo(() => {
    return lapChart.reduce((maxValue, lap) => Math.max(maxValue, lap.entries.length), 0);
  }, [lapChart]);

  const handleReportLapEntryClick = (entry: LapChartEntry): void => {
    setSelectedLapEntry((currentEntry) => currentEntry?.entrantId === entry.entrantId ? undefined : entry);
  };

  const updateLapChartLineSegments = React.useCallback((): void => {
    const wrapper = lapChartWrapperRef.current;
    if (!drawLineChart || reportType !== 'lap-chart' || !wrapper) {
      setLapChartLineSegments([]);
      return;
    }

    const wrapperRect = wrapper.getBoundingClientRect();
    const buttons = Array.from(wrapper.querySelectorAll<HTMLButtonElement>('button[data-lap-chart-entrant-id]'));
    const pointsByEntrant = new Map<EventEntrantId, LapChartLinePoint[]>();
    const entrantOrder = new Map<EventEntrantId, number>();

    buttons.forEach((button, domOrder: number) => {
      const entrantId = button.dataset.lapChartEntrantId as EventEntrantId | undefined;
      const lapNo = Number(button.dataset.lapChartLapNo);
      const position = Number(button.dataset.lapChartPosition);
      if (!entrantId || Number.isNaN(lapNo) || Number.isNaN(position)) {
        return;
      }

      if (!entrantOrder.has(entrantId)) {
        entrantOrder.set(entrantId, entrantOrder.size);
      }

      const buttonRect = button.getBoundingClientRect();
      const point: LapChartLinePoint = {
        domOrder,
        entrantId,
        lapNo,
        position,
        x: buttonRect.left - wrapperRect.left + buttonRect.width / 2,
        y: buttonRect.top - wrapperRect.top + buttonRect.height / 2,
      };
      const points = pointsByEntrant.get(entrantId) || [];
      points.push(point);
      pointsByEntrant.set(entrantId, points);
    });

    const segments: LapChartLineSegment[] = [];
    pointsByEntrant.forEach((points, entrantId) => {
      const sortedPoints = [...points].sort((left, right) => {
        if (left.lapNo !== right.lapNo) {
          return left.lapNo - right.lapNo;
        }
        if (left.position !== right.position) {
          return left.position - right.position;
        }
        return left.domOrder - right.domOrder;
      });
      const entrantIndex = entrantOrder.get(entrantId) || 0;
      const color = getLapChartEntrantLineColor(entrantId, entrantIndex);
      sortedPoints.slice(1).forEach((point, index) => {
        const previousPoint = sortedPoints[index];
        segments.push({
          color,
          entrantId,
          key: `${entrantId}-${previousPoint.lapNo}-${previousPoint.position}-${point.lapNo}-${point.position}-${index}`,
          x1: previousPoint.x,
          x2: point.x,
          y1: previousPoint.y,
          y2: point.y,
        });
      });
    });

    setLapChartLineSegments(segments);
  }, [drawLineChart, reportType]);

  React.useLayoutEffect(() => {
    updateLapChartLineSegments();
  }, [lapChart, maxLapPosition, updateLapChartLineSegments]);

  React.useEffect(() => {
    if (!drawLineChart || reportType !== 'lap-chart') {
      return undefined;
    }

    window.addEventListener('resize', updateLapChartLineSegments);
    return () => {
      window.removeEventListener('resize', updateLapChartLineSegments);
    };
  }, [drawLineChart, reportType, updateLapChartLineSegments]);

  const fastestLapRows = React.useMemo(() => {
    return buildFastestLapReportRows(rows, ignoreFirstLapForFastestLaps);
  }, [ignoreFirstLapForFastestLaps, rows]);

  const yellowFlagPeriods = React.useMemo(() => calculateYellowFlagPeriods(
    props.raceState.records,
    rows.map((row) => ({
      laps: row.laps,
      name: getRowDriverName(row) || row.entrantName,
    })),
    selectedCategory === 'overall' ? undefined : selectedCategory as EventCategoryId,
  ), [props.raceState.records, rows, selectedCategory]);

  const eventParticipantNames = React.useMemo(() => {
    return reportParticipants.map((participant) => participant.name).filter((name) => name.length > 0);
  }, [reportParticipants]);

  return (
    <section className="events-screen">
      <h1>Reports</h1>
      <p>Category-scoped reports for fastest laps, participant lap times, and lap chart.</p>
      <section className="events-panel">
        <div className="events-actions">
          <EventSessionSelector
            onSelectEventSession={props.onSelectEventSession}
            options={props.eventSessionOptions}
            selectedValue={props.selectedEventSessionValue}
          />
          <TextField
            className="page-filter-label"
            label="Report"
            select
            slotProps={{
              select: {
                'aria-label': 'Reports View Type',
              },
            }}
            value={reportType}
            onChange={(event) => updateViewState({ reportType: event.target.value as ReportType })}
          >
            <MenuItem value="fastest-laps">Fastest Laps</MenuItem>
            <MenuItem value="fastest-lap-timeline">Fastest Lap Timeline</MenuItem>
            <MenuItem value="lap-times">Lap Times</MenuItem>
            <MenuItem value="lap-chart">Lap Chart</MenuItem>
            <MenuItem value="yellow-flag-periods">Yellow Flag periods</MenuItem>
            <MenuItem value="track-map">Track Map</MenuItem>
            <MenuItem value="handicap-data">Handicap Data</MenuItem>
          </TextField>
          <select
            aria-label="Reports View Type"
            hidden
            value={reportType}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>): void =>
              updateViewState({ reportType: event.target.value as ReportType })}
          >
            <option value="fastest-laps">Fastest Laps</option>
            <option value="fastest-lap-timeline">Fastest Lap Timeline</option>
            <option value="lap-times">Lap Times</option>
            <option value="lap-chart">Lap Chart</option>
            <option value="yellow-flag-periods">Yellow Flag periods</option>
            <option value="track-map">Track Map</option>
            <option value="handicap-data">Handicap Data</option>
          </select>
          {reportType !== 'handicap-data' ? (
            <CategorySelector categories={categories} selectedCategory={selectedCategory} onSelectCategory={(category: CategoryFilter) => updateViewState({ selectedCategory: category })} />
          ) : null}
          {reportType === 'handicap-data' ? (
            <label className="page-filter-label">
              Show
              <select
                aria-label="Handicap Show Filter"
                value={handicapShowFilter}
                onChange={(event) => updateViewState({ handicapShowFilter: event.target.value as 'all' | 'event-participants-only' })}
              >
                <option value="all">All known participants</option>
                <option value="event-participants-only">Event participants only</option>
              </select>
            </label>
          ) : null}
        </div>
      </section>

      {reportType === 'fastest-laps' ? (
        <section className="events-panel">
          <h2>Fastest Laps</h2>
          <label className="lap-chart-line-toggle">
            <input
              aria-label="Ignore first lap"
              type="checkbox"
              checked={ignoreFirstLapForFastestLaps}
              onChange={(event) => updateViewState({ ignoreFirstLapForFastestLaps: event.target.checked })}
            />
            Ignore first lap
          </label>
          <table aria-label="Fastest Laps Report Table">
            <thead>
              <tr>
                <th>{numberLabel}</th>
                <th>{participantLabel}</th>
                <th>Category</th>
                <th>Fastest Lap</th>
                <th>On</th>
                <th>Total Laps</th>
              </tr>
            </thead>
            <tbody>
              {fastestLapRows.map((row) => (
                <tr key={row.entrantId}>
                  <td>{getRowRaceNumber(row) || row.fastestLapPlate || '-'}</td>
                  <td>{useParticipantIdentity ? getRowDriverName(row) || '-' : row.entrantName}</td>
                  <td>{row.categoryName}</td>
                  <td>{formatDuration(row.fastestLap)}</td>
                  <td>{row.fastestLapNo || '-'}</td>
                  <td>{row.lapCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {reportType === 'fastest-lap-timeline' ? (
        <section className="events-panel">
          <h2>Fastest Lap Timeline</h2>
          <label className="lap-chart-line-toggle">
            <input
              aria-label="Ignore first lap"
              type="checkbox"
              checked={ignoreFirstLapForTimeline}
              onChange={(event) => updateViewState({ ignoreFirstLapForTimeline: event.target.checked })}
            />
            Ignore first lap
          </label>
          <table aria-label="Fastest Lap Timeline Report Table">
            <thead>
              <tr>
                <th>{numberLabel}</th>
                <th>{timelineParticipantLabel}</th>
                <th>Team</th>
                <th>Time of day</th>
                <th>Elapsed</th>
                <th>On</th>
                <th>Lap Time</th>
              </tr>
            </thead>
            <tbody>
              {fastestLapTimelineRows.map((row) => (
                <tr key={`${row.participantId}-${row.lapNo}-${row.elapsedTime}`}>
                  <td>{row.raceNumber}</td>
                  <td>{row.participantName}</td>
                  <td>{row.teamName || '-'}</td>
                  <td>{tableTimeString(row.time)}</td>
                  <td>{formatDuration(row.elapsedTime)}</td>
                  <td>{row.lapNo}</td>
                  <td>{formatDuration(row.lapTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {reportType === 'lap-times' ? (
        <LapTimesReport
          participants={reportParticipants}
          categories={categories}
          onStateChange={(lapTimes: LapTimesReportState) => updateViewState({ lapTimes })}
          passings={lapTimePassings}
          state={viewState.lapTimes}
        />
      ) : null}

      {reportType === 'lap-chart' ? (
        <section className="events-panel">
          <h2>Lap Chart</h2>
          <label className="lap-chart-line-toggle">
            <input
              type="checkbox"
              checked={drawLineChart}
              onChange={(event) => updateViewState({ drawLineChart: event.target.checked })}
            />
            Draw line chart
          </label>
          <div className="lap-chart-table-wrapper" ref={lapChartWrapperRef}>
            {drawLineChart ? (
              <svg className="lap-chart-line-overlay" aria-hidden="true">
                {lapChartLineSegments.map((segment) => (
                  <line
                    key={segment.key}
                    className="lap-chart-line-overlay__line"
                    data-lap-chart-entrant-id={segment.entrantId}
                    stroke={segment.color}
                    x1={segment.x1}
                    x2={segment.x2}
                    y1={segment.y1}
                    y2={segment.y2}
                  />
                ))}
              </svg>
            ) : null}
            <table aria-label="Reports Lap Chart Table" className="lap-chart-table">
              <thead>
                <tr>
                  <th>Position</th>
                  {lapChart.map((column) => (
                    <th key={`reports-lap-column-${column.lapNo}`}>Lap {column.lapNo}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: maxLapPosition }, (_, rowIndex) => (
                  <tr key={`reports-lap-row-${rowIndex + 1}`}>
                    <td>{rowIndex + 1}</td>
                    {lapChart.map((column) => {
                      const entry = column.entries[rowIndex];
                      const isSelectedEntrant = !!entry && selectedLapEntry?.entrantId === entry.entrantId;
                      return (
                        <td
                          key={`reports-lap-cell-${column.lapNo}-${rowIndex + 1}`}
                          className={isSelectedEntrant ? 'lap-chart-table__entrant-cell--selected' : undefined}
                        >
                          {entry ? (
                            <button
                              type="button"
                              className="lap-entry-button"
                              aria-pressed={isSelectedEntrant}
                              data-lap-chart-entrant-id={entry.entrantId}
                              data-lap-chart-lap-no={entry.lapNo}
                              data-lap-chart-position={entry.position}
                              onClick={() => handleReportLapEntryClick(entry)}
                            >
                              {entry.raceNumber}
                            </button>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selectedLapEntry ? (
            <aside className="events-panel lap-entry-info" aria-label="Lap Entry Details">
              <h3>Lap Entry Details</h3>
              <p>Rider: {selectedLapEntry.raceNumber} · {selectedLapEntry.participantName}</p>
              <p>Entrant: {selectedLapEntry.entrantName} ({selectedLapEntry.entrantId})</p>
              <p>Category: {selectedLapEntry.categoryName}</p>
              <p>Lap: {selectedLapEntry.lapNo}</p>
              <p>Position: {selectedLapEntry.position}</p>
              <p>Lap Time: {formatDuration(selectedLapEntry.lapTime)}</p>
            </aside>
          ) : null}
        </section>
      ) : null}

      {reportType === 'handicap-data' ? (
        <section className="events-panel">
          <HandicapView
            participantNames={handicapShowFilter === 'event-participants-only' ? eventParticipantNames : undefined}
          />
        </section>
      ) : null}

      {reportType === 'yellow-flag-periods' ? (
        <section className="events-panel">
          <h2>Yellow Flag periods</h2>
          <table aria-label="Yellow Flag Periods Report Table">
            <thead>
              <tr>
                <th>From Lap</th>
                <th>Time of Day</th>
                <th>Duration</th>
                <th>Leader at Flag</th>
                <th>Until Lap</th>
                <th>Until Time</th>
              </tr>
            </thead>
            <tbody>
              {yellowFlagPeriods.map((period, index) => (
                <tr key={`yellow-flag-period-${index}`}>
                  <td>{period.fromLap ?? '-'}</td>
                  <td>{tableTimeString(period.fromTime, props.event?.timeZone)}</td>
                  <td>{formatDuration(period.duration)}</td>
                  <td>{period.leaderAtFlag || '-'}</td>
                  <td>{period.untilLap ?? '-'}</td>
                  <td>{tableTimeString(period.untilTime, props.event?.timeZone)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      {reportType === 'track-map' ? (
        <section className="events-panel">
          <h2>Track Map</h2>
          <TrackMapReport catalogEntries={props.catalogEntries} catalogEntrants={props.catalogEntrants} event={props.event} raceState={props.raceState} />
        </section>
      ) : null}
    </section>
  );
};
