import React from 'react';
import { type EventCatalogSession } from '../../app/eventCatalog.js';
import { SessionId } from '../../model/raceevent.js';

interface SessionsPanelProps {
  onSelectSession: (sessionId: SessionId) => void | Promise<void>;
  selectedSession?: EventCatalogSession;
  sessions: EventCatalogSession[];
}

export const SessionsPanel = (props: SessionsPanelProps): React.ReactElement => (
  <section className="events-panel session-detail-panel">
    <h2>Sessions</h2>
    {props.sessions.length > 0 ? (
      <div className="events-session-list" role="listbox" aria-label="Event sessions">
        {props.sessions.map((session) => {
          const isSelected = session.id === props.selectedSession?.id;
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
    ) : (
      <p>No sessions in this event.</p>
    )}
    {props.selectedSession ? <p>Selected session: {props.selectedSession.name}</p> : null}
  </section>
);
