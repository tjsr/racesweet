
import {
  type EventCatalogSession,
  type EventCatalogState,
  getSessionsForEvent,
} from '../../app/eventCatalog.js';
import { type SystemConfiguration, getEventAssignedSourceIds } from '../../app/systemConfig.js';
import { type UnsavedChangesGuard, useUnsavedChangesWarning } from './unsavedChangesWarning.js';
import React from 'react';

interface SessionsPageProps {
  catalog: EventCatalogState;
  config: SystemConfiguration;
  onApplySessionSources: (eventId: string, sessionId: string) => void | Promise<void>;
  onCreateSession: (eventId: string) => void | Promise<void>;
  onDeleteSession: (eventId: string, sessionId: string) => void | Promise<void>;
  onMakeSessionActive: (eventId: string, sessionId: string) => void | Promise<void>;
  onMoveSessionToEvent?: (sessionId: string, eventId: string) => void | Promise<void>;
  onSelectEvent: (eventId: string) => void;
  onSaveSessionAssignment: (sessionId: string, mode: 'default' | 'specific', sourceIds: string[]) => void | Promise<void>;
  onSelectSession: (sessionId: string) => void;
  onUnsavedChangesGuardChange?: (guard: UnsavedChangesGuard | undefined) => void;
  onUpdateSession: (sessionId: string, changes: Partial<Pick<EventCatalogSession, 'kind' | 'name' | 'notes' | 'scheduledStart' | 'status'>>) => void | Promise<void>;
  selectedEventId?: string;
  selectedSessionId?: string;
}

const toggleInList = (values: string[], value: string): string[] => {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
};

const getSessionDraft = (session: EventCatalogSession | undefined): {
  kind: EventCatalogSession['kind'];
  name: string;
  notes: string;
  scheduledStart: string;
  status: EventCatalogSession['status'];
} => ({
  kind: session?.kind || 'practice',
  name: session?.name || '',
  notes: session?.notes || '',
  scheduledStart: session?.scheduledStart || '',
  status: session?.status || 'draft',
});

