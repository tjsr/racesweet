import React from 'react';
import type { EventCatalogEntrant, EventCatalogEntry, EventCatalogEvent } from '../../catalog/eventCatalog.js';
import { millisecondsToTime, tableTimeString } from '../../app/utils/timeutils.js';
import { getParticipantNumber } from '../../controllers/participant.js';
import type { EventEntrantId } from '../../model/entrant.js';
import type { RaceState, RaceStateLookup } from '../../model/racestate.js';
import { type TrackPlaybackEntrantState, createTrackPlaybackIndex } from './trackPlayback.js';
import { createTrackMapGeometry, getTrackPointAtProgress, toSvgPolylinePoints } from './trackMapGeometry.js';
import { createTrackStatusSegments } from './trackStatus.js';

interface TrackMapReportProps {
  catalogEntries?: EventCatalogEntry[];
  catalogEntrants: EventCatalogEntrant[];
  event?: EventCatalogEvent;
  raceState: RaceState & RaceStateLookup;
}

const PLAYBACK_SPEEDS: number[] = [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100];

const formatOptionalDuration = (duration: number | undefined): string => (
  duration === undefined ? '--:--:--.---' : millisecondsToTime(duration)
);

const getPlaybackSignature = (raceState: RaceState): string => raceState.records.map((record) => {
  const passing = record as { elapsedTime?: number; lapNo?: number; lapTime?: number; participantId?: string };
  return `${record.id}:${record.time?.getTime() || ''}:${passing.participantId || ''}:${passing.lapNo || ''}:${passing.lapTime || ''}:${passing.elapsedTime || ''}`;
}).join('|');

const getMarkerLabel = (entrantId: EventEntrantId, raceState: RaceState & RaceStateLookup, catalogEntries: EventCatalogEntry[] = []): string => {
  const entry = catalogEntries.find((candidate) => candidate.id === entrantId);
  if (entry?.raceNumber) {
    return entry.raceNumber.toString();
  }
  const participant = raceState.participants.find((candidate) => (
    raceState.getEntrantIdForParticipant(candidate.id) === entrantId || candidate.entrantId === entrantId || candidate.id === entrantId
  ));
  const number = participant ? String(getParticipantNumber(participant) || entrantId) : entrantId.toString();
  const digits = number.replace(/\D/g, '');
  return (digits || number).slice(0, 4);
};

