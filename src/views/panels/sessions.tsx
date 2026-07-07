import React from 'react';
import { type EventCatalogSession } from '../../catalog/eventCatalog.js';
import { type SessionId } from '../../model/raceevent.js';
import { SessionListPanel } from './sessionList.js';

interface SessionsPanelProps {
  activeSessionId?: SessionId;
  allowCreateSession?: boolean;
  onCreateSession?: () => void | Promise<void>;
  onMakeSessionActive?: () => void | Promise<void>;
  onSelectSession: (sessionId: SessionId) => void | Promise<void>;
  requestFormExit?: (action: () => void | Promise<void>) => void;
  selectedSession?: EventCatalogSession;
  sessions: EventCatalogSession[];
}

export const SessionsPanel = (props: SessionsPanelProps): React.ReactElement => (
  <SessionListPanel
    activeSessionId={props.activeSessionId}
    allowCreateSession={props.allowCreateSession ?? false}
    onCreateSession={props.onCreateSession ?? (() => undefined)}
    onMakeSessionActive={props.onMakeSessionActive ?? (() => undefined)}
    onSelectSession={props.onSelectSession}
    requestFormExit={props.requestFormExit ?? ((action) => action())}
    selectedSession={props.selectedSession}
    sessions={props.sessions}
  />
);
