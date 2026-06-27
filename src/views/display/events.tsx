import React from 'react';
import {
  type EventCatalogEvent,
  type EventCatalogState,
  getCategoriesForEvent,
  getSessionsForEvent,
} from '../../app/eventCatalog.js';
import { type SystemConfiguration, getEventAssignedSourceIds } from '../../app/systemConfig.js';
import { getSupportedTimeZones, getSystemTimeZone } from '../../app/utils/timeutils.js';
import { type EventId, type SessionId } from '../../model/raceevent.js';
import { type UnsavedChangesGuard, useUnsavedChangesWarning } from './unsavedChangesWarning.js';
import { CategorySummaryPanel } from '../panels/categorySummary.js';
import { EventDataSourcesPanel } from '../panels/eventDataSources.js';
import { EventDetailsPanel } from '../panels/eventDetails.js';
import { EventListPanel } from '../panels/eventList.js';
import { SessionsPanel } from '../panels/sessions.js';

interface EventsScreenProps {
  catalog: EventCatalogState;
  config: SystemConfiguration;
  onActivateEvent: (eventId: EventId) => void | Promise<void>;
  onCreateEvent: () => void | Promise<void>;
  onDeleteEvent: (eventId: EventId) => void | Promise<void>;
  onSaveEventAssignment: (eventId: EventId, sourceIds: string[]) => void | Promise<void>;
  onSelectEvent: (eventId: EventId) => void;
  onSelectSession: (sessionId: SessionId) => void;
  onUnsavedChangesGuardChange?: (guard: UnsavedChangesGuard | undefined) => void;
  onUpdateEvent: (eventId: EventId, changes: { date?: string; format?: EventCatalogEvent['format']; name?: string; timeZone?: string }) => void | Promise<void>;
  selectedEventId?: EventId;
  selectedSessionId?: SessionId;
}

const getEventDraft = (event: EventCatalogEvent | undefined, systemTimeZone: string): {
  date: string;
  format: EventCatalogEvent['format'];
  name: string;
  timeZone: string;
} => ({
  date: event?.date || '',
  format: event?.format || 'race-weekend',
  name: event?.name || '',
  timeZone: event?.timeZone || systemTimeZone,
});

export const EventsScreen = (props: EventsScreenProps): React.ReactElement => {
  const selectedEvent = props.catalog.events.find((event) => event.id === props.selectedEventId) ??
    props.catalog.events.find((event) => event.id === props.catalog.activeEventId) ??
    props.catalog.events[0];
  const selectedEventSessions = getSessionsForEvent(props.catalog, selectedEvent?.id);
  const selectedEventCategories = getCategoriesForEvent(props.catalog, selectedEvent?.id);
  const selectedSession = selectedEventSessions.find((session) => session.id === props.selectedSessionId) ?? selectedEventSessions[0];
  const assignedSourceIds = selectedEvent ? getEventAssignedSourceIds(props.config, selectedEvent.id) : [];
  const timeZoneOptions = React.useMemo(() => getSupportedTimeZones(), []);
  const systemTimeZone = React.useMemo(() => getSystemTimeZone(), []);
  const selectedEventDraft = React.useMemo(() => getEventDraft(selectedEvent, systemTimeZone), [selectedEvent, systemTimeZone]);

  const [eventDraft, setEventDraft] = React.useState(selectedEventDraft);
  const [savedEventDraft, setSavedEventDraft] = React.useState(selectedEventDraft);
  const hasUnsavedChanges = selectedEvent
    ? JSON.stringify(eventDraft) !== JSON.stringify(savedEventDraft)
    : false;

  React.useEffect(() => {
    setEventDraft(selectedEventDraft);
    setSavedEventDraft(selectedEventDraft);
  }, [selectedEventDraft]);

  const saveEvent = async (): Promise<boolean> => {
    if (!selectedEvent) {
      return true;
    }

    await props.onUpdateEvent(selectedEvent.id, eventDraft);
    setSavedEventDraft(eventDraft);
    return true;
  };

  const { requestExit: requestFormExit, warningModal } = useUnsavedChangesWarning({
    hasUnsavedChanges: hasUnsavedChanges && !!selectedEvent,
    itemName: selectedEvent?.name || selectedEvent?.id,
    itemType: 'event',
    onSave: saveEvent,
    onUnsavedChangesGuardChange: props.onUnsavedChangesGuardChange,
  });

  const handleCreateEvent = (): void => {
    requestFormExit(() => props.onCreateEvent());
  };

  const handleSelectEvent = (eventId: EventId): void => {
    if (eventId === selectedEvent?.id) {
      return;
    }

    requestFormExit(() => props.onSelectEvent(eventId));
  };

  const handleDeleteEvent = (): void => {
    if (!selectedEvent) {
      return;
    }

    requestFormExit(() => props.onDeleteEvent(selectedEvent.id));
  };

  return (
    <section className="events-screen">
      <h1>Events</h1>
      <div className="events-layout">
        <EventListPanel
          activeEventId={props.catalog.activeEventId}
          events={props.catalog.events}
          onCreateEvent={handleCreateEvent}
          onSelectEvent={handleSelectEvent}
          selectedEventId={selectedEvent?.id}
        />

        <div
          className="event-detail-column"
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0 }}
        >
          <EventDetailsPanel
            activeEventId={props.catalog.activeEventId}
            eventDraft={eventDraft}
            onActivateEvent={selectedEvent ? () => props.onActivateEvent(selectedEvent.id) : undefined}
            onDeleteEvent={handleDeleteEvent}
            onSaveEventDetails={() => {
              void saveEvent();
            }}
            onUpdateEventDraft={setEventDraft}
            selectedEvent={selectedEvent}
            timeZoneOptions={timeZoneOptions}
            warningModal={warningModal}
          />

          <EventDataSourcesPanel
            assignedSourceIds={assignedSourceIds}
            dataSources={props.config.dataSources}
            onSaveEventAssignment={props.onSaveEventAssignment}
            selectedEvent={selectedEvent}
          />
        </div>

        <div className="event-summary-column">
          <SessionsPanel
            onSelectSession={props.onSelectSession}
            selectedSession={selectedSession}
            sessions={selectedEventSessions}
          />
          <CategorySummaryPanel categories={selectedEventCategories} />
        </div>
      </div>
    </section>
  );
};
