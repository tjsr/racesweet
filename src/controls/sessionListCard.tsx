import React from 'react';
import { type EventCatalogSession } from '../catalog/eventCatalog.js';
import { type SessionId } from '../model/raceevent.js';

interface SessionListCardProps {
  activeSessionId?: SessionId;
  onClick?: () => void | Promise<void>;
  selected?: boolean;
  session: EventCatalogSession;
}

export const SessionListCard = (props: SessionListCardProps): React.ReactElement => {
  const isActive = props.session.id === props.activeSessionId;

  const className = [
    'session-list-card',
    props.selected ? 'selected' : '',
    isActive ? 'active' : '',
    props.onClick ? '' : 'readonly',
  ].filter((value) => value.length > 0).join(' ');

  if (!props.onClick) {
    return (
      <div
        className={className}
        aria-selected={props.selected}
      >
        <strong>{props.session.name}</strong>
        <span>{props.session.kind}</span>
        <span>{props.session.status}</span>
        {isActive ? <span className="events-badge">Active</span> : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      aria-selected={props.selected}
      onClick={() => {
        void props.onClick?.();
      }}
    >
      <strong>{props.session.name}</strong>
      <span>{props.session.kind}</span>
      <span>{props.session.status}</span>
      {isActive ? <span className="events-badge">Active</span> : null}
    </button>
  );
};
