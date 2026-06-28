import React from 'react';
import { type EventCatalogSession } from '../app/eventCatalog.js';
import { type SessionId } from '../model/raceevent.js';

interface SessionListCardProps {
  activeSessionId?: SessionId;
  onClick: () => void | Promise<void>;
  selected?: boolean;
  session: EventCatalogSession;
}

export const SessionListCard = (props: SessionListCardProps): React.ReactElement => {
  const isActive = props.session.id === props.activeSessionId;

  return (
    <button
      type="button"
      className={[
        'session-list-card',
        props.selected ? 'selected' : '',
        isActive ? 'active' : '',
      ].filter((className) => className.length > 0).join(' ')}
      aria-selected={props.selected}
      onClick={() => {
        void props.onClick();
      }}
    >
      <strong>{props.session.name}</strong>
      <span>{props.session.kind}</span>
      <span>{props.session.status}</span>
      {isActive ? <span className="events-badge">Active</span> : null}
    </button>
  );
};
