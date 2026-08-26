import React from "react";
import {
  type EventCatalogSession,
  type EventCatalogState,
  type SessionStartSequenceItem,
  getCategoriesForEvent,
  getSessionsForEvent,
} from "../../catalog/eventCatalog.js";
import {
  formatMinimumLapTimeInput,
  parseMinimumLapTimeInputToMilliseconds,
} from "../../app/utils/timeutils.js";
import { type SessionSourceReloadMode } from "../../model/sessionSourceReload.js";
import {
  type SystemConfiguration,
  getEventAssignedSourceIds,
} from "../../app/systemConfig.js";
import { type EventCategoryId } from "../../model/eventcategory.js";
import { SelectTextField } from "../../controls/selectTextField.js";
import { EventId, SessionId } from "../../model/raceevent.js";
import { SessionCategoriesPanel } from "../panels/sessionCategories.js";
import { SessionDetailsPanel } from "../panels/sessionDetails.js";
import { SessionListPanel } from "../panels/sessionList.js";
import {
  type UnsavedChangesGuard,
  useUnsavedChangesWarning,
} from "./unsavedChangesWarning.js";

interface SessionsPageProps {
  catalog: EventCatalogState;
  config: SystemConfiguration;
  onApplySessionSources: (
    eventId: EventId,
    sessionId: SessionId,
  ) => void | Promise<void>;
  onCreateSession: (eventId: EventId) => void | Promise<void>;
  onDeleteSession: (
    eventId: EventId,
    sessionId: SessionId,
  ) => void | Promise<void>;
  onMakeSessionActive: (
    eventId: EventId,
    sessionId: SessionId,
  ) => void | Promise<void>;
  onMoveSessionToEvent?: (
    sessionId: SessionId,
    eventId: EventId,
  ) => void | Promise<void>;
  onReloadSessionSources: (
    eventId: EventId,
    sessionId: SessionId,
    mode: SessionSourceReloadMode,
  ) => void | Promise<void>;
  onSaveSessionCategoryAssignment: (
    sessionId: SessionId,
    categoryId: EventCategoryId,
    assigned: boolean,
  ) => void | Promise<void>;
  onSelectEvent: (eventId: EventId) => void;
  onSaveSessionAssignment: (
    sessionId: SessionId,
    mode: "default" | "specific",
    sourceIds: string[],
  ) => void | Promise<void>;
  onSelectSession: (sessionId: SessionId) => void;
  onUnsavedChangesGuardChange?: (
    guard: UnsavedChangesGuard | undefined,
  ) => void;
  onUpdateSession: (
    sessionId: SessionId,
    changes: Partial<
      Pick<
        EventCatalogSession,
        | "categoryIds"
        | "duration"
        | "elapsedTimeCalculation"
        | "kind"
        | "lap1Calculation"
        | "minimumLapTimeMilliseconds"
        | "name"
        | "notes"
        | "scheduledStart"
        | "startSequence"
        | "status"
      >
    >,
  ) => void | Promise<void>;
  selectedEventId?: EventId;
  selectedSessionId?: SessionId;
}

const getSessionDraft = (
  session: EventCatalogSession | undefined,
): {
  kind: EventCatalogSession["kind"];
  elapsedTimeCalculation: string;
  duration: string;
  lap1Calculation: string;
  minimumLapTime: string;
  name: string;
  notes: string;
  scheduledStart: string;
  status: EventCatalogSession["status"];
} => ({
  duration: session?.duration || "",
  elapsedTimeCalculation: session?.elapsedTimeCalculation || "",
  kind: session?.kind || "practice",
  lap1Calculation: session?.lap1Calculation || "",
  minimumLapTime: formatMinimumLapTimeInput(
    session?.minimumLapTimeMilliseconds,
  ),
  name: session?.name || "",
  notes: session?.notes || "",
  scheduledStart: session?.scheduledStart || "",
  status: session?.status || "draft",
});

