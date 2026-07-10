import React from 'react';
import { type EventCatalogEvent, type EventDiscipline } from '../../catalog/eventCatalog.js';
import { type EventId } from '../../model/raceevent.js';

interface EventDraft {
  date: string;
  discipline: EventDiscipline;
  format: EventCatalogEvent['format'];
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

export const EventDetailsPanel = (props: EventDetailsPanelProps): React.ReactElement => (
  <section className="events-panel event-detail-panel">
    <h2>Event Details</h2>
    {props.selectedEvent ? (
      <>
        <label>
          Event Name
          <input
            aria-label="Event Name"
            type="text"
            value={props.eventDraft.name}
            onChange={(event) => props.onUpdateEventDraft((current) => ({ ...current, name: event.target.value }))}
          />
        </label>
        <label>
          Event Type
          <select
            aria-label="Event Type"
            value={props.eventDraft.discipline}
            onChange={(event) => props.onUpdateEventDraft((current) => ({ ...current, discipline: event.target.value as EventDiscipline }))}
          >
            <option value="motorsport">Motorsport</option>
            <option value="cycling">Cycling</option>
          </select>
        </label>
        <label>
          Event Format
          <select
            aria-label="Event Format"
            value={props.eventDraft.format}
            onChange={(event) => props.onUpdateEventDraft((current) => ({ ...current, format: event.target.value as EventCatalogEvent['format'] }))}
          >
            <option value="race-weekend">Race weekend</option>
            <option value="test-day">Test day</option>
            <option value="track-day">Track day</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Event Date
          <input
            aria-label="Event Date"
            type="date"
            value={props.eventDraft.date}
            onChange={(event) => props.onUpdateEventDraft((current) => ({ ...current, date: event.target.value }))}
          />
        </label>
        <label>
          Minimum Lap Time
          <input
            aria-label="Event Minimum Lap Time"
            placeholder="0:00:25.0000"
            type="text"
            value={props.eventDraft.minimumLapTime}
            onChange={(event) => props.onUpdateEventDraft((current) => ({ ...current, minimumLapTime: event.target.value }))}
          />
        </label>
        <label>
          Event Time Zone
          <select
            aria-label="Event Time Zone"
            value={props.eventDraft.timeZone}
            onChange={(event) => props.onUpdateEventDraft((current) => ({ ...current, timeZone: event.target.value }))}
          >
            {props.timeZoneOptions.map((timeZone) => (
              <option key={timeZone} value={timeZone}>
                {timeZone}
              </option>
            ))}
          </select>
        </label>
        <div className="events-actions">
          <button type="button" onClick={() => props.onSaveEventDetails()}>
            Save Event Details
          </button>
          <button
            type="button"
            onClick={() => props.onActivateEvent?.()}
            disabled={props.selectedEvent.id === props.activeEventId}
          >
            {props.selectedEvent.id === props.activeEventId ? 'Active Event' : 'Mark Active'}
          </button>
          <button type="button" onClick={() => props.onDeleteEvent?.()}>
            Delete Event
          </button>
        </div>
        <span className="event-id-display">Event ID: {props.selectedEvent.id}</span>
        {props.warningModal}
      </>
    ) : (
      <p>No events are defined.</p>
    )}
  </section>
);
