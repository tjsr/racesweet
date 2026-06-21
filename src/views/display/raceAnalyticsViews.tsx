import type { RaceStateLookup, Session } from '../../model/racestate.js';

import type { EventCatalogEntrant } from '../../app/eventCatalog.js';
import type { EventParticipant } from '../../model/eventparticipant.js';
import { HandicapView } from './handicap.js';
import { LapTimesReport } from '../reports/LapTimesReport.js';
import type { ParticipantPassingRecord } from '../../model/timerecord.js';
import React from 'react';
import { getParticipantNumber } from '../../controllers/participant.js';
import { millisecondsToTime } from '../../app/utils/timeutils.js';

interface CategoryOption {
  id: string;
  name: string;
}

export interface EventSessionOption {
  eventId: string;
  eventName: string;
  sessionId?: string;
  sessionName?: string;
  value: string;
}

interface EntrantSummaryRow {
  categoryKeys: string[];
  categoryName: string;
  entrantId: string;
  entrantName: string;
  fastestLap?: number;
  lapCount: number;
  laps: ParticipantPassingRecord[];
  memberDetails: Array<{
    categoryName: string;
    participantId: string;
    participantName: string;
    raceNumber: string;
  }>;
  totalTime?: number;
}

interface LapChartEntry {
  categoryName: string;
  crossingTime: number;
  entrantId: string;
  entrantName: string;
  lapNo: number;
  lapTime?: number;
  participantName: string;
  position: number;
  raceNumber: string;
}

interface LapChartColumn {
  entries: LapChartEntry[];
  lapNo: number;
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
  selectedCategoryId?: string;
}

interface ReportsPageProps extends BaseRaceAnalyticsProps {
  selectedCategoryId?: string;
}

type CategoryFilter = 'overall' | string;

const normalizeText = (value: string): string => value.trim().toLowerCase();

const categoryNameFromId = (raceState: Session & RaceStateLookup, categoryId?: string): string => {
  if (!categoryId) {
    return 'Unknown';
  }

  return raceState.getCategoryById(categoryId)?.name || categoryId;
};

const categoryKeyFromName = (name: string): string => normalizeText(name);

