import React from 'react';
import { type EventCatalogSession } from '../../app/eventCatalog.js';
import { type SessionId } from '../../model/raceevent.js';

interface SessionListPanelProps {
  activeSessionId?: SessionId;
  onCreateSession: () => void | Promise<void>;
  onMakeSessionActive: () => void | Promise<void>;
  onSelectSession: (sessionId: SessionId) => void | Promise<void>;
  requestFormExit: (action: () => void | Promise<void>) => void;
  selectedEventId?: string;
  selectedSession?: EventCatalogSession;
  sessions: EventCatalogSession[];
}

export const SessionListPanel = (props: SessionListPanelProps): React.ReactElement => (
  <section className="events-panel">
    <h2>Session List</h2>
    <div className="events-actions">
      <button
        type="button"
        onClick={() => {
          if (!props.selectedEventId) {
            return;
          }
          props.requestFormExit(() => props.onCreateSession());
        }}
        disabled={!props.selectedEventId}
      >
        Create Session
      </button>
      <button
        type="button"
        onClick={() => props.onMakeSessionActive()}
        disabled={!props.selectedSession || props.selectedSession.id === props.activeSessionId}
      >
        {props.selectedSession && props.selectedSession.id === props.activeSessionId ? 'Active Session' : 'Make Active'}
      </button>
    </div>
    <div className="events-session-list" role="listbox" aria-label="Sessions for selected event">
      {props.sessions.map((session) => {
        const isSelected = session.id === props.selectedSession?.id;
        return (
          <button
            key={session.id}
            type="button"
            className={`events-list-item${isSelected ? ' selected' : ''}`}
            onClick={() => {
              if (!isSelected) {
                props.requestFormExit(() => props.onSelectSession(session.id));
              }
            }}
            aria-selected={isSelected}
          >
            <strong>{session.name}</strong>
            <span>{session.kind}</span>
            <span>{session.status}</span>
            {session.id === props.activeSessionId ? <span className="events-badge">Active</span> : null}
          </button>
        );
      })}
    </div>
  </section>
);
