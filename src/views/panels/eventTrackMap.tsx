import React from 'react';
import type { EventCatalogEvent, EventTrackMap, EventTrackTimingLine } from '../../catalog/eventCatalog.js';
import { createTrackMapGeometry, getClosestTrackProgress, getTrackPointAtProgress, toSvgPolylinePoints } from '../reports/trackMapGeometry.js';

interface TimingLineOption {
  label: string;
  lineNumber: number;
}

interface EventTrackMapPanelProps {
  availableTimingLines: TimingLineOption[];
  onSave: (trackMap: EventTrackMap) => void | Promise<void>;
  selectedEvent?: EventCatalogEvent;
}

const normalizeTrackMap = (trackMap: EventTrackMap | undefined): EventTrackMap => ({
  gpxContent: trackMap?.gpxContent,
  gpxFileName: trackMap?.gpxFileName,
  racingLineCsvContent: trackMap?.racingLineCsvContent,
  racingLineCsvFileName: trackMap?.racingLineCsvFileName,
  sourceType: trackMap?.sourceType || (trackMap?.trackCsvContent ? 'racetrack-csv' : 'gpx'),
  timingLines: trackMap?.timingLines || [],
  trackCsvContent: trackMap?.trackCsvContent,
  trackCsvFileName: trackMap?.trackCsvFileName,
});