const _categoryKeyFromId = (raceState: Session & RaceStateLookup, categoryId?: string): string => {
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

const formatDuration = (duration?: number): string => {
  if (!duration || duration <= 0) {
    return '--:--:--.---';
  }
  return millisecondsToTime(duration);
};

const isValidLap = (lap: ParticipantPassingRecord): boolean => {
  return (lap.lapNo || 0) > 0 && lap.isExcluded !== true && typeof lap.elapsedTime === 'number' && lap.elapsedTime >= 0;
};

const findEntrantName = (entrantId: string, members: EventParticipant[], catalogEntrantsById: Map<string, EventCatalogEntrant>): string => {
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

const buildEntrantRows = (
  raceState: Session & RaceStateLookup,
  catalogEntrants: EventCatalogEntrant[],
): EntrantSummaryRow[] => {
  const catalogEntrantsById = new Map(catalogEntrants.map((entrant) => [entrant.id, entrant]));
  const participantGroups = new Map<string, EventParticipant[]>();

  raceState.participants.forEach((participant) => {
    const entrantId = participant.entrantId?.toString() || participant.id.toString();
    const group = participantGroups.get(entrantId) || [];
    group.push(participant);
    participantGroups.set(entrantId, group);
  });

  const rows: EntrantSummaryRow[] = [];

  participantGroups.forEach((members, entrantId) => {
    const laps = members
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

    const fastestLap = laps
      .map((lap) => lap.lapTime || undefined)
      .filter((lapTime): lapTime is number => typeof lapTime === 'number' && lapTime > 0)
      .sort((a, b) => a - b)[0];

    const totalTime = laps.length > 0 ? laps[laps.length - 1].elapsedTime || undefined : undefined;
    const memberDetails = members.map((member) => {
      const raceNumber = getParticipantNumber(member);
      return {
        categoryName: categoryNameFromId(raceState, member.categoryId?.toString()),
        participantId: member.id.toString(),
        participantName: `${member.firstname || ''} ${member.surname || ''}`.trim() || member.id.toString(),
        raceNumber: raceNumber ? raceNumber.toString() : member.id.toString(),
      };
    });
    const categoryKeys = Array.from(new Set(memberDetails.map((member) => categoryKeyFromName(member.categoryName))));
    const categoryName = memberDetails.map((member) => member.categoryName).filter((value, index, values) => values.indexOf(value) === index).join(', ');

    rows.push({
      categoryKeys,
      categoryName,
      entrantId,
      entrantName: findEntrantName(entrantId, members, catalogEntrantsById),
      fastestLap,
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

  return (
    <label className="page-filter-label">
      Event/Session
      <select
        aria-label="Race View Event Session"
        value={props.selectedValue || props.options[0]?.value || ''}
        onChange={(event) => props.onSelectEventSession?.(event.target.value)}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.sessionId ? `  ${option.sessionName || option.sessionId}` : option.eventName}
          </option>
        ))}
      </select>
    </label>
  );
};

export const ResultsPage = (props: ResultsPageProps): React.ReactElement => {
  const categories = React.useMemo(() => dedupeCategoryOptions(props.categories), [props.categories]);
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

  const allRows = React.useMemo(() => {
    return buildEntrantRows(props.raceState, props.catalogEntrants);
  }, [props.catalogEntrants, props.raceState]);

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
  const categories = React.useMemo(() => dedupeCategoryOptions(props.categories), [props.categories]);
  const [selectedCategory, setSelectedCategory] = React.useState<CategoryFilter>(props.selectedCategoryId || 'overall');
  const [selectedLapEntry, setSelectedLapEntry] = React.useState<LapChartEntry | undefined>(undefined);
  const [reportType, setReportType] = React.useState<'fastest-laps' | 'lap-times' | 'lap-chart' | 'handicap-data'>('fastest-laps');
  const [handicapShowFilter, setHandicapShowFilter] = React.useState<'all' | 'event-participants-only'>('all');

  const allRows = React.useMemo(() => {
    return buildEntrantRows(props.raceState, props.catalogEntrants);
  }, [props.catalogEntrants, props.raceState]);

  const rows = React.useMemo(() => {
    if (selectedCategory === 'overall') {
      return allRows;
    }
    const categoryName = categories.find((category) => category.id === selectedCategory)?.name || selectedCategory;
    const categoryKey = categoryKeyFromName(categoryName);
    return allRows.filter((row) => row.categoryKeys.includes(categoryKey));
  }, [allRows, categories, selectedCategory]);

  const passings = React.useMemo(() => {
    const map = new Map<string, ParticipantPassingRecord[]>();
    props.raceState.participants.forEach((participant) => {
      const laps = (props.raceState.getParticipantLaps(participant.id) || [])
        .filter(isValidLap)
        .sort((a, b) => {
          if ((a.lapNo || 0) !== (b.lapNo || 0)) {
            return (a.lapNo || 0) - (b.lapNo || 0);
          }
          return (a.elapsedTime || 0) - (b.elapsedTime || 0);
        });
      map.set(participant.id.toString(), laps);
    });
    return map;
  }, [props.raceState]);

  const lapChart = React.useMemo(() => {
    return buildLapChart(rows);
  }, [rows]);

  const maxLapPosition = React.useMemo(() => {
    return lapChart.reduce((maxValue, lap) => Math.max(maxValue, lap.entries.length), 0);
  }, [lapChart]);

  const fastestLapRows = React.useMemo(() => {
    return [...rows].sort((left, right) => {
      if (typeof left.fastestLap !== 'number') {
        return 1;
      }
      if (typeof right.fastestLap !== 'number') {
        return -1;
      }
      return left.fastestLap - right.fastestLap;
    });
  }, [rows]);

  const eventParticipantNames = React.useMemo(() => {
    return props.raceState.participants.map((participant) =>
      `${participant.firstname || ''} ${participant.surname || ''}`.trim()
    ).filter((name) => name.length > 0);
  }, [props.raceState]);

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
              onChange={(event) => setReportType(event.target.value as 'fastest-laps' | 'lap-times' | 'lap-chart' | 'handicap-data')}
            >
              <option value="fastest-laps">Fastest Laps</option>
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
          <table aria-label="Fastest Laps Report Table">
            <thead>
              <tr>
                <th>Entrant</th>
                <th>Category</th>
                <th>Fastest Lap</th>
                <th>Total Laps</th>
              </tr>
            </thead>
            <tbody>
              {fastestLapRows.map((row) => (
                <tr key={row.entrantId}>
                  <td>{row.entrantName}</td>
                  <td>{row.categoryName}</td>
                  <td>{formatDuration(row.fastestLap)}</td>
                  <td>{row.lapCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {reportType === 'lap-times' ? (
        <LapTimesReport
          participants={props.raceState.participants}
          categories={categories}
          passings={passings}
        />
      ) : null}

      {reportType === 'lap-chart' ? (
        <section className="events-panel">
          <h2>Lap Chart</h2>
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
                    return (
                      <td key={`reports-lap-cell-${column.lapNo}-${rowIndex + 1}`}>
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
