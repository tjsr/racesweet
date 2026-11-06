import { Button } from '@mui/material';
import React from 'react';
import { type DataSourceConfig } from '../../app/systemConfig.js';
import { type EventCatalogEvent } from '../../catalog/eventCatalog.js';
import { type EventDataSourceOption, EventsDataSourceSelector } from '../../controls/eventsDataSourceSelector.js';

interface EventDataSourcesPanelProps {
  assignedSourceIds: string[];
  dataSources: DataSourceConfig[];
  onReloadEventSources: (eventId: string) => void | Promise<void>;
  onSaveEventAssignment: (eventId: string, sourceIds: string[]) => void | Promise<void>;
  selectedEvent?: EventCatalogEvent;
}

const getEventLastLoadedAt = (event: EventCatalogEvent, sourceIds: string[]): string | undefined => {
  const loadedAtValues: string[] = sourceIds
    .map((sourceId: string) => event.dataSourceLastLoadedAt?.[sourceId])
    .filter((loadedAt: string | undefined): loadedAt is string => loadedAt !== undefined);
  return loadedAtValues.length === sourceIds.length && new Set<string>(loadedAtValues).size === 1
    ? loadedAtValues[0]
    : undefined;
};

export const EventDataSourcesPanel = (props: EventDataSourcesPanelProps): React.ReactElement => (
  <section className="events-panel event-detail-panel">
    <h2>Event Data Sources</h2>
    {props.selectedEvent ? (
      props.dataSources.length === 0 ? (
        <p>No configured data sources are available yet. Add and configure them in System.</p>
      ) : (
        <EventsDataSourceSelector
          ariaLabel="Event Data Sources"
          label="Assigned data sources"
          onChange={(sourceIds: string[]): void => {
            void props.onSaveEventAssignment(props.selectedEvent!.id, sourceIds);
          }}
          options={props.dataSources.map((source: DataSourceConfig): EventDataSourceOption => {
            const lastLoadedAt: string | undefined = props.selectedEvent!.dataSourceLastLoadedAt?.[source.id];
            const eventLastLoadedAt: string | undefined = getEventLastLoadedAt(props.selectedEvent!, props.assignedSourceIds);
            return {
              id: source.id,
              label: `${source.name}${lastLoadedAt && lastLoadedAt !== eventLastLoadedAt ? ` (Last loaded at ${lastLoadedAt})` : ''}`,
            };
          })}
          sourceIds={props.assignedSourceIds}
        />
      )
    ) : (
      <p>No events are defined.</p>
    )}
    {props.selectedEvent && props.assignedSourceIds.length > 0 ? (
      <div className="events-actions">
        <Button
          type="button"
          onClick={() => props.onReloadEventSources(props.selectedEvent!.id)}
        >
          Re-load assigned sources into event sessions
        </Button>
        <p aria-label="Event Data Sources Last Loaded At">
          {getEventLastLoadedAt(props.selectedEvent, props.assignedSourceIds)
            ? `Last loaded at ${getEventLastLoadedAt(props.selectedEvent, props.assignedSourceIds)}`
            : 'Last loaded at varies by data source or is not yet available.'}
        </p>
      </div>
    ) : null}
  </section>
);
