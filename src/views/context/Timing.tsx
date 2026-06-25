import React from 'react';
import { type EventCatalogState } from '../../app/eventCatalog.js';
import { type TimeDisplayZoneMode } from '../../app/utils/timeutils.js';
import { RecentRecords } from '../../app/views/timing/recentRecords.js';
import { type EventCategory, type EventCategoryId } from '../../model/eventcategory.js';
import { type EventParticipantId } from '../../model/eventparticipant.js';
import { EventId, SessionId } from '../../model/raceevent.js';
import { type RaceStateLookup } from '../../model/racestate.js';
import { type EventTimeRecord, type TimeRecordId } from '../../model/timerecord.js';

type EventCatalogEvent = EventCatalogState['events'][number];
type EventCatalogSession = EventCatalogState['sessions'][number];
type TimingRaceState = RaceStateLookup & {
  categories?: EventCategory[];
  records?: unknown[];
};

interface TimingContextProps {
  activeSession?: EventCatalogSession;
  categoryListSelected: (ids: Set<EventCategoryId>) => void;
  eventTimeZone: string;
  events: EventCatalogEvent[];
  onAddRecord: (record: EventTimeRecord) => void;
  onEditRecord: (record: EventTimeRecord) => void;
  onAssignFlagCategory: (flagId: TimeRecordId, categoryId: EventCategoryId) => void;
  onChangeCategory: (participantId: string, categoryId: EventCategoryId) => void;
  onExclude: (crossingId: string, exclude: boolean) => void;
  onMarkFlagDeleted: (flagId: TimeRecordId, deleted: boolean) => void;
  onRemoveFlagCategory: (flagId: TimeRecordId, categoryId: EventCategoryId) => void;
  onSelectEvent: (eventId: EventId) => void;
  onSelectSession: (sessionId: SessionId) => void;
  onTimeDisplayZoneModeChange: (mode: TimeDisplayZoneMode) => void;
  participantSelected: (participantId: Set<EventParticipantId>) => void;
  raceState: TimingRaceState;
  selectedCategories: Set<EventCategoryId>;
  selectedParticipants: Set<EventParticipantId>;
  sessions: EventCatalogSession[];
  timeDisplayZoneMode: TimeDisplayZoneMode;
  timingEvent?: EventCatalogEvent;
  timingSessionValue: string;
}

export const TimingContext = (props: TimingContextProps): React.ReactElement => {
  return (
    <>
      <h1>Timing</h1>
      <div className="timing-context-row">
        <label className="page-filter-label">
          Event
          <select
            aria-label="Timing Event"
            value={props.timingEvent?.id || ''}
            onChange={(event) => props.onSelectEvent(event.target.value)}
          >
            {props.events.map((event: EventCatalogEvent) => (
              <option key={event.id} value={event.id}>{event.name}</option>
            ))}
          </select>
        </label>
        <label className="page-filter-label">
          Session
          <select
            aria-label="Timing Session"
            value={props.timingSessionValue}
            onChange={(event) => props.onSelectSession(event.target.value)}
          >
            <option value="active">Active session ({props.activeSession?.name || 'None'})</option>
            {props.sessions.map((session) => (
              <option key={session.id} value={session.id}>{session.name}{props.activeSession?.id == session.id ? ' (Active)' : ''}</option>
            ))}
          </select>
        </label>
      </div>
      <RecentRecords
        currentEventId={props.timingEvent?.id}
        currentSessionId={props.timingSessionValue === 'active' ? props.activeSession?.id : props.timingSessionValue}
        eventTimeZone={props.eventTimeZone}
        onAddRecord={props.onAddRecord}
        onEditRecord={props.onEditRecord}
        records={(props.raceState.records as EventTimeRecord[]) || []}
        raceStateLookup={props.raceState}
        selectedCategories={props.selectedCategories}
        selectedParticipants={props.selectedParticipants}
        categorySelected={props.categoryListSelected}
        timeDisplayZoneMode={props.timeDisplayZoneMode}
        onAssignFlagCategory={props.onAssignFlagCategory}
        onTimeDisplayZoneModeChange={props.onTimeDisplayZoneModeChange}
        participantSelected={props.participantSelected}
        onExclude={props.onExclude}
        onChangeCategory={props.onChangeCategory}
        onMarkFlagDeleted={props.onMarkFlagDeleted}
        onRemoveFlagCategory={props.onRemoveFlagCategory}
      />
    </>
  );
};
