import React from 'react';
import { type EventCatalogEvent } from '../../catalog/eventCatalog.js';
import { type EventId } from '../../model/raceevent.js';

interface EventListPanelProps {
  activeEventId?: EventId;
  events: EventCatalogEvent[];
  onCreateEvent: () => void | Promise<void>;
  onSelectEvent: (eventId: EventId) => void | Promise<void>;
  selectedEventId?: EventId;
}

export const EventListPanel = (props: EventListPanelProps): React.ReactElement => (
  <section className="events-panel events-list-panel">
    <div className="events-actions">
      <h2>Event List</h2>
      <button type="button" onClick={() => props.onCreateEvent()}>
        New
      </button>
    </div>
    <div className="events-list" role="listbox" aria-label="Defined events">
      {props.events.map((event) => {
        const isSelected = event.id === props.selectedEventId;
        const isActive = event.id === props.activeEventId;

        return (
          <button
            key={event.id}
            type="button"
            className={`events-list-item${isSelected ? ' selected' : ''}`}
            onClick={() => {
              if (!isSelected) {
                void props.onSelectEvent(event.id);
              }
            }}
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
);
