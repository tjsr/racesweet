import React from 'react';
import { type EventCatalogSession } from '../../catalog/eventCatalog.js';
import { type SessionId } from '../../model/raceevent.js';
import { SessionListCard } from '../../controls/sessionListCard.js';

interface SessionListPanelProps {
  activeSessionId?: SessionId;
  allowCreateSession?: boolean;
  className?: string;
  emptyText?: string;
  onCreateSession?: () => void | Promise<void>;
  onMakeSessionActive?: () => void | Promise<void>;
  onSelectSession?: (sessionId: SessionId) => void | Promise<void>;
  requestFormExit?: (action: () => void | Promise<void>) => void;
  selectedSession?: EventCatalogSession;
  sessions: EventCatalogSession[];
  title?: string;
}

export const SessionListPanel = (props: SessionListPanelProps): React.ReactElement => {
  const requestFormExit = props.requestFormExit ?? ((action: () => void | Promise<void>) => action());
  const showActions = !!props.onCreateSession || !!props.onMakeSessionActive;

  return (
    <section className={['events-panel', props.className || ''].filter((value) => value.length > 0).join(' ')}>
      <h2>{props.title || 'Session List'}</h2>
      {showActions ? (
        <div className="events-actions">
          {props.onCreateSession ? (
            <button
              type="button"
              onClick={() => {
                if (!props.allowCreateSession) {
                  return;
                }
                const onCreateSession = props.onCreateSession!;
                requestFormExit(() => onCreateSession());
              }}
              disabled={!props.allowCreateSession}
            >
              Create Session
            </button>
          ) : null}
          {props.onMakeSessionActive ? (
            <button
              type="button"
              onClick={() => {
                const onMakeSessionActive = props.onMakeSessionActive!;
                void onMakeSessionActive();
              }}
              disabled={!props.selectedSession || props.selectedSession.id === props.activeSessionId}
            >
              {props.selectedSession && props.selectedSession.id === props.activeSessionId ? 'Active Session' : 'Make Active'}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="events-session-list" role={props.onSelectSession ? 'listbox' : 'list'} aria-label="Sessions for selected event">
        {props.sessions.length > 0 ? props.sessions.map((session) => {
          const isSelected = session.id === props.selectedSession?.id;
          return (
            <SessionListCard
              key={session.id}
              activeSessionId={props.activeSessionId}
              onClick={props.onSelectSession ? () => {
                if (isSelected) {
                  return;
                }

                const onSelectSession = props.onSelectSession!;
                requestFormExit(() => onSelectSession(session.id));
              } : undefined}
              selected={isSelected}
              session={session}
            />
          );
        }) : (
          <p>{props.emptyText || 'No sessions are assigned.'}</p>
        )}
      </div>
    </section>
  );
};
