import {
  type EventCatalogEvent,
  type EventCatalogState,
  getSessionsForEvent,
} from '../../app/eventCatalog.js';
import { type SystemConfiguration, getEventAssignedSourceIds } from '../../app/systemConfig.js';
import { getSupportedTimeZones, getSystemTimeZone } from '../../app/utils/timeutils.js';
import React from 'react';

interface EventsScreenProps {
  catalog: EventCatalogState;
  config: SystemConfiguration;
  onActivateEvent: (eventId: string) => void | Promise<void>;
  onCreateEvent: () => void | Promise<void>;
  onSaveEventAssignment: (eventId: string, sourceIds: string[]) => void | Promise<void>;
  onSelectEvent: (eventId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onUpdateEvent: (eventId: string, changes: { date?: string; format?: EventCatalogEvent['format']; name?: string; timeZone?: string }) => void | Promise<void>;
  selectedEventId?: string;
  selectedSessionId?: string;
}

const toggleInList = (values: string[], value: string): string[] => {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
};

export const EventsScreen = (props: EventsScreenProps): React.ReactElement => {
  const selectedEvent = props.catalog.events.find((event) => event.id === props.selectedEventId) ??
    props.catalog.events.find((event) => event.id === props.catalog.activeEventId) ??
    props.catalog.events[0];
  const selectedEventSessions = getSessionsForEvent(props.catalog, selectedEvent?.id);
  const selectedSession = selectedEventSessions.find((session) => session.id === props.selectedSessionId) ?? selectedEventSessions[0];
  const assignedSourceIds = selectedEvent ? getEventAssignedSourceIds(props.config, selectedEvent.id) : [];
  const timeZoneOptions = React.useMemo(() => getSupportedTimeZones(), []);
  const systemTimeZone = React.useMemo(() => getSystemTimeZone(), []);

  const [eventDraft, setEventDraft] = React.useState({
    date: selectedEvent?.date || '',
    format: selectedEvent?.format || 'race-weekend',
    name: selectedEvent?.name || '',
    timeZone: selectedEvent?.timeZone || systemTimeZone,
  });

  React.useEffect(() => {
    setEventDraft({
      date: selectedEvent?.date || '',
      format: selectedEvent?.format || 'race-weekend',
      name: selectedEvent?.name || '',
      timeZone: selectedEvent?.timeZone || systemTimeZone,
    });
  }, [selectedEvent?.date, selectedEvent?.format, selectedEvent?.id, selectedEvent?.name, selectedEvent?.timeZone, systemTimeZone]);

  return (
    <section className="events-screen">
      <h1>Events</h1>
      <div className="events-layout">
        <section className="events-panel events-list-panel">
          <div className="events-actions">
            <h2>Event List</h2>
            <button type="button" onClick={() => props.onCreateEvent()}>
              New
            </button>
          </div>
          <div className="events-list" role="listbox" aria-label="Defined events">
            {props.catalog.events.map((event) => {
              const isSelected = event.id === selectedEvent?.id;
              const isActive = event.id === props.catalog.activeEventId;

              return (
                <button
                  key={event.id}
                  type="button"
                  className={`events-list-item${isSelected ? ' selected' : ''}`}
                  onClick={() => props.onSelectEvent(event.id)}
                  aria-selected={isSelected}
                >
                  <strong>{event.name}</strong>
                  <span>{event.date}</span>
                  <span>{event.format}</span>
                  {isActive ? <span className="events-badge">Active</span> : null}
                </button>
              );
            })}
          </div>
        </section>

        <section className="events-panel event-detail-panel">
          <h2>Event Details</h2>
          {selectedEvent ? (
            <>
              <label>
                Event Name
                <input
                  aria-label="Event Name"
                  type="text"
                  value={eventDraft.name}
                  onChange={(event) => setEventDraft((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label>
                Event Format
                <select
                  aria-label="Event Format"
                  value={eventDraft.format}
                  onChange={(event) => setEventDraft((current) => ({ ...current, format: event.target.value as EventCatalogEvent['format'] }))}
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
                  value={eventDraft.date}
                  onChange={(event) => setEventDraft((current) => ({ ...current, date: event.target.value }))}
                />
              </label>
              <label>
                Event Time Zone
                <select
                  aria-label="Event Time Zone"
                  value={eventDraft.timeZone}
                  onChange={(event) => setEventDraft((current) => ({ ...current, timeZone: event.target.value }))}
                >
                  {timeZoneOptions.map((timeZone) => (
                    <option key={timeZone} value={timeZone}>
                      {timeZone}
                    </option>
                  ))}
                </select>
              </label>
              <div className="events-actions">
                <button type="button" onClick={() => props.onUpdateEvent(selectedEvent.id, eventDraft)}>
                  Save Event Details
                </button>
                <button
                  type="button"
                  onClick={() => props.onActivateEvent(selectedEvent.id)}
                  disabled={selectedEvent.id === props.catalog.activeEventId}
                >
                  {selectedEvent.id === props.catalog.activeEventId ? 'Active Event' : 'Mark Active'}
                </button>
              </div>

              <h2>Sessions</h2>
              <div className="events-session-list" role="listbox" aria-label="Event sessions">
                {selectedEventSessions.map((session) => {
                  const isSelected = session.id === selectedSession?.id;
                  return (
                    <button
                      key={session.id}
                      type="button"
                      className={`events-list-item${isSelected ? ' selected' : ''}`}
                      onClick={() => props.onSelectSession(session.id)}
                      aria-selected={isSelected}
                    >
                      <strong>{session.name}</strong>
                      <span>{session.kind}</span>
                      <span>{session.status}</span>
                    </button>
                  );
                })}
              </div>

              <h2>Event Data Sources</h2>
              {props.config.dataSources.length === 0 ? (
                <p>No configured data sources are available yet. Add and configure them in System.</p>
              ) : (
                <ul>
                  {props.config.dataSources.map((source) => {
                    const checked = assignedSourceIds.includes(source.id);
                    return (
                      <li key={`event-source-${source.id}`}>
                        <label>
                          <input
                            aria-label={`Event Source ${selectedEvent.id} ${source.id}`}
                            type="checkbox"
                            checked={checked}
                            onChange={() => props.onSaveEventAssignment(selectedEvent.id, toggleInList(assignedSourceIds, source.id))}
                          />
                          {source.name}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : (
            <p>No events are defined.</p>
          )}
        </section>

        <section className="events-panel session-detail-panel">
          <h2>Session Summary</h2>
          {selectedEventSessions.length > 0 ? (
            <ul aria-label="Session summary list">
              {selectedEventSessions.map((session) => (
                <li key={session.id}>
                  <strong>{session.name}</strong> - {session.kind} - {session.status} - {session.scheduledStart}
                </li>
              ))}
            </ul>
          ) : (
            <p>No sessions in this event.</p>
          )}
          {selectedSession ? <p>Selected session: {selectedSession.name}</p> : null}
        </section>
      </div>
    </section>
  );
};
