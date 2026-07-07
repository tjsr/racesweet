
import React from 'react';
import {
  type EventCatalogSession,
  type EventCatalogState,
  getCategoriesForEvent,
  getSessionsForEvent,
} from '../../catalog/eventCatalog.js';
import { type SessionSourceReloadMode } from '../../service/sessionSourceReload.js';
import { type SystemConfiguration, getEventAssignedSourceIds } from '../../app/systemConfig.js';
import { type EventCategoryId } from '../../model/eventcategory.js';
import { EventId, SessionId } from '../../model/raceevent.js';
import { SessionCategoriesPanel } from '../panels/sessionCategories.js';
import { SessionDetailsPanel } from '../panels/sessionDetails.js';
import { SessionListPanel } from '../panels/sessionList.js';
import { type UnsavedChangesGuard, useUnsavedChangesWarning } from './unsavedChangesWarning.js';

interface SessionsPageProps {
  catalog: EventCatalogState;
  config: SystemConfiguration;
  onApplySessionSources: (eventId: EventId, sessionId: SessionId) => void | Promise<void>;
  onCreateSession: (eventId: EventId) => void | Promise<void>;
  onDeleteSession: (eventId: EventId, sessionId: SessionId) => void | Promise<void>;
  onMakeSessionActive: (eventId: EventId, sessionId: SessionId) => void | Promise<void>;
  onMoveSessionToEvent?: (sessionId: SessionId, eventId: EventId) => void | Promise<void>;
  onReloadSessionSources: (eventId: EventId, sessionId: SessionId, mode: SessionSourceReloadMode) => void | Promise<void>;
  onSaveSessionCategoryAssignment: (sessionId: SessionId, categoryId: EventCategoryId, assigned: boolean) => void | Promise<void>;
  onSelectEvent: (eventId: EventId) => void;
  onSaveSessionAssignment: (sessionId: SessionId, mode: 'default' | 'specific', sourceIds: string[]) => void | Promise<void>;
  onSelectSession: (sessionId: SessionId) => void;
  onUnsavedChangesGuardChange?: (guard: UnsavedChangesGuard | undefined) => void;
  onUpdateSession: (sessionId: SessionId, changes: Partial<Pick<EventCatalogSession, 'categoryIds' | 'kind' | 'name' | 'notes' | 'scheduledStart' | 'status'>>) => void | Promise<void>;
  selectedEventId?: EventId;
  selectedSessionId?: SessionId;
}

const getSessionDraft = (session: EventCatalogSession | undefined): {
  kind: EventCatalogSession['kind'];
  name: string;
  notes: string;
  scheduledStart: string;
  status: EventCatalogSession['status'];
} => ({
  kind: session?.kind || 'practice',
  name: session?.name || '',
  notes: session?.notes || '',
  scheduledStart: session?.scheduledStart || '',
  status: session?.status || 'draft',
});

