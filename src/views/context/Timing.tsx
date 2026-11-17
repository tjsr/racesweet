import React from 'react';

import { LinearProgress, MenuItem } from '@mui/material';

import { type ScheduledLivePoll } from '../../app/livePollingScheduler.js';
import { type FastestTimeIndicatorColors } from '../../app/systemConfig.js';
import { type TimeDisplayZoneMode } from '../../app/utils/timeutils.js';
import { RecentRecords } from '../../app/views/timing/recentRecords.js';
import { type EventCatalogState } from '../../catalog/eventCatalog.js';
import { SelectTextField } from '../../controls/selectTextField.js';
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

const formatPollCountdown = (remainingMilliseconds: number): string => {
  const remainingSeconds: number = Math.max(
    0,
    Math.ceil(remainingMilliseconds / 1000),
  );
  const minutes: number = Math.floor(remainingSeconds / 60);
  const seconds: number = remainingSeconds % 60;

  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
};

interface TimingContextProps {
  manualTiming?: React.ReactNode;
  activeSession?: EventCatalogSession;
  categoryListSelected: (ids: Set<EventCategoryId>) => void;
  eventTimeZone: string;
  events: EventCatalogEvent[];
  fastestTimeIndicatorColors?: FastestTimeIndicatorColors;
  onAddRecord: (record: EventTimeRecord) => void | Promise<void>;
  onEditRecord: (record: EventTimeRecord) => void | Promise<void>;
  onAssignFlagCategory: (flagId: TimeRecordId, categoryId: EventCategoryId) => void;
  onChangeCategory: (participantId: EventParticipantId, categoryId: EventCategoryId) => void;
  onExclude: (crossingId: TimeRecordId, exclude: boolean) => void;
  onMarkFlagDeleted: (flagId: TimeRecordId, deleted: boolean) => void;
  onRemoveFlagCategory: (flagId: TimeRecordId, categoryId: EventCategoryId) => void;
  onSelectEvent: (eventId: EventId) => void;
  onSelectSession: (sessionId: SessionId) => void;
  onTimeDisplayZoneModeChange: (mode: TimeDisplayZoneMode) => void;
  onUpdateSourceOffset?: (sourceId: string, previousTime: Date, nextTime: Date) => void;
  participantSelected: (participantId: Set<EventParticipantId>) => void;
  raceState: TimingRaceState;
  scheduledLivePolls?: ScheduledLivePoll[];
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
  const [goToControlContainer, setGoToControlContainer] = React.useState<HTMLSpanElement | null>(null);
  const [currentTime, setCurrentTime] = React.useState<Date>(() => new Date());
  React.useEffect((): (() => void) => {
    const timer: ReturnType<typeof globalThis.setInterval> = globalThis.setInterval(
      (): void => setCurrentTime(new Date()),
      1000,
    );

    return (): void => globalThis.clearInterval(timer);
  }, []);
  const timingEventTimeZone: string = props.timingEvent?.timeZone || props.eventTimeZone;
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
    timeZone: timingEventTimeZone,
    weekday: 'short',
    year: 'numeric',
  });
  const sessionTimeFormatter = new Intl.DateTimeFormat('en-AU', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    timeZone: timingEventTimeZone,
  });
  const sessionWeekdayFormatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: timingEventTimeZone,
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
  const selectedTimingSession = sortedSessions.find((session) => session.id === props.timingSessionValue) || props.activeSession;
  const pollTimeFormatter = new Intl.DateTimeFormat('en-AU', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    second: '2-digit',
    timeZone: timingEventTimeZone,
  });

  return (
    <>
      <h1>Timing</h1>
      {props.manualTiming}
      <div className="timing-context-row">
        <div className="page-filter-label">
          <span className="timing-selection-select-row">
            <SelectTextField
              label="Event"
              slotProps={{
                select: {
                  'aria-label': 'Timing Event',
                },
              }}
              value={props.timingEvent?.id || ''}
              onChange={(event) => props.onSelectEvent(event.target.value)}
            >
              {props.events.map((event: EventCatalogEvent) => (
                <MenuItem key={event.id} value={event.id}>{event.name}</MenuItem>
              ))}
            </SelectTextField>
            <select
              aria-label="Timing Event"
              hidden
              value={props.timingEvent?.id || ''}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>): void => props.onSelectEvent(event.target.value)}
            >
              {props.events.map((event: EventCatalogEvent) => (
                <option key={event.id} value={event.id}>{event.name}</option>
              ))}
            </select>
            {props.timingSelectionLoading ? (
              <InlineLoadingIndicator ariaLabel="Loading Timing event" />
            ) : null}
          </span>
        </div>
        <div className="page-filter-label">
          <span className="timing-selection-select-row">
            <SelectTextField
              label="Session"
              slotProps={{
                select: {
                  'aria-label': 'Timing Session',
                },
              }}
              value={props.timingSessionValue}
              onChange={(event) => props.onSelectSession(event.target.value)}
            >
              {sortedSessions.map((session) => (
                <MenuItem key={session.id} value={session.id}>{formatTimingSessionOption(session)}{props.activeSession?.id === session.id ? ' (active)' : ''}</MenuItem>
              ))}
            </SelectTextField>
            <select
              aria-label="Timing Session"
              hidden
              value={props.timingSessionValue}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>): void => props.onSelectSession(event.target.value)}
            >
              {sortedSessions.map((session) => (
                <option key={session.id} value={session.id}>{formatTimingSessionOption(session)}{props.activeSession?.id === session.id ? ' (active)' : ''}</option>
              ))}
            </select>
            {props.timingSelectionLoading ? (
              <InlineLoadingIndicator ariaLabel="Loading Timing session" />
            ) : null}
          </span>
        </div>
        <section aria-labelledby="next-data-poll-heading" className="timing-live-polls">
          <span id="next-data-poll-heading" className="timing-live-polls-heading">
            Next data poll in:
          </span>
          {props.scheduledLivePolls?.map((poll: ScheduledLivePoll) => {
            const remainingMilliseconds: number = Math.max(
              0,
              poll.nextPollAt.getTime() - currentTime.getTime(),
            );
            const progressValue: number = poll.isPolling
              ? 0
              : Math.min(
                100,
                (remainingMilliseconds / (Math.max(1, poll.pollIntervalSeconds) * 1000)) * 100,
              );
            const pollStatus: string = poll.isPolling
              ? `Polling ${poll.name} now`
              : `${poll.name}: ${formatPollCountdown(remainingMilliseconds)}`;

            return (
              <div key={poll.id} className="timing-live-poll-status">
                <span className="timing-live-poll-name">{poll.name}</span>
                <LinearProgress
                  aria-label={`Next poll for ${poll.name}`}
                  className="timing-live-poll-progress"
                  value={progressValue}
                  variant="determinate"
                />
                <span aria-live="polite" className="timing-live-poll-countdown">
                  {pollStatus}
                  {poll.lastPolledAt
                    ? ` · Last requested ${pollTimeFormatter.format(poll.lastPolledAt)}`
                    : ''}
                </span>
              </div>
            );
          })}
        </section>
        <span className="timing-go-to-control" ref={setGoToControlContainer} />
      </div>
      <RecentRecords
        currentEventId={props.timingEvent?.id}
        currentSessionId={props.timingSessionValue}
        eventDiscipline={props.timingEvent?.discipline}
        eventTimeZone={timingEventTimeZone}
        fastestTimeIndicatorColors={props.fastestTimeIndicatorColors}
        goToControlContainer={goToControlContainer}
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
        onUpdateSourceOffset={props.onUpdateSourceOffset}
        participantSelected={props.participantSelected}
        onExclude={props.onExclude}
        onChangeCategory={props.onChangeCategory}
        onMarkFlagDeleted={props.onMarkFlagDeleted}
        onRemoveFlagCategory={props.onRemoveFlagCategory}
      />
    </>
  );
};