export const SessionsPage = (props: SessionsPageProps): React.ReactElement => {
  const selectedEvent =
    props.catalog.events.find((event) => event.id === props.selectedEventId) ??
    props.catalog.events.find(
      (event) => event.id === props.catalog.activeEventId,
    ) ??
    props.catalog.events[0];
  const eventSessions = getSessionsForEvent(props.catalog, selectedEvent?.id);
  const selectedSession =
    eventSessions.find((session) => session.id === props.selectedSessionId) ??
    eventSessions[0];
  const sessionCategories = getCategoriesForEvent(
    props.catalog,
    selectedEvent?.id,
  );
  const assignedEventSourceIds = selectedEvent
    ? getEventAssignedSourceIds(props.config, selectedEvent.id)
    : [];
  const sessionAssignment = selectedSession
    ? props.config.sessionSourceAssignments[selectedSession.id] || {
      mode: "default",
      sourceIds: [] as string[],
    }
    : undefined;
  const effectiveSessionSourceIds = sessionAssignment
    ? sessionAssignment.mode === "default"
      ? assignedEventSourceIds
      : sessionAssignment.sourceIds
    : [];
  const selectedSessionDraft = React.useMemo(
    () => getSessionDraft(selectedSession),
    [selectedSession],
  );

  const [sessionDraft, setSessionDraft] = React.useState(selectedSessionDraft);
  const [savedSessionDraft, setSavedSessionDraft] =
    React.useState(selectedSessionDraft);
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

    await props.onUpdateSession(selectedSession.id, {
      duration: sessionDraft.duration.trim() || undefined,
      elapsedTimeCalculation:
        sessionDraft.elapsedTimeCalculation === ""
          ? null
          : (sessionDraft.elapsedTimeCalculation as EventCatalogSession["elapsedTimeCalculation"]),
      kind: sessionDraft.kind,
      lap1Calculation:
        sessionDraft.lap1Calculation === ""
          ? null
          : (sessionDraft.lap1Calculation as EventCatalogSession["lap1Calculation"]),
      minimumLapTimeMilliseconds: parseMinimumLapTimeInputToMilliseconds(
        sessionDraft.minimumLapTime,
      ),
      name: sessionDraft.name,
      notes: sessionDraft.notes,
      scheduledStart: sessionDraft.scheduledStart,
      status: sessionDraft.status,
    });
    setSavedSessionDraft(sessionDraft);
    return true;
  };

  const { requestExit: requestFormExit, warningModal } =
    useUnsavedChangesWarning({
      hasUnsavedChanges: hasUnsavedChanges && !!selectedSession,
      itemName: selectedSession?.name || selectedSession?.id,
      itemType: "session",
      onSave: saveSession,
      onUnsavedChangesGuardChange: props.onUnsavedChangesGuardChange,
    });

  return (
    <section className="events-screen">
      <h1>Sessions</h1>
      <SelectTextField
        className="page-filter-label"
        label="Event"
        slotProps={{ select: { "aria-label": "Sessions Event", native: true } }}
        aria-label="Sessions Event"
        value={selectedEvent?.id || ""}
        onChange={(event) => {
          const eventId = event.target.value;
          requestFormExit(() => props.onSelectEvent(eventId));
        }}
      >
        {props.catalog.events.map((event) => (
          <option key={event.id} value={event.id}>
            {event.name}
          </option>
        ))}
      </SelectTextField>
      <div className="events-layout">
        <SessionListPanel
          activeSessionId={props.catalog.activeSessionId}
          allowCreateSession={true}
          onCreateSession={() =>
            selectedEvent && props.onCreateSession(selectedEvent.id)
          }
          onMakeSessionActive={() =>
            selectedEvent &&
            selectedSession &&
            props.onMakeSessionActive(selectedEvent.id, selectedSession.id)
          }
          onSelectSession={props.onSelectSession}
          requestFormExit={requestFormExit}
          selectedSession={selectedSession}
          sessions={eventSessions}
        />
        <SessionDetailsPanel
          catalog={props.catalog}
          config={props.config}
          effectiveSessionSourceIds={effectiveSessionSourceIds}
          onApplySessionSources={() =>
            selectedEvent &&
            selectedSession &&
            props.onApplySessionSources(selectedEvent.id, selectedSession.id)
          }
          onDeleteSession={() =>
            selectedEvent &&
            selectedSession &&
            requestFormExit(() =>
              props.onDeleteSession(selectedEvent.id, selectedSession.id),
            )
          }
          onMoveSessionToEvent={
            props.onMoveSessionToEvent
              ? (eventId) => {
                if (selectedSession) {
                  requestFormExit(() =>
                      props.onMoveSessionToEvent!(selectedSession.id, eventId),
                  );
                }
              }
              : undefined
          }
          onReloadSessionSources={(mode) =>
            selectedEvent &&
            selectedSession &&
            props.onReloadSessionSources(
              selectedEvent.id,
              selectedSession.id,
              mode,
            )
          }
          onSaveSessionAssignment={(mode, sourceIds) => {
            if (selectedSession) {
              props.onSaveSessionAssignment(
                selectedSession.id,
                mode,
                sourceIds,
              );
            }
          }}
          onSaveSession={() => saveSession().then(() => undefined)}
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
              props.onSaveSessionCategoryAssignment(
                selectedSession.id,
                categoryId,
                false,
              );
            }
          }}
          onSaveStartSequence={(startSequence: SessionStartSequenceItem[]) => {
            if (selectedSession) {
              props.onUpdateSession(selectedSession.id, {
                categoryIds: startSequence
                  .filter((item) => item.type === "category")
                  .map((item) => item.categoryId),
                startSequence,
              });
            }
          }}
          selectedSession={selectedSession}
        />
      </div>
    </section>
  );
};
