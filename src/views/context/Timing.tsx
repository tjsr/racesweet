import React from 'react';
import { type EventCatalogState } from '../../catalog/eventCatalog.js';
import { type FastestTimeIndicatorColors } from '../../app/systemConfig.js';
import { type TimeDisplayZoneMode } from '../../app/utils/timeutils.js';
import { RecentRecords } from '../../app/views/timing/recentRecords.js';
import { type EventCategory, type EventCategoryId } from '../../model/eventcategory.js';
import { type EventParticipantId } from '../../model/eventparticipant.js';
import { EventId, SessionId } from '../../model/raceevent.js';
import { type RaceStateLookup } from '../../model/racestate.js';
import { type EventTimeRecord, type TimeRecordId } from '../../model/timerecord.js';
import { InlineLoadingIndicator } from '../panels/InlineLoadingIndicator.js';

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
  fastestTimeIndicatorColors?: FastestTimeIndicatorColors;
  onAddRecord: (record: EventTimeRecord) => void;
  onEditRecord: (record: EventTimeRecord) => void;
  onAssignFlagCategory: (flagId: TimeRecordId, categoryId: EventCategoryId) => void;
  onChangeCategory: (participantId: EventParticipantId, categoryId: EventCategoryId) => void;
  onExclude: (crossingId: TimeRecordId, exclude: boolean) => void;
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
  timingSelectionLoading?: boolean;
  timingSessionValidCategoryIds?: Set<EventCategoryId>;
  timingSessionValue: string;
}

export const TimingContext = (props: TimingContextProps): React.ReactElement => {
  const sortedSessions = [...props.sessions].sort((left, right) => {
    const leftTime = Date.parse(left.scheduledStart);
    const rightTime = Date.parse(right.scheduledStart);
    const leftHasValidTime = Number.isFinite(leftTime);
    const rightHasValidTime = Number.isFinite(rightTime);

    if (leftHasValidTime && rightHasValidTime && leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    if (leftHasValidTime !== rightHasValidTime) {
      return leftHasValidTime ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
  const sessionDayKeyFormatter = new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: '2-digit',
    timeZone: props.eventTimeZone,
    weekday: 'short',
    year: 'numeric',
  });
  const sessionTimeFormatter = new Intl.DateTimeFormat('en-AU', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    timeZone: props.eventTimeZone,
  });
  const sessionWeekdayFormatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: props.eventTimeZone,
    weekday: 'short',
  });
  const multipleSessionDays = new Set(
    sortedSessions
      .map((session) => {
        const parsed = new Date(session.scheduledStart);
        return Number.isNaN(parsed.getTime()) ? undefined : sessionDayKeyFormatter.format(parsed);
      })
      .filter((value): value is string => value !== undefined)
  ).size > 1;
  const formatTimingSessionOption = (session: EventCatalogSession): string => {
    const parsed = new Date(session.scheduledStart);
    if (Number.isNaN(parsed.getTime())) {
      return session.name;
    }

    const timeLabel = sessionTimeFormatter.format(parsed);
    const prefix = multipleSessionDays
      ? `${sessionWeekdayFormatter.format(parsed)} ${timeLabel}`
      : timeLabel;
    return `[${prefix}] ${session.name}`;
  };
  const selectedTimingSession = props.timingSessionValue === 'active'
    ? props.activeSession
    : sortedSessions.find((session) => session.id === props.timingSessionValue);

  return (
    <>
      <h1>Timing</h1>
      <div className="timing-context-row">
        <label className="page-filter-label">
          Event
          <span className="timing-selection-select-row">
            <select
              aria-label="Timing Event"
              value={props.timingEvent?.id || ''}
              onChange={(event) => props.onSelectEvent(event.target.value)}
            >
              {props.events.map((event: EventCatalogEvent) => (
                <option key={event.id} value={event.id}>{event.name}</option>
              ))}
            </select>
            {props.timingSelectionLoading ? (
              <InlineLoadingIndicator ariaLabel="Loading Timing event" />
            ) : null}
          </span>
        </label>
        <label className="page-filter-label">
          Session
          <span className="timing-selection-select-row">
            <select
              aria-label="Timing Session"
              value={props.timingSessionValue}
              onChange={(event) => props.onSelectSession(event.target.value)}
            >
              <option value="active">Active session ({props.activeSession?.name || 'None'})</option>
              {sortedSessions.map((session) => (
                <option key={session.id} value={session.id}>{formatTimingSessionOption(session)}{props.activeSession?.id == session.id ? ' (Active)' : ''}</option>
              ))}
            </select>
            {props.timingSelectionLoading ? (
              <InlineLoadingIndicator ariaLabel="Loading Timing session" />
            ) : null}
          </span>
        </label>
      </div>
      <RecentRecords
        currentEventId={props.timingEvent?.id}
        currentSessionId={props.timingSessionValue === 'active' ? props.activeSession?.id : props.timingSessionValue}
        eventTimeZone={props.eventTimeZone}
        fastestTimeIndicatorColors={props.fastestTimeIndicatorColors}
        onAddRecord={props.onAddRecord}
        onEditRecord={props.onEditRecord}
        records={(props.raceState.records as EventTimeRecord[]) || []}
        raceStateLookup={props.raceState}
        selectedCategories={props.selectedCategories}
        selectedParticipants={props.selectedParticipants}
        sessionKind={selectedTimingSession?.kind}
        sessionValidCategoryIds={props.timingSessionValidCategoryIds}
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
