import React from 'react';
import { type EventCatalogSession } from '../../app/eventCatalog.js';
import { type SessionId } from '../../model/raceevent.js';
import { SessionListCard } from '../../controls/sessionListCard.js';

interface SessionListPanelProps {
  activeSessionId?: SessionId;
  onCreateSession: () => void | Promise<void>;
  onMakeSessionActive: () => void | Promise<void>;
  onSelectSession: (sessionId: SessionId) => void | Promise<void>;
  requestFormExit: (action: () => void | Promise<void>) => void;
  allowCreateSession: boolean;
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
          if (!props.allowCreateSession) {
            return;
          }
          props.requestFormExit(() => props.onCreateSession());
        }}
        disabled={!props.allowCreateSession}
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
          <SessionListCard
            key={session.id}
            activeSessionId={props.activeSessionId}
            onClick={() => {
              if (!isSelected) {
                props.requestFormExit(() => props.onSelectSession(session.id));
              }
            }}
            selected={isSelected}
            session={session}
          />
        );
      })}
    </div>
  </section>
);
