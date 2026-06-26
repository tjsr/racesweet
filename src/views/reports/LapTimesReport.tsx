import './LapTimesReport.css';

import { millisecondsToTime, tableTimeString } from '../../app/utils/timeutils.ts';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { EventCategory } from '../../model/eventcategory.ts';
import type { ParticipantPassingRecord } from '../../model/timerecord.ts';

export type ShowAs = 'individual' | 'table';

export interface LapTimesReportEntry {
  categoryIds: string[];
  id: string;
  name: string;
}

export interface LapTimesReportProps {
  participants: LapTimesReportEntry[];
  categories: EventCategory[];
  passings: Map<string, ParticipantPassingRecord[]>;
  title?: string;
}

const ALL_CATEGORIES = '__all__';
const MIN_LAPS_PER_BLOCK = 5;
const MAX_LAPS_PER_BLOCK = 10;
/** Approximate width (px) of a single lap-time column in the table view. */
const LAP_COL_WIDTH_PX = 90;
/** Approximate width (px) of the fixed identifier columns (# + Name). */
const FIXED_COLS_WIDTH_PX = 160;

const formatMs = (ms: number | null | undefined): string =>
  ms != null ? millisecondsToTime(ms) : '--:--:--.---';

// ─── Individual view ──────────────────────────────────────────────────────────

interface IndividualViewProps {
  participant: LapTimesReportEntry;
  laps: ParticipantPassingRecord[];
}

