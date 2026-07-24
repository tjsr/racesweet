import React from 'react';
import { type DataSourceConfig } from '../../app/systemConfig.js';
import { type EventCatalogEvent } from '../../catalog/eventCatalog.js';

interface EventDataSourcesPanelProps {
  assignedSourceIds: string[];
  dataSources: DataSourceConfig[];
  onReloadEventSources: (eventId: string) => void | Promise<void>;
  onSaveEventAssignment: (eventId: string, sourceIds: string[]) => void | Promise<void>;
  selectedEvent?: EventCatalogEvent;
}

const toggleInList = (values: string[], value: string): string[] => {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
};

export const EventDataSourcesPanel = (props: EventDataSourcesPanelProps): React.ReactElement => (
  <section className="events-panel event-detail-panel">
    <h2>Event Data Sources</h2>
    {props.selectedEvent ? (
      props.dataSources.length === 0 ? (
        <p>No configured data sources are available yet. Add and configure them in System.</p>
      ) : (
        <ul>
          {(() => {
            const selectedEventId = props.selectedEvent.id;
            return props.dataSources.map((source) => {
              const checked = props.assignedSourceIds.includes(source.id);
              return (
                <li key={`event-source-${source.id}`}>
                  <label>
                    <input
                      aria-label={`Event Source ${selectedEventId} ${source.id}`}
                      type="checkbox"
                      checked={checked}
                      onChange={() => props.onSaveEventAssignment(selectedEventId, toggleInList(props.assignedSourceIds, source.id))}
                    />
                    {source.name}
                  </label>
                </li>
              );
            });
          })()}
        </ul>
      )
    ) : (
      <p>No events are defined.</p>
    )}
    {props.selectedEvent && props.assignedSourceIds.length > 0 ? (
      <div className="events-actions">
        <button
          type="button"
          onClick={() => props.onReloadEventSources(props.selectedEvent!.id)}
        >
          Re-load assigned sources into event sessions
        </button>
      </div>
    ) : null}
  </section>
);
