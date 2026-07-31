import { Button, CircularProgress, MenuItem, TextField } from '@mui/material';
import React from 'react';
import { type EventCatalogEvent, type EventDiscipline } from '../../catalog/eventCatalog.js';
import { SelectTextField } from '../../controls/selectTextField.js';
import { type EventId } from '../../model/raceevent.js';

interface EventDraft {
  date: string;
  discipline: EventDiscipline;
  elapsedTimeCalculation: string;
  format: EventCatalogEvent['format'];
  lap1Calculation: string;
  minimumLapTime: string;
  name: string;
  timeZone: string;
}

interface EventDetailsPanelProps {
  activeEventId?: EventId;
  eventDraft: EventDraft;
  onActivateEvent?: () => void | Promise<void>;
  onDeleteEvent?: () => void | Promise<void>;
  onSaveEventDetails: () => void | Promise<void>;
  onUpdateEventDraft: React.Dispatch<React.SetStateAction<EventDraft>>;
  selectedEvent?: EventCatalogEvent;
  timeZoneOptions: string[];
  warningModal?: React.ReactNode;
}

export const EventDetailsPanel = (props: EventDetailsPanelProps): React.ReactElement => {
  const [saveError, setSaveError] = React.useState<string | undefined>(undefined);
  const [saveStatus, setSaveStatus] = React.useState<'idle' | 'pending' | 'succeeded' | 'failed'>('idle');

  React.useEffect(() => {
    setSaveError(undefined);
    setSaveStatus('idle');
  }, [props.selectedEvent?.id]);

  const saveEventDetails = (): void => {
    setSaveError(undefined);
    setSaveStatus('pending');
    Promise.resolve(props.onSaveEventDetails()).then(
      () => setSaveStatus('succeeded'),
      (error: unknown) => {
        setSaveError(error instanceof Error ? error.message : String(error));
        setSaveStatus('failed');
      },
    );
  };

  return <section className="events-panel event-detail-panel">
    <h2>Event Details</h2>
    {props.selectedEvent ? (
      <>
        <TextField fullWidth label="Event Name" onChange={(event) => props.onUpdateEventDraft((current) => ({ ...current, name: event.target.value }))} slotProps={{ htmlInput: { 'aria-label': 'Event Name' } }} value={props.eventDraft.name} />
        <SelectTextField fullWidth label="Event Type" onChange={(event) => props.onUpdateEventDraft((current) => ({ ...current, discipline: event.target.value as EventDiscipline }))} slotProps={{ select: { 'aria-label': 'Event Type' } }} value={props.eventDraft.discipline}>
          <MenuItem value="motorsport">Motorsport</MenuItem><MenuItem value="cycling">Cycling</MenuItem>
        </SelectTextField>
        <SelectTextField fullWidth label="Event Format" onChange={(event) => props.onUpdateEventDraft((current) => ({ ...current, format: event.target.value as EventCatalogEvent['format'] }))} slotProps={{ select: { 'aria-label': 'Event Format' } }} value={props.eventDraft.format}><MenuItem value="race-weekend">Race weekend</MenuItem><MenuItem value="test-day">Test day</MenuItem><MenuItem value="track-day">Track day</MenuItem><MenuItem value="other">Other</MenuItem></SelectTextField>
        <TextField fullWidth label="Event Date" onChange={(event) => props.onUpdateEventDraft((current) => ({ ...current, date: event.target.value }))} slotProps={{ htmlInput: { 'aria-label': 'Event Date' } }} type="date" value={props.eventDraft.date} />
        <TextField fullWidth label="Minimum Lap Time" onChange={(event) => props.onUpdateEventDraft((current) => ({ ...current, minimumLapTime: event.target.value }))} placeholder="0:00:25.0000" slotProps={{ htmlInput: { 'aria-label': 'Event Minimum Lap Time' } }} value={props.eventDraft.minimumLapTime} />
        <SelectTextField fullWidth label="Calculate elapsed time from" onChange={(event) => props.onUpdateEventDraft((current) => ({ ...current, elapsedTimeCalculation: event.target.value }))} slotProps={{ select: { 'aria-label': 'Event Calculate Elapsed Time From' } }} value={props.eventDraft.elapsedTimeCalculation}><MenuItem value="">Inherit default (category start)</MenuItem><MenuItem value="first-start">First start</MenuItem><MenuItem value="category-start">Category start</MenuItem></SelectTextField>
        <SelectTextField fullWidth label="Calculate lap 1 from" onChange={(event) => props.onUpdateEventDraft((current) => ({ ...current, lap1Calculation: event.target.value }))} slotProps={{ select: { 'aria-label': 'Event Calculate Lap 1 From' } }} value={props.eventDraft.lap1Calculation}><MenuItem value="">Inherit default (category start)</MenuItem><MenuItem value="first-start">First start</MenuItem><MenuItem value="category-start">Category start</MenuItem></SelectTextField>
        <SelectTextField fullWidth label="Event Time Zone" onChange={(event) => props.onUpdateEventDraft((current) => ({ ...current, timeZone: event.target.value }))} slotProps={{ select: { 'aria-label': 'Event Time Zone' } }} value={props.eventDraft.timeZone}>{props.timeZoneOptions.map((timeZone) => <MenuItem key={timeZone} value={timeZone}>{timeZone}</MenuItem>)}</SelectTextField>
        <div className="events-actions">
          <div className="event-save-status">
            <Button
              disabled={saveStatus === 'pending'}
              endIcon={saveStatus === 'pending' ? <CircularProgress aria-label="Saving event details" size={16} /> : saveStatus === 'succeeded' ? <span aria-label="Event details saved" role="img">✓</span> : saveStatus === 'failed' ? <span aria-label="Event details save failed" role="img">!</span> : undefined}
              onClick={saveEventDetails}
              variant="contained"
            >
              Save Event Details
            </Button>
            {saveError ? <span className="error event-save-error" role="alert">{saveError}</span> : null}
          </div>
          <Button
            onClick={() => props.onActivateEvent?.()}
            disabled={props.selectedEvent.id === props.activeEventId}
            variant="outlined">
            {props.selectedEvent.id === props.activeEventId ? 'Active Event' : 'Mark Active'}
          </Button>
          <Button color="error" onClick={() => props.onDeleteEvent?.()} variant="outlined">Delete Event</Button>
        </div>
        <span className="event-id-display">Event ID: {props.selectedEvent.id}</span>
        {props.warningModal}
      </>
    ) : (
      <p>No events are defined.</p>
    )}
  </section>;
};