export const SessionsPage = (props: SessionsPageProps): React.ReactElement => {
  const selectedEvent = props.catalog.events.find((event) => event.id === props.selectedEventId) ??
    props.catalog.events.find((event) => event.id === props.catalog.activeEventId) ??
    props.catalog.events[0];
  const eventSessions = getSessionsForEvent(props.catalog, selectedEvent?.id);
  const selectedSession = eventSessions.find((session) => session.id === props.selectedSessionId) ?? eventSessions[0];
  const selectedSessionIsActive = selectedSession?.id === props.catalog.activeSessionId;
  const assignedEventSourceIds = selectedEvent ? getEventAssignedSourceIds(props.config, selectedEvent.id) : [];
  const sessionAssignment = selectedSession ? (props.config.sessionSourceAssignments[selectedSession.id] || { mode: 'default', sourceIds: [] as string[] }) : undefined;
  const effectiveSessionSourceIds = sessionAssignment
    ? (sessionAssignment.mode === 'default' ? assignedEventSourceIds : sessionAssignment.sourceIds)
    : [];
  const selectedSessionDraft = React.useMemo(() => getSessionDraft(selectedSession), [selectedSession]);

  const [sessionDraft, setSessionDraft] = React.useState(selectedSessionDraft);
  const [savedSessionDraft, setSavedSessionDraft] = React.useState(selectedSessionDraft);
  const hasUnsavedChanges = selectedSession
    ? JSON.stringify(sessionDraft) !== JSON.stringify(savedSessionDraft)
    : false;

  React.useEffect(() => {
    setSessionDraft(selectedSessionDraft);
    setSavedSessionDraft(selectedSessionDraft);
  }, [selectedSessionDraft]);

  const saveSession = async (): Promise<boolean> => {
    if (!selectedSession) {
      return true;
    }

    await props.onUpdateSession(selectedSession.id, sessionDraft);
    setSavedSessionDraft(sessionDraft);
    return true;
  };

  const { requestExit: requestFormExit, warningModal } = useUnsavedChangesWarning({
    hasUnsavedChanges: hasUnsavedChanges && !!selectedSession,
    itemName: selectedSession?.name || selectedSession?.id,
    itemType: 'session',
    onSave: saveSession,
    onUnsavedChangesGuardChange: props.onUnsavedChangesGuardChange,
  });

  return (
    <section className="events-screen">
      <h1>Sessions</h1>
      <label className="page-filter-label">
        Event
        <select
          aria-label="Sessions Event"
          value={selectedEvent?.id || ''}
          onChange={(event) => {
            const eventId = event.target.value;
            requestFormExit(() => props.onSelectEvent(eventId));
          }}
        >
          {props.catalog.events.map((event) => (
            <option key={event.id} value={event.id}>{event.name}</option>
          ))}
        </select>
      </label>
      <div className="events-layout two-panel">
        <section className="events-panel">
          <h2>Session List</h2>
          <div className="events-actions">
            <button type="button" onClick={() => selectedEvent && requestFormExit(() => props.onCreateSession(selectedEvent.id))} disabled={!selectedEvent}>
              Create Session
            </button>
            <button
              type="button"
              onClick={() => selectedEvent && selectedSession && props.onMakeSessionActive(selectedEvent.id, selectedSession.id)}
              disabled={!selectedEvent || !selectedSession || selectedSessionIsActive}
            >
              {selectedSessionIsActive ? 'Active Session' : 'Make Active'}
            </button>
          </div>
          <div className="events-session-list" role="listbox" aria-label="Sessions for selected event">
            {eventSessions.map((session) => {
              const isSelected = session.id === selectedSession?.id;
              return (
                <button
                  key={session.id}
                  type="button"
                  className={`events-list-item${isSelected ? ' selected' : ''}`}
                  onClick={() => {
                    if (!isSelected) {
                      requestFormExit(() => props.onSelectSession(session.id));
                    }
                  }}
                  aria-selected={isSelected}
                >
                  <strong>{session.name}</strong>
                  <span>{session.kind}</span>
                  <span>{session.status}</span>
                  {session.id === props.catalog.activeSessionId ? <span className="events-badge">Active</span> : null}
                </button>
              );
            })}
          </div>
        </section>
        <section className="events-panel">
          <h2>Session Details</h2>
          {selectedSession ? (
            <>
              <label>
                Parent Event
                <select
                  aria-label="Sessions Page Parent Event"
                  value={selectedSession.eventId}
                  onChange={(event) => {
                    const eventId = event.target.value;
                    const moveSessionToEvent = props.onMoveSessionToEvent;
                    if (moveSessionToEvent) {
                      requestFormExit(() => moveSessionToEvent(selectedSession.id, eventId));
                    }
                  }}
                  disabled={!props.onMoveSessionToEvent}
                >
                  {props.catalog.events.map((event) => (
                    <option key={`session-parent-${selectedSession.id}-${event.id}`} value={event.id}>{event.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Session Name
                <input
                  aria-label="Sessions Page Name"
                  type="text"
                  value={sessionDraft.name}
                  onChange={(event) => setSessionDraft((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label>
                Session Kind
                <select
                  aria-label="Sessions Page Kind"
                  value={sessionDraft.kind}
                  onChange={(event) => setSessionDraft((current) => ({ ...current, kind: event.target.value as EventCatalogSession['kind'] }))}
                >
                  <option value="practice">Practice</option>
                  <option value="qualifying">Qualifying</option>
                  <option value="race">Race</option>
                  <option value="warmup">Warmup</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>
                Session Status
                <select
                  aria-label="Sessions Page Status"
                  value={sessionDraft.status}
                  onChange={(event) => setSessionDraft((current) => ({ ...current, status: event.target.value as EventCatalogSession['status'] }))}
                >
                  <option value="draft">Draft</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="live">Live</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
              <label>
                Scheduled Start
                <input
                  aria-label="Sessions Page Start"
                  type="datetime-local"
                  value={sessionDraft.scheduledStart.slice(0, 16)}
                  onChange={(event) => setSessionDraft((current) => ({ ...current, scheduledStart: `${event.target.value}:00.000Z` }))}
                />
              </label>
              <label>
                Notes
                <textarea
                  aria-label="Sessions Page Notes"
                  value={sessionDraft.notes}
                  onChange={(event) => setSessionDraft((current) => ({ ...current, notes: event.target.value }))}
                />
              </label>

              <h3>Session Data Sources</h3>
              <label>
                Source mode
                <select
                  aria-label="Sessions Source Mode"
                  value={sessionAssignment?.mode || 'default'}
                  onChange={(event) => props.onSaveSessionAssignment(selectedSession.id, event.target.value as 'default' | 'specific', sessionAssignment?.sourceIds || [])}
                >
                  <option value="default">Default (all event sources)</option>
                  <option value="specific">Specific source selection</option>
                </select>
              </label>

              {sessionAssignment?.mode === 'specific' ? (
                props.config.dataSources.length === 0 ? (
                  <p>No configured data sources are available yet. Add and configure them in System.</p>
                ) : (
                  <ul>
                    {props.config.dataSources.map((source) => {
                      const checked = sessionAssignment.sourceIds.includes(source.id);
                      return (
                        <li key={`session-source-${selectedSession.id}-${source.id}`}>
                          <label>
                            <input
                              aria-label={`Session Source ${selectedSession.id} ${source.id}`}
                              type="checkbox"
                              checked={checked}
                              onChange={() => props.onSaveSessionAssignment(selectedSession.id, 'specific', toggleInList(sessionAssignment.sourceIds, source.id))}
                            />
                            {source.name}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : null}

              <p>Effective sources: {effectiveSessionSourceIds.length}</p>
              <div className="events-actions">
                <button type="button" onClick={() => {
                  void saveSession();
                }}>
                  Save Session
                </button>
                <button type="button" onClick={() => selectedEvent && requestFormExit(() => props.onDeleteSession(selectedEvent.id, selectedSession.id))}>
                  Delete Session
                </button>
                <button type="button" onClick={() => selectedEvent && props.onApplySessionSources(selectedEvent.id, selectedSession.id)}>
                  Apply Assigned Sources To Session
                </button>
              </div>
              {warningModal}
            </>
          ) : (
            <p>No sessions are defined for this event.</p>
          )}
        </section>
      </div>
    </section>
  );
};