export const EventTrackMapPanel = (props: EventTrackMapPanelProps): React.ReactElement => {
  const [draft, setDraft] = React.useState<EventTrackMap>(() => normalizeTrackMap(props.selectedEvent?.trackMap));
  const [editing, setEditing] = React.useState<boolean>(false);
  const [selectedLineNumber, setSelectedLineNumber] = React.useState<number | undefined>(undefined);
  const [status, setStatus] = React.useState<string>('');
  const geometry = React.useMemo(() => createTrackMapGeometry(draft), [draft]);
  const availableTimingLines = React.useMemo(() => {
    const byLineNumber = new Map<number, TimingLineOption>();
    props.availableTimingLines.forEach((line) => byLineNumber.set(line.lineNumber, line));
    draft.timingLines.forEach((line) => {
      if (!byLineNumber.has(line.lineNumber)) {
        byLineNumber.set(line.lineNumber, {
          label: line.label || `Timing line ${line.lineNumber}`,
          lineNumber: line.lineNumber,
        });
      }
    });
    return Array.from(byLineNumber.values()).sort((left, right) => left.lineNumber - right.lineNumber);
  }, [draft.timingLines, props.availableTimingLines]);

  React.useEffect(() => {
    setDraft(normalizeTrackMap(props.selectedEvent?.trackMap));
    setEditing(false);
    setSelectedLineNumber(undefined);
    setStatus('');
  }, [props.selectedEvent]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const gpxContent = await file.text();
    setDraft((current) => ({ ...current, gpxContent, gpxFileName: file.name, sourceType: 'gpx' }));
    setStatus(`${file.name} loaded. Save the track map to persist it.`);
  };

  const handleMapClick = (event: React.MouseEvent<SVGSVGElement>): void => {
    if (!editing || selectedLineNumber === undefined) {
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const target = {
      x: ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 100,
      y: ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 100,
    };
    const progress = getClosestTrackProgress(geometry.entrantPathPoints, target);
    const option = availableTimingLines.find((line) => line.lineNumber === selectedLineNumber);
    const timingLine: EventTrackTimingLine = {
      label: option?.label,
      lineNumber: selectedLineNumber,
      progress,
    };
    setDraft((current) => ({
      ...current,
      timingLines: [...current.timingLines.filter((line) => line.lineNumber !== selectedLineNumber), timingLine]
        .sort((left, right) => left.lineNumber - right.lineNumber),
    }));
  };

  if (!props.selectedEvent) {
    return <section className="events-panel"><h2>Track Map</h2><p>Select an event to configure its track map.</p></section>;
  }

  return (
    <section className="events-panel" aria-label="Event Track Map Configuration">
      <h2>Track Map</h2>
      <label>
        Track data format
        <select
          aria-label="Event Track Data Format"
          onChange={(event) => setDraft((current) => ({ ...current, sourceType: event.target.value as EventTrackMap['sourceType'] }))}
          value={draft.sourceType}
        >
          <option value="gpx">GPX</option>
          <option value="racetrack-csv">Racetrack database CSV</option>
        </select>
      </label>
      {draft.sourceType === 'gpx' ? (
        <label>
          GPX track file
          <input accept=".gpx,application/gpx+xml,application/xml,text/xml" aria-label="Event GPX File" onChange={(event) => void handleFileChange(event)} type="file" />
        </label>
      ) : (
        <>
          <label>
            Racetrack database track CSV
            <input
              accept=".csv,text/csv"
              aria-label="Event Track CSV File"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                void file.text().then((trackCsvContent) => {
                  setDraft((current) => ({ ...current, sourceType: 'racetrack-csv', trackCsvContent, trackCsvFileName: file.name }));
                  setStatus(`${file.name} loaded. Save the track map to persist it.`);
                });
              }}
              type="file"
            />
          </label>
          <p>{draft.trackCsvFileName || 'No racetrack CSV configured.'}</p>
          <label>
            Optional racing-line CSV
            <input
              accept=".csv,text/csv"
              aria-label="Event Racing Line CSV File"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                void file.text().then((racingLineCsvContent) => {
                  setDraft((current) => ({ ...current, racingLineCsvContent, racingLineCsvFileName: file.name }));
                  setStatus(`${file.name} loaded. Save the track map to persist it.`);
                });
              }}
              type="file"
            />
          </label>
          <p>{draft.racingLineCsvFileName || 'No racing line configured; entrants will follow the track centreline.'}</p>
        </>
      )}
      <p>{draft.sourceType === 'gpx' ? draft.gpxFileName || 'No GPX file configured. Reports will use a circular track.' : null}</p>
      <div className="events-actions">
        <button type="button" onClick={() => setEditing((current) => !current)}>
          {editing ? 'Close timing-line editor' : 'Edit timing-line positions'}
        </button>
        <button
          type="button"
          onClick={() => setDraft((current) => ({
            ...current,
            gpxContent: undefined,
            gpxFileName: undefined,
            racingLineCsvContent: undefined,
            racingLineCsvFileName: undefined,
            trackCsvContent: undefined,
            trackCsvFileName: undefined,
          }))}
        >
          Use circular track
        </button>
        <button
          type="button"
          onClick={() => {
            Promise.resolve(props.onSave(draft)).then(() => setStatus('Track map saved.'));
          }}
        >
          Save Track Map
        </button>
      </div>
      {editing ? (
        <div
          aria-label="Timing Line Map Editor"
          aria-modal="true"
          role="dialog"
          style={{ background: 'var(--app-background, #fff)', inset: 0, overflow: 'auto', padding: '1.5rem', position: 'fixed', zIndex: 1000 }}
        >
          <h3>Timing-line positions</h3>
          <p>Select a timing line, then click its location on the track.</p>
          <div className="events-actions">
            <button onClick={() => setEditing(false)} type="button">Back to event</button>
            <button
              onClick={() => {
                Promise.resolve(props.onSave(draft)).then(() => setStatus('Track map saved.'));
              }}
              type="button"
            >
              Save Track Map
            </button>
          </div>
          <label>
            Timing line
            <select
              aria-label="Track Map Timing Line"
              value={selectedLineNumber ?? ''}
              onChange={(event) => setSelectedLineNumber(event.target.value ? Number(event.target.value) : undefined)}
            >
              <option value="">Select a timing line</option>
              {availableTimingLines.map((line) => (
                <option key={line.lineNumber} value={line.lineNumber}>{line.label}</option>
              ))}
            </select>
          </label>
          <svg
            aria-label="Event Track Map Editor"
            onClick={handleMapClick}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            style={{ background: 'var(--panel-background, #f6f6f6)', cursor: selectedLineNumber === undefined ? 'default' : 'crosshair', height: 'min(60vh, 620px)', width: '100%' }}
            viewBox="0 0 100 100"
          >
            {geometry.leftBoundaryPoints ? <polyline fill="none" points={toSvgPolylinePoints(geometry.leftBoundaryPoints)} stroke="currentColor" strokeWidth="0.8" /> : null}
            {geometry.rightBoundaryPoints ? <polyline fill="none" points={toSvgPolylinePoints(geometry.rightBoundaryPoints)} stroke="currentColor" strokeWidth="0.8" /> : null}
            <polyline fill="none" opacity="0.45" points={toSvgPolylinePoints(geometry.trackPoints)} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="0.7" />
            {geometry.racingLinePoints ? <polyline fill="none" points={toSvgPolylinePoints(geometry.racingLinePoints)} stroke="#1565c0" strokeDasharray="2 1" strokeWidth="0.7" /> : null}
            {draft.timingLines.map((line) => {
              const point = getTrackPointAtProgress(geometry.entrantPathPoints, line.progress);
              return (
                <g key={line.lineNumber}>
                  <circle cx={point.x} cy={point.y} fill="#d32f2f" r="2" />
                  <text fontSize="3" x={point.x + 2.5} y={point.y - 2}>{line.label || `Line ${line.lineNumber}`}</text>
                </g>
              );
            })}
          </svg>
        </div>
      ) : null}
      {status ? <p role="status">{status}</p> : null}
    </section>
  );
};