const IndividualView = ({ participant, laps }: IndividualViewProps) => {
  const validLaps = laps.filter((l) => l.lapNo != null && l.lapNo > 0);

  return (
    <div className="lap-times-individual">
      <h3>
        {participant.name}
      </h3>
      {validLaps.length === 0 ? (
        <p className="lap-times-report__empty">No lap times recorded.</p>
      ) : (
        <table aria-label="Lap Times Report Table" className="lap-times-table">
          <thead>
            <tr>
              <th>Lap</th>
              <th>Lap Time</th>
              <th>Time of day</th>
              <th>Elapsed</th>
            </tr>
          </thead>
          <tbody>
            {validLaps.map((lap) => (
              <tr
                key={lap.id}
                className={lap.isExcluded ? 'excluded' : undefined}
              >
                <td>{lap.lapNo}</td>
                <td>{formatMs(lap.lapTime)}</td>
                <td>{tableTimeString(lap.time)}</td>
                <td>{formatMs(lap.elapsedTime)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

// ─── Table view ───────────────────────────────────────────────────────────────

interface TableViewProps {
  participants: LapTimesReportEntry[];
  passings: Map<string, ParticipantPassingRecord[]>;
  lapsPerBlock: number;
}

const TableView = ({ participants, passings, lapsPerBlock }: TableViewProps) => {
  const maxLaps = participants.reduce((max, p) => {
    const laps = passings.get(p.id) ?? [];
    const validCount = laps.filter((l) => l.lapNo != null && l.lapNo > 0).length;
    return Math.max(max, validCount);
  }, 0);

  if (maxLaps === 0) {
    return <p className="lap-times-report__empty">No lap times recorded.</p>;
  }

  const blockCount = Math.ceil(maxLaps / lapsPerBlock);
  const blocks = Array.from({ length: blockCount }, (_, i) => {
    const startLap = i * lapsPerBlock + 1;
    const endLap = Math.min(startLap + lapsPerBlock - 1, maxLaps);
    return { endLap, startLap };
  });

  return (
    <div className="lap-times-grid">
      {blocks.map(({ startLap, endLap }) => {
        const lapNums = Array.from(
          { length: endLap - startLap + 1 },
          (_, i) => startLap + i
        );
        return (
          <div key={startLap} className="lap-times-block">
            <table className="lap-times-block-table">
              <thead>
                <tr>
                  <th className="participant-num">#</th>
                  <th className="participant-name">Name</th>
                  {lapNums.map((n) => (
                    <th key={n}>L{n}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => {
                  const laps = passings.get(p.id) ?? [];
                  const lapMap = new Map<number, ParticipantPassingRecord>();
                  laps.forEach((l) => {
                    if (l.lapNo != null && l.lapNo > 0) {
                      lapMap.set(l.lapNo, l);
                    }
                  });
                  const rowLaps = lapNums.map((n) => lapMap.get(n));
                  const hasAnyLap = rowLaps.some((l) => l != null);

                  if (!hasAnyLap) return null;

                  return (
                    <tr key={p.id}>
                      <td className="participant-num">
                        {p.id}
                      </td>
                      <td className="participant-name">
                        {p.name}
                      </td>
                      {rowLaps.map((lap, idx) => (
                        <td
                          key={lapNums[idx]}
                          className={lap == null ? 'no-lap' : undefined}
                        >
                          {lap != null ? formatMs(lap.lapTime) : '—'}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export const LapTimesReport = ({
  participants,
  categories,
  passings,
  title = 'Lap Times Report',
}: LapTimesReportProps) => {
  const [showAs, setShowAs] = useState<ShowAs>('individual');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(ALL_CATEGORIES);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>('');
  const [lapsPerBlock, setLapsPerBlock] = useState(MAX_LAPS_PER_BLOCK);

  const containerRef = useRef<HTMLDivElement>(null);

  const recalcLapsPerBlock = useCallback(() => {
    if (!containerRef.current) return;
    const availableWidth = containerRef.current.clientWidth - FIXED_COLS_WIDTH_PX;
    const computed = Math.floor(availableWidth / LAP_COL_WIDTH_PX);
    setLapsPerBlock(
      Math.min(MAX_LAPS_PER_BLOCK, Math.max(MIN_LAPS_PER_BLOCK, computed))
    );
  }, []);

  useEffect(() => {
    recalcLapsPerBlock();
    const observer = new ResizeObserver(recalcLapsPerBlock);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [recalcLapsPerBlock]);

  // Participants filtered to the selected category (for individual view)
  const filteredParticipants =
    selectedCategoryId === ALL_CATEGORIES
      ? participants
      : participants.filter((p) => p.categoryIds.includes(selectedCategoryId));

  // Auto-select first participant when filter changes
  useEffect(() => {
    if (
      showAs === 'individual' &&
      filteredParticipants.length > 0 &&
      !filteredParticipants.find((p) => p.id === selectedParticipantId)
    ) {
      setSelectedParticipantId(filteredParticipants[0].id);
    }
  }, [filteredParticipants, selectedParticipantId, showAs]);

  const selectedParticipant = participants.find((p) => p.id === selectedParticipantId);

  return (
    <div className="lap-times-report" ref={containerRef}>
      <h2>{title}</h2>

      <div className="lap-times-report__toolbar">
        {/* Show as dropdown – always visible */}
        <label>
          Show as
          <select
            value={showAs}
            onChange={(e) => setShowAs(e.target.value as ShowAs)}
          >
            <option value="individual">Individual</option>
            <option value="table">Table</option>
          </select>
        </label>

        {/* Category dropdown – only relevant in individual view */}
        {showAs === 'individual' && (
          <label>
            Category
            <select
              value={selectedCategoryId}
              onChange={(e) => {
                setSelectedCategoryId(e.target.value);
                setSelectedParticipantId('');
              }}
            >
              <option value={ALL_CATEGORIES}>All categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Participant dropdown – only in individual view */}
        {showAs === 'individual' && (
          <label>
            Participant
            <select
              aria-label="Reports Participant"
              value={selectedParticipantId}
              onChange={(e) => setSelectedParticipantId(e.target.value)}
            >
              <option value="">— select —</option>
              {filteredParticipants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Content area */}
      {showAs === 'individual' ? (
        selectedParticipant ? (
          <IndividualView
            participant={selectedParticipant}
            laps={passings.get(selectedParticipant.id) ?? []}
          />
        ) : (
          <p className="lap-times-report__empty">
            {filteredParticipants.length === 0
              ? 'No participants in this category.'
              : 'Select a participant to view their lap times.'}
          </p>
        )
      ) : (
        <TableView
          participants={participants}
          passings={passings}
          lapsPerBlock={lapsPerBlock}
        />
      )}
    </div>
  );
};
