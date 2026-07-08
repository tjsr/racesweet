import type { RaceStateLookup, Session } from '../../model/racestate.js';

import React from 'react';
import type { EventCatalogEntrant } from '../../catalog/eventCatalog.js';
import { millisecondsToTime, tableTimeString } from '../../app/utils/timeutils.js';
import { shouldExcludeCategoryFromResults } from '../../controllers/category.js';
import { getParticipantNumber } from '../../controllers/participant.js';
import { EventEntrantId } from '../../model/entrant.js';
import type { EventParticipant, EventParticipantId } from '../../model/eventparticipant.js';
import { EventCategoryId } from '../../model/index.js';
import { EventId, SessionId } from '../../model/raceevent.js';
import type { ParticipantPassingRecord } from '../../model/timerecord.js';
import { LapTimesReport } from '../reports/LapTimesReport.js';
import { HandicapView } from './handicap.js';

interface CategoryOption {
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
    participantId: EventParticipantId;
    participantName: string;
    raceNumber: string;
  }>;
  totalTime?: number;
}

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
  catalogEntrants: EventCatalogEntrant[];
  eventSessionOptions?: EventSessionOption[];
  onSelectEventSession?: (value: string) => void;
  raceState: Session & RaceStateLookup;
  selectedEventSessionValue?: string;
}

interface ResultsPageProps extends BaseRaceAnalyticsProps {
  selectedCategoryId?: EventCategoryId;
}

interface ReportsPageProps extends BaseRaceAnalyticsProps {
  selectedCategoryId?: EventCategoryId;
}

type CategoryFilter = 'overall' | string;

const lapChartLineColors: string[] = ['#0057b8', '#b00020', '#217a34', '#7a4cc2', '#a65f00', '#007a78'];

const normalizeText = (value: string): string => value.trim().toLowerCase();

const getLapChartEntrantLineColor = (_entrantId: EventEntrantId, entrantIndex: number): string => {
  return lapChartLineColors[entrantIndex % lapChartLineColors.length];
};