export const TrackMapReport = (props: TrackMapReportProps): React.ReactElement => {
  const playbackSignature = getPlaybackSignature(props.raceState);
  const playbackIndex = React.useMemo(() => createTrackPlaybackIndex(
    props.raceState,
    props.event?.trackMap?.timingLines || [],
  ), [playbackSignature, props.event?.trackMap?.timingLines, props.raceState]);
  const geometry = React.useMemo(() => createTrackMapGeometry(props.event?.trackMap), [props.event?.trackMap]);
  const statusSegments = React.useMemo(() => createTrackStatusSegments(props.raceState, playbackIndex), [playbackIndex, props.raceState]);
  const duration = Math.max(0, playbackIndex.endTime - playbackIndex.startTime);
  const [elapsed, setElapsed] = React.useState<number>(0);
  const [isPlaying, setIsPlaying] = React.useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = React.useState<number>(1);
  const [selectedEntrantId, setSelectedEntrantId] = React.useState<EventEntrantId | undefined>(undefined);
  const elapsedRef = React.useRef<number>(0);

  React.useEffect(() => {
    elapsedRef.current = Math.min(elapsedRef.current, duration);
    setElapsed(elapsedRef.current);
    setIsPlaying(false);
  }, [duration, playbackIndex]);

  React.useEffect(() => {
    if (!isPlaying) {
      return;
    }
    let animationFrame = 0;
    let previousFrameTime: number | undefined;
    const advance = (frameTime: number): void => {
      const delta = previousFrameTime === undefined ? 0 : frameTime - previousFrameTime;
      previousFrameTime = frameTime;
      const nextElapsed = Math.min(duration, elapsedRef.current + delta * playbackSpeed);
      elapsedRef.current = nextElapsed;
      setElapsed(nextElapsed);
      if (nextElapsed >= duration) {
        setIsPlaying(false);
        return;
      }
      animationFrame = window.requestAnimationFrame(advance);
    };
    animationFrame = window.requestAnimationFrame(advance);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [duration, isPlaying, playbackSpeed]);

  const currentTime = playbackIndex.startTime + elapsed;
  const snapshot = playbackIndex.seek(currentTime);
  const activeEntrants = snapshot.entrants.filter((entrant) => !entrant.didNotFinish);
  const dnfEntrants = snapshot.entrants.filter((entrant) => entrant.didNotFinish);
  const selectedEntrant = snapshot.entrants.find((entrant) => entrant.entrantId === selectedEntrantId);
  const entrantNames = new Map(props.catalogEntrants.map((entrant) => [entrant.id, entrant.name]));

  const updateElapsed = (nextElapsed: number): void => {
    elapsedRef.current = nextElapsed;
    setElapsed(nextElapsed);
  };

  const renderMarker = (entrant: TrackPlaybackEntrantState): React.ReactElement => {
    const point = getTrackPointAtProgress(geometry.entrantPathPoints, entrant.progress);
    const label = getMarkerLabel(entrant.entrantId, props.raceState, props.catalogEntries);
    const selected = entrant.entrantId === selectedEntrantId;
    return (
      <g
        aria-label={`Track entrant ${label}`}
        key={entrant.entrantId}
        onClick={() => setSelectedEntrantId(entrant.entrantId)}
        role="button"
        style={{ cursor: 'pointer' }}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            setSelectedEntrantId(entrant.entrantId);
          }
        }}
      >
        <circle cx={point.x} cy={point.y} fill={selected ? '#ffb300' : '#1565c0'} r={selected ? 3.8 : 3.2} stroke="#fff" strokeWidth="0.8" />
        <text fill="#fff" fontSize="2.6" fontWeight="700" textAnchor="middle" x={point.x} y={point.y + 0.9}>{label}</text>
      </g>
    );
  };

  return (
    <section aria-label="Track Map Report">
      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: selectedEntrant || dnfEntrants.length > 0 ? 'minmax(0, 1fr) minmax(220px, 28%)' : '1fr' }}>
        <svg
          aria-label="Track Map"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          style={{ background: 'var(--panel-background, #f6f6f6)', height: 'min(64vh, 720px)', width: '100%' }}
          viewBox="0 0 100 100"
        >
          {geometry.leftBoundaryPoints ? <polyline fill="none" points={toSvgPolylinePoints(geometry.leftBoundaryPoints)} stroke="currentColor" strokeWidth="0.8" /> : null}
          {geometry.rightBoundaryPoints ? <polyline fill="none" points={toSvgPolylinePoints(geometry.rightBoundaryPoints)} stroke="currentColor" strokeWidth="0.8" /> : null}
          <polyline fill="none" opacity={geometry.leftBoundaryPoints ? 0.3 : 1} points={toSvgPolylinePoints(geometry.trackPoints)} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={geometry.leftBoundaryPoints ? 0.7 : 1.6} />
          {geometry.racingLinePoints ? <polyline aria-label="Racing Line" fill="none" points={toSvgPolylinePoints(geometry.racingLinePoints)} stroke="#1565c0" strokeDasharray="2 1" strokeWidth="0.7" /> : null}
          {(props.event?.trackMap?.timingLines || []).map((line) => {
            const point = getTrackPointAtProgress(geometry.entrantPathPoints, line.progress);
            return <circle aria-label={`Timing line ${line.lineNumber}`} cx={point.x} cy={point.y} fill="#d32f2f" key={line.lineNumber} r="1.6" />;
          })}
          {activeEntrants.map(renderMarker)}
        </svg>
        {selectedEntrant ? (
          <aside aria-label="Selected Track Entrant" className="events-panel" style={{ gridColumn: 2, gridRow: 1 }}>
            <h3>{entrantNames.get(selectedEntrant.entrantId) || `Entrant ${getMarkerLabel(selectedEntrant.entrantId, props.raceState)}`}</h3>
            <p>Race position: {selectedEntrant.didNotFinish ? 'DNF' : selectedEntrant.position}</p>
            <p>Fastest lap: {formatOptionalDuration(selectedEntrant.fastestLap)}</p>
            <p>Last lap: {formatOptionalDuration(selectedEntrant.lastLapTime)}</p>
            <p>Laps: {selectedEntrant.lapCount}</p>
            <p>Race elapsed: {formatOptionalDuration(selectedEntrant.raceElapsedTime)}</p>
          </aside>
        ) : null}
        {dnfEntrants.length > 0 ? (
          <aside aria-label="DNF Entrants" className="events-panel" style={{ alignSelf: 'end', boxSizing: 'border-box', gridColumn: 2, gridRow: selectedEntrant ? 2 : 1, maxHeight: 'min(64vh, 720px)', overflowY: 'auto' }}>
            <h3>DNF</h3>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {dnfEntrants.map((entrant) => {
                const label = getMarkerLabel(entrant.entrantId, props.raceState, props.catalogEntries);
                return (
                  <button key={entrant.entrantId} onClick={() => setSelectedEntrantId(entrant.entrantId)} type="button">
                    {label} · {entrantNames.get(entrant.entrantId) || `Entrant ${label}`}
                  </button>
                );
              })}
            </div>
          </aside>
        ) : null}
      </div>
      <div style={{ marginTop: '1rem' }}>
        <input
          aria-label="Track Map Session Progress"
          max={duration}
          min={0}
          onChange={(event) => updateElapsed(Number(event.target.value))}
          step={Math.max(1, Math.min(1000, duration / 1000))}
          style={{ width: '100%' }}
          type="range"
          value={Math.min(elapsed, duration)}
        />
        <div
          aria-label="Track Status Timeline"
          style={{ display: 'flex', height: '0.75rem', marginTop: '0.25rem', overflow: 'hidden', width: '100%' }}
        >
          {statusSegments.map((segment) => (
            <div
              aria-label={`Track status ${segment.status}`}
              key={`${segment.startTime}-${segment.endTime}-${segment.status}`}
              style={{ backgroundColor: segment.status === 'green' ? '#4caf50' : segment.status === 'yellow' ? '#fdd835' : segment.status === 'white' ? '#fff' : '#000', border: segment.status === 'white' ? '1px solid #777' : undefined, flexGrow: segment.endTime - segment.startTime }}
            />
          ))}
        </div>
        <div className="events-actions">
          <button aria-label={isPlaying ? 'Pause Track Map Playback' : 'Play Track Map Playback'} onClick={() => {
            if (!isPlaying && elapsedRef.current >= duration) {
              updateElapsed(0);
            }
            setIsPlaying((current) => !current);
          }} type="button">
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <label>
            Playback speed
            <select aria-label="Track Map Playback Speed" onChange={(event) => setPlaybackSpeed(Number(event.target.value))} value={playbackSpeed}>
              {PLAYBACK_SPEEDS.map((speed) => <option key={speed} value={speed}>{speed}x</option>)}
            </select>
          </label>
        </div>
        <p>Event elapsed time: {millisecondsToTime(elapsed)}</p>
        <p>Time of day: {tableTimeString(new Date(currentTime), props.event?.timeZone)}</p>
      </div>
    </section>
  );
};