export const SessionsPage = (props: SessionsPageProps): React.ReactElement => {
  const selectedEvent = props.catalog.events.find((event) => event.id === props.selectedEventId) ??
    props.catalog.events.find((event) => event.id === props.catalog.activeEventId) ??
    props.catalog.events[0];
  const eventSessions = getSessionsForEvent(props.catalog, selectedEvent?.id);
  const selectedSession = eventSessions.find((session) => session.id === props.selectedSessionId) ?? eventSessions[0];
  const sessionCategories = getCategoriesForEvent(props.catalog, selectedEvent?.id);
  const assignedEventSourceIds = selectedEvent ? getEventAssignedSourceIds(props.config, selectedEvent.id) : [];
  const sessionAssignment = selectedSession ? (props.config.sessionSourceAssignments[selectedSession.id] || { mode: 'default', sourceIds: [] as string[] }) : undefined;
  const effectiveSessionSourceIds = sessionAssignment
    ? (sessionAssignment.mode === 'default' ? assignedEventSourceIds : sessionAssignment.sourceIds)
    : [];
  const selectedSessionDraft = React.useMemo(() => getSessionDraft(selectedSession), [selectedSession]);

  const [sessionDraft, setSessionDraft] = React.useState(selectedSessionDraft);
  const [savedSessionDraft, setSavedSessionDraft] = React.useState(selectedSessionDraft);
  const hasUnsavedChanges = selectedSession
    ? JSON.stringify(sessionDraft) !== JSON.stringify(savedSessionDraft)
    : false;

  React.useEffect(() => {
    setSessionDraft(selectedSessionDraft);
    setSavedSessionDraft(selectedSessionDraft);
  }, [selectedSessionDraft]);

  const saveSession = async (): Promise<boolean> => {
    if (!selectedSession) {
      return true;
    }

    await props.onUpdateSession(selectedSession.id, sessionDraft);
    setSavedSessionDraft(sessionDraft);
    return true;
  };

  const { requestExit: requestFormExit, warningModal } = useUnsavedChangesWarning({
    hasUnsavedChanges: hasUnsavedChanges && !!selectedSession,
    itemName: selectedSession?.name || selectedSession?.id,
    itemType: 'session',
    onSave: saveSession,
    onUnsavedChangesGuardChange: props.onUnsavedChangesGuardChange,
  });

  return (
    <section className="events-screen">
      <h1>Sessions</h1>
      <label className="page-filter-label">
        Event
        <select
          aria-label="Sessions Event"
          value={selectedEvent?.id || ''}
          onChange={(event) => {
            const eventId = event.target.value;
            requestFormExit(() => props.onSelectEvent(eventId));
          }}
        >
          {props.catalog.events.map((event) => (
            <option key={event.id} value={event.id}>{event.name}</option>
          ))}
        </select>
      </label>
      <div className="events-layout">
        <SessionListPanel
          activeSessionId={props.catalog.activeSessionId}
          allowCreateSession={true}
          onCreateSession={() => selectedEvent && props.onCreateSession(selectedEvent.id)}
          onMakeSessionActive={() => selectedEvent && selectedSession && props.onMakeSessionActive(selectedEvent.id, selectedSession.id)}
          onSelectSession={props.onSelectSession}
          requestFormExit={requestFormExit}
          selectedSession={selectedSession}
          sessions={eventSessions}
        />
        <SessionDetailsPanel
          catalog={props.catalog}
          config={props.config}
          effectiveSessionSourceIds={effectiveSessionSourceIds}
          onApplySessionSources={() => selectedEvent && selectedSession && props.onApplySessionSources(selectedEvent.id, selectedSession.id)}
          onDeleteSession={() => selectedEvent && selectedSession && requestFormExit(() => props.onDeleteSession(selectedEvent.id, selectedSession.id))}
          onMoveSessionToEvent={props.onMoveSessionToEvent ? (eventId) => {
            if (selectedSession) {
              requestFormExit(() => props.onMoveSessionToEvent!(selectedSession.id, eventId));
            }
          } : undefined}
          onReloadSessionSources={(mode) => selectedEvent && selectedSession && props.onReloadSessionSources(selectedEvent.id, selectedSession.id, mode)}
          onSaveSessionAssignment={(mode, sourceIds) => {
            if (selectedSession) {
              props.onSaveSessionAssignment(selectedSession.id, mode, sourceIds);
            }
          }}
          onSaveSession={() => {
            void saveSession();
          }}
          onSetSessionDraft={setSessionDraft}
          requestFormExit={requestFormExit}
          selectedEvent={selectedEvent}
          selectedSession={selectedSession}
          sessionAssignment={sessionAssignment}
          sessionDraft={sessionDraft}
          warningModal={warningModal}
        />
        <SessionCategoriesPanel
          categories={sessionCategories}
          eventSessions={eventSessions}
          onRemoveCategoryFromSession={(categoryId) => {
            if (selectedSession) {
              props.onSaveSessionCategoryAssignment(selectedSession.id, categoryId, false);
            }
          }}
          selectedSession={selectedSession}
        />
      </div>
    </section>
  );
};