const getCategoryByIdSafely = (
  raceState: Session & RaceStateLookup,
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

const categoryNameFromId = (raceState: Session & RaceStateLookup, categoryId?: EventCategoryId): string => {
  if (!categoryId) {
    return 'Unknown';
  }

  return getCategoryByIdSafely(raceState, categoryId)?.name || categoryId;
};

const categoryKeyFromName = (name: string): string => normalizeText(name);

const _categoryKeyFromId = (raceState: Session & RaceStateLookup, categoryId?: EventCategoryId): string => {
  return categoryKeyFromName(categoryNameFromId(raceState, categoryId));
};

const dedupeCategoryOptions = (categories: CategoryOption[]): CategoryOption[] => {
  const byKey = new Map<string, CategoryOption>();
  categories.forEach((category) => {
    const key = categoryKeyFromName(category.name);
    if (!byKey.has(key)) {
      byKey.set(key, category);
    }
  });
  return Array.from(byKey.values());
};

const getExcludedCategoryKeys = (
  raceState: Session & RaceStateLookup,
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
  raceState: Session & RaceStateLookup,
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

const isValidLap = (lap: ParticipantPassingRecord): boolean => {
  return (lap.lapNo || 0) > 0 && lap.isExcluded !== true && typeof lap.elapsedTime === 'number' && lap.elapsedTime >= 0;
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
  raceState: Session & RaceStateLookup,
  catalogEntrants: EventCatalogEntrant[],
  excludedCategoryKeys: Set<string>,
): EntrantSummaryRow[] => {
  const catalogEntrantsById = new Map(catalogEntrants.map((entrant) => [entrant.id, entrant]));
  const participantGroups = new Map<EventEntrantId, EventParticipant[]>();

  raceState.participants.forEach((participant) => {
    const entrantId = participant.entrantId?.toString() || participant.id.toString();
    const group = participantGroups.get(entrantId) || [];
    group.push(participant);
    participantGroups.set(entrantId, group);
  });

  const rows: EntrantSummaryRow[] = [];

  participantGroups.forEach((members, entrantId: EventEntrantId) => {
    const includedMembers = members.filter((member) => !isParticipantExcludedFromResults(raceState, member, excludedCategoryKeys));
    if (includedMembers.length === 0) {
      return;
    }

    const laps = includedMembers
      .flatMap((member) => raceState.getParticipantLaps(member.id) || [])
      .filter(isValidLap)
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
      const raceNumber = getParticipantNumber(member);
      return {
        categoryId: member.categoryId?.toString(),
        categoryName: categoryNameFromId(raceState, member.categoryId?.toString()),
        participantId: member.id.toString(),
        participantName: `${member.firstname || ''} ${member.surname || ''}`.trim() || member.id.toString(),
        raceNumber: raceNumber ? raceNumber.toString() : member.id.toString(),
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
      entrantName: findEntrantName(entrantId, members, catalogEntrantsById),
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
      if (!lap.lapNo || !lap.participantId || !isValidLap(lap)) {
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

const getRaceStateContentSignature = (raceState: Session & RaceStateLookup): string => {
  const participantSignature = raceState.participants
    .map((participant) => `${participant.id}:${participant.categoryId}:${participant.identifiers?.length || 0}`)
    .join('|');
  const recordSignature = raceState.records
    .map((record) => {
      const passing = record as ParticipantPassingRecord;
      return `${record.id}:${passing.participantId || ''}:${passing.lapNo || ''}:${passing.lapTime || ''}:${record.time?.getTime() || ''}`;
    })
    .join('|');

  return `${participantSignature}::${recordSignature}`;
};

const buildFastestLapTimeline = (rows: EntrantSummaryRow[], ignoreFirstLap: boolean): FastestLapTimelineRow[] => {
  const candidates = rows.flatMap((row) => {
    const memberById = new Map(row.memberDetails.map((detail) => [detail.participantId, detail]));
    const isTeamEntrant = row.memberDetails.length > 1;

    return row.laps
      .filter((lap) => {
        return isValidLap(lap) &&
          typeof lap.lapTime === 'number' &&
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
  return (
    <label className="page-filter-label">
      Category
      <select
        aria-label="Race View Category"
        value={props.selectedCategory}
        onChange={(event) => props.onSelectCategory(event.target.value as CategoryFilter)}
      >
        <option value="overall">Overall</option>
        {props.categories.map((category) => (
          <option key={category.id} value={category.id}>{category.name}</option>
        ))}
      </select>
    </label>
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
    <label className="page-filter-label">
      Event/Session
      <select
        aria-label="Race View Event Session"
        value={selectedValue}
        onChange={(event) => {
          if (!event.target.selectedOptions[0]?.disabled) {
            props.onSelectEventSession?.(event.target.value);
          }
        }}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value} disabled={!option.sessionId}>
            {option.sessionId ? `-> ${option.sessionName || option.sessionId}` : option.eventName}
          </option>
        ))}
      </select>
    </label>
  );
};

export const ResultsPage = (props: ResultsPageProps): React.ReactElement => {
  const excludedCategoryKeys = React.useMemo(() => getExcludedCategoryKeys(props.raceState, props.categories), [props.categories, props.raceState]);
  const categories = React.useMemo(() => {
    return dedupeCategoryOptions(props.categories).filter((category) => !excludedCategoryKeys.has(categoryKeyFromName(category.name)));
  }, [excludedCategoryKeys, props.categories]);
  const [selectedCategory, setSelectedCategory] = React.useState<CategoryFilter>(props.selectedCategoryId || 'overall');
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
    return buildEntrantRows(props.raceState, props.catalogEntrants, excludedCategoryKeys);
  }, [excludedCategoryKeys, props.catalogEntrants, props.raceState, raceStateContentSignature]);

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
          <label className="page-filter-label">
            View
            <select
              aria-label="Results View Type"
              value={viewType}
              onChange={(event) => setViewType(event.target.value as 'results' | 'lap-chart')}
            >
              <option value="results">Results</option>
              <option value="lap-chart">Lap Chart</option>
            </select>
          </label>
        </div>
      </section>

      {viewType === 'results' ? (
        <section className="events-panel">
          <h2>Results</h2>
          <table aria-label="Results Table">
            <thead>
              <tr>
                <th>Position</th>
                <th>Entrant</th>
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
                  <td>{row.entrantName}</td>
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
  const excludedCategoryKeys = React.useMemo(() => getExcludedCategoryKeys(props.raceState, props.categories), [props.categories, props.raceState]);
  const categories = React.useMemo(() => {
    return dedupeCategoryOptions(props.categories).filter((category) => !excludedCategoryKeys.has(categoryKeyFromName(category.name)));
  }, [excludedCategoryKeys, props.categories]);
  const [selectedCategory, setSelectedCategory] = React.useState<CategoryFilter>(props.selectedCategoryId || 'overall');
  const [selectedLapEntry, setSelectedLapEntry] = React.useState<LapChartEntry | undefined>(undefined);
  const [drawLineChart, setDrawLineChart] = React.useState<boolean>(false);
  const [lapChartLineSegments, setLapChartLineSegments] = React.useState<LapChartLineSegment[]>([]);
  const [reportType, setReportType] = React.useState<'fastest-laps' | 'fastest-lap-timeline' | 'lap-times' | 'lap-chart' | 'handicap-data'>('fastest-laps');
  const [ignoreFirstLapForFastestLaps, setIgnoreFirstLapForFastestLaps] = React.useState<boolean>(true);
  const [ignoreFirstLapForTimeline, setIgnoreFirstLapForTimeline] = React.useState<boolean>(true);
  const [handicapShowFilter, setHandicapShowFilter] = React.useState<'all' | 'event-participants-only'>('all');
  const lapChartWrapperRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (selectedCategory !== 'overall' && !categories.some((category) => category.id === selectedCategory)) {
      setSelectedCategory('overall');
    }
  }, [categories, selectedCategory]);

  const raceStateContentSignature = getRaceStateContentSignature(props.raceState);
  const allRows = React.useMemo(() => {
    return buildEntrantRows(props.raceState, props.catalogEntrants, excludedCategoryKeys);
  }, [excludedCategoryKeys, props.catalogEntrants, props.raceState, raceStateContentSignature]);

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
    raceNumber: Array.from(new Set(row.memberDetails.map((member) => member.raceNumber))).join(' / '),
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
          <label className="page-filter-label">
            Report
            <select
              aria-label="Reports View Type"
              value={reportType}
              onChange={(event) => setReportType(event.target.value as 'fastest-laps' | 'fastest-lap-timeline' | 'lap-times' | 'lap-chart' | 'handicap-data')}
            >
              <option value="fastest-laps">Fastest Laps</option>
              <option value="fastest-lap-timeline">Fastest Lap Timeline</option>
              <option value="lap-times">Lap Times</option>
              <option value="lap-chart">Lap Chart</option>
              <option value="handicap-data">Handicap Data</option>
            </select>
          </label>
          {reportType !== 'handicap-data' ? (
            <CategorySelector categories={categories} selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory} />
          ) : null}
          {reportType === 'handicap-data' ? (
            <label className="page-filter-label">
              Show
              <select
                aria-label="Handicap Show Filter"
                value={handicapShowFilter}
                onChange={(event) => setHandicapShowFilter(event.target.value as 'all' | 'event-participants-only')}
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
              onChange={(event) => setIgnoreFirstLapForFastestLaps(event.target.checked)}
            />
            Ignore first lap
          </label>
          <table aria-label="Fastest Laps Report Table">
            <thead>
              <tr>
                <th>Plate</th>
                <th>Entrant</th>
                <th>Category</th>
                <th>Fastest Lap</th>
                <th>On</th>
                <th>Total Laps</th>
              </tr>
            </thead>
            <tbody>
              {fastestLapRows.map((row) => (
                <tr key={row.entrantId}>
                  <td>{row.fastestLapPlate || '-'}</td>
                  <td>{row.entrantName}</td>
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
              onChange={(event) => setIgnoreFirstLapForTimeline(event.target.checked)}
            />
            Ignore first lap
          </label>
          <table aria-label="Fastest Lap Timeline Report Table">
            <thead>
              <tr>
                <th>Plate</th>
                <th>Participant</th>
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
          passings={lapTimePassings}
        />
      ) : null}

      {reportType === 'lap-chart' ? (
        <section className="events-panel">
          <h2>Lap Chart</h2>
          <label className="lap-chart-line-toggle">
            <input
              type="checkbox"
              checked={drawLineChart}
              onChange={(event) => setDrawLineChart(event.target.checked)}
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
    </section>
  );
};
