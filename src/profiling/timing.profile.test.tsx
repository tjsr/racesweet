// @vitest-environment jsdom

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import React, { type ProfilerOnRenderCallback, act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { selectedCategoriesForParticipants } from '../app/selectionState.js';
import { convertApicalSpreadsheetRowsToApicalData } from '../controllers/apical/apicalSpreadsheetProcessor.js';
import { getParticipantNumber } from '../controllers/participant.js';
import { getAutomaticIdentifier, isCrossingRecord } from '../controllers/timerecord.js';
import type { ApicalLapByCategory } from '../model/apical.js';
import type { EventCategory, EventCategoryId } from '../model/eventcategory.js';
import type { EventParticipant, EventParticipantId } from '../model/eventparticipant.js';
import { createEventId, createSessionId, createTimeRecordId, createTimeRecordSourceId } from '../model/ids.js';
import type { RaceStateLookup } from '../model/racestate.js';
import type { EventTimeRecord, ParticipantPassingRecord } from '../model/timerecord.js';
import { convertDataToRaceState } from '../parsers/apical.js';
import { useUiConsoleGuards } from '../testing/uiConsoleGuards.js';
import { type ApicalSpreadsheetLapsRow } from '../app/apicalDataSource.js';
import { TimingContext } from '../views/context/Timing.js';

interface ProfileSample {
  actualDuration: number;
  baseDuration: number;
  commitTime: number;
  id: string;
  phase: 'mount' | 'nested-update' | 'update';
  startTime: number;
}

interface ProfileSummary {
  maxActualDurationMs: number;
  sampleCount: number;
  totalActualDurationMs: number;
}

interface LookupMetricSummary {
  callCount: number;
  totalDurationMs: number;
}

interface TimingProfileRaceState extends RaceStateLookup {
  categories: EventCategory[];
  participants: EventParticipant[];
  records: EventTimeRecord[];
}

const PROFILE_REPEAT_COUNT = 10;
const PROFILE_EVENT_ID = createEventId('timing-profile-event');
const PROFILE_SESSION_ID = createSessionId('timing-profile-session');

const describeTimingProfile = process.env.RUN_TIMING_PROFILE ? describe : describe.skip;

const readApicalDataFixture = async (): Promise<ApicalLapByCategory> => {
  const content = await readFile(path.join(process.cwd(), 'src', 'testdata', '2025-06-06-data.json'), 'utf8');
  return JSON.parse(content) as ApicalLapByCategory;
};

const apicalDataToSpreadsheetRows = (apicalData: ApicalLapByCategory): ApicalSpreadsheetLapsRow[] => {
  return apicalData.flatMap((category) => {
    return category.ParticipantViewModels.flatMap((entrant) => {
      return entrant.LapByCategoryViewModels.map((lap): ApicalSpreadsheetLapsRow => {
        const lapWithOptionalTimeOfDay = lap as typeof lap & { TimeOfDay?: string | number };
        return {
          CategoryName: category.CategoryName,
          CumulativeLapTimeSpan: lap.CumulativeLapTimeSpan,
          FullName: lap.FullName,
          LapNumber: lap.LapNumber,
          LapTimeSpan: lap.LapTimeSpan,
          Position: entrant.Position,
          RaceNumber: lap.RaceNumber,
          TeamNameDisplay: entrant.TeamNameDisplay,
          TimeOfDay: lapWithOptionalTimeOfDay.TimeOfDay || lap.CumulativeLapTimeSpan,
        };
      });
    });
  });
};

const summarizeProfileSamples = (samples: ProfileSample[]): ProfileSummary => {
  return samples.reduce<ProfileSummary>((summary, sample) => {
    return {
      maxActualDurationMs: Math.max(summary.maxActualDurationMs, sample.actualDuration),
      sampleCount: summary.sampleCount + 1,
      totalActualDurationMs: summary.totalActualDurationMs + sample.actualDuration,
    };
  }, {
    maxActualDurationMs: 0,
    sampleCount: 0,
    totalActualDurationMs: 0,
  });
};

const formatLookupMetrics = (metrics: Map<string, LookupMetricSummary>): string => {
  return Array.from(metrics.entries())
    .sort((left, right) => right[1].totalDurationMs - left[1].totalDurationMs)
    .map(([name, summary]) => `${name}:calls=${summary.callCount},ms=${summary.totalDurationMs.toFixed(2)}`)
    .join(' ');
};

const waitForCondition = async (predicate: () => boolean, errorMessage: string): Promise<void> => {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (predicate()) {
      return;
    }

    await act(async () => {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
      });
    });
  }

  throw new Error(errorMessage);
};

const createTimingProfileRaceState = async (): Promise<TimingProfileRaceState> => {
  const apicalData = await readApicalDataFixture();
  const excelApicalData = convertApicalSpreadsheetRowsToApicalData(apicalDataToSpreadsheetRows(apicalData));
  const baseSessionState = convertDataToRaceState(
    PROFILE_EVENT_ID,
    new Date('2025-06-06T00:00:00.000Z'),
    excelApicalData,
    200000,
  );

  const baseParticipants = baseSessionState.participants as EventParticipant[];
  const baseCategories = baseSessionState.categories as EventCategory[];
  const amplifiedRecords: EventTimeRecord[] = [];

  for (let repeatIndex = 0; repeatIndex < PROFILE_REPEAT_COUNT; repeatIndex += 1) {
    const timeOffsetMs = repeatIndex * 24 * 60 * 60 * 1000;
    (baseSessionState.records as EventTimeRecord[]).forEach((record, recordIndex) => {
      if (!isCrossingRecord(record)) {
        return;
      }

      const amplifiedRecord: ParticipantPassingRecord = {
        ...(record as ParticipantPassingRecord),
        id: createTimeRecordId(`timing-profile-record-${repeatIndex}-${recordIndex}`),
        lineNumber: (recordIndex % 2) + 1,
        loopNumber: 1,
        sequence: (repeatIndex * (baseSessionState.records?.length || 0)) + record.sequence,
        sessionId: PROFILE_SESSION_ID,
        source: createTimeRecordSourceId(`timing-profile-source-${repeatIndex}`),
        time: record.time ? new Date(record.time.getTime() + timeOffsetMs) : record.time,
      };

      amplifiedRecords.push(amplifiedRecord);
    });
  }

  const categoriesById = new Map<EventCategoryId, EventCategory>(baseCategories.map((category) => [category.id, category]));
  const participantsById = new Map<EventParticipantId, EventParticipant>(baseParticipants.map((participant) => [participant.id, participant]));
  const participantLaps = new Map<EventParticipantId, ParticipantPassingRecord[]>();
  const transponderCrossings = new Map<number, ParticipantPassingRecord[]>();

  amplifiedRecords.forEach((record) => {
    if (!isCrossingRecord(record) || !record.participantId) {
      return;
    }

    const participantId = record.participantId as EventParticipantId;
    const participantRecords = participantLaps.get(participantId) || [];
    participantRecords.push(record as ParticipantPassingRecord);
    participantLaps.set(participantId, participantRecords);

    const txNo = getAutomaticIdentifier(record as ParticipantPassingRecord);
    if (txNo === undefined) {
      return;
    }

    const txRecords = transponderCrossings.get(txNo) || [];
    txRecords.push(record as ParticipantPassingRecord);
    transponderCrossings.set(txNo, txRecords);
  });

  participantLaps.forEach((records) => {
    records.sort((left, right) => (left.time?.getTime() || 0) - (right.time?.getTime() || 0));
  });

  return {
    categories: baseCategories,
    countTransponderCrossings: (txNo, untilTime) => {
      const records = transponderCrossings.get(txNo) || [];
      return untilTime
        ? records.filter((record) => (record.time?.getTime() || 0) <= untilTime.getTime()).length
        : records.length;
    },
    excludeCrossing: () => undefined,
    getCategoryById: (categoryId) => categoriesById.get(categoryId),
    getEntrantIdForParticipant: (participantId) => participantsById.get(participantId)?.entrantId,
    getFinishLineNumbers: () => [1],
    getParticipantById: (participantId) => participantsById.get(participantId),
    getParticipantLaps: (participantId) => participantLaps.get(participantId),
    getTimeRecordSourceById: () => undefined,
    getTransponderCrossings: (txNo, untilTime) => {
      const records = transponderCrossings.get(txNo) || [];
      return (untilTime
        ? records.filter((record) => (record.time?.getTime() || 0) <= untilTime.getTime())
        : records) as ReturnType<TimingProfileRaceState['getTransponderCrossings']>;
    },
    participants: baseParticipants,
    records: amplifiedRecords,
    updateCategoryDetails: () => undefined,
    updateEntrantCategory: () => undefined,
    updateParticipantCategory: () => undefined,
  };
};

const createInstrumentedRaceState = (raceState: TimingProfileRaceState): {
  getMetrics: () => Map<string, LookupMetricSummary>;
  raceState: TimingProfileRaceState;
  resetMetrics: () => void;
} => {
  const metrics = new Map<string, LookupMetricSummary>();

  const recordMetric = <Args extends unknown[], Result>(
    name: string,
    operation: (...args: Args) => Result,
  ): ((...args: Args) => Result) => {
    return (...args: Args): Result => {
      const startTime = performance.now();
      const result = operation(...args);
      const durationMs = performance.now() - startTime;
      const currentMetric = metrics.get(name) || { callCount: 0, totalDurationMs: 0 };
      currentMetric.callCount += 1;
      currentMetric.totalDurationMs += durationMs;
      metrics.set(name, currentMetric);
      return result;
    };
  };

  return {
    getMetrics: () => new Map(metrics),
    raceState: {
      ...raceState,
      countTransponderCrossings: recordMetric('countTransponderCrossings', raceState.countTransponderCrossings.bind(raceState)),
      getCategoryById: recordMetric('getCategoryById', raceState.getCategoryById.bind(raceState)),
      getEntrantIdForParticipant: recordMetric('getEntrantIdForParticipant', raceState.getEntrantIdForParticipant.bind(raceState)),
      getFinishLineNumbers: recordMetric('getFinishLineNumbers', raceState.getFinishLineNumbers?.bind(raceState) || (() => undefined)),
      getParticipantById: recordMetric('getParticipantById', raceState.getParticipantById.bind(raceState)),
      getParticipantLaps: recordMetric('getParticipantLaps', raceState.getParticipantLaps.bind(raceState)),
      getTimeRecordSourceById: recordMetric('getTimeRecordSourceById', raceState.getTimeRecordSourceById?.bind(raceState) || (() => undefined)),
      getTransponderCrossings: recordMetric('getTransponderCrossings', raceState.getTransponderCrossings.bind(raceState)),
    },
    resetMetrics: () => {
      metrics.clear();
    },
  };
};

const createProfilerCollector = (): {
  clear: () => void;
  getSummary: () => ProfileSummary;
  onRender: ProfilerOnRenderCallback;
} => {
  let samples: ProfileSample[] = [];

  return {
    clear: () => {
      samples = [];
    },
    getSummary: () => summarizeProfileSamples(samples),
    onRender: (id, phase, actualDuration, baseDuration, startTime, commitTime) => {
      samples.push({
        actualDuration,
        baseDuration,
        commitTime,
        id,
        phase,
        startTime,
      });
    },
  };
};

const clickButton = async (container: HTMLDivElement, label: string): Promise<void> => {
  const button = container.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
  expect(button).toBeTruthy();

  await act(async () => {
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const TimingProfileHarness = (props: {
  onRender: ProfilerOnRenderCallback;
  raceState: TimingProfileRaceState;
}): React.ReactElement => {
  const [activeSection, setActiveSection] = React.useState<'System' | 'Timing'>('System');
  const [selectedCategories, setSelectedCategories] = React.useState<Set<EventCategoryId>>(new Set<EventCategoryId>());
  const [selectedParticipants, setSelectedParticipants] = React.useState<Set<EventParticipantId>>(new Set<EventParticipantId>());

  const participantSelected = React.useCallback((participantIds: Set<EventParticipantId>): void => {
    setSelectedParticipants(new Set<EventParticipantId>(participantIds));
    setSelectedCategories(selectedCategoriesForParticipants(
      participantIds,
      props.raceState.getParticipantById.bind(props.raceState),
    ));
  }, [props.raceState]);

  const sessionId = PROFILE_SESSION_ID;
  const eventId = PROFILE_EVENT_ID;
  const events = [{
    categoryIds: props.raceState.categories.map((category) => category.id),
    date: '2025-06-06',
    entrantIds: props.raceState.participants.map((participant) => participant.entrantId),
    format: 'race-weekend' as const,
    id: eventId,
    name: 'T9743 Timing Profile',
    sessionIds: [sessionId],
    timeZone: 'Australia/Sydney',
  }];
  const sessions = [{
    categoryIds: props.raceState.categories.map((category) => category.id),
    eventId,
    id: sessionId,
    kind: 'race' as const,
    name: 'T9743 Feature Race',
    notes: 'Profiling session',
    scheduledStart: '2025-06-06T10:00:00.000Z',
    status: 'scheduled' as const,
  }];

  return (
    <div>
      <nav aria-label="Profile sections">
        <button aria-label="System" type="button" onClick={() => setActiveSection('System')}>System</button>
        <button aria-label="Timing" type="button" onClick={() => setActiveSection('Timing')}>Timing</button>
      </nav>
      {activeSection === 'System' ? (
        <h1>System</h1>
      ) : (
        <React.Profiler id="TimingContext" onRender={props.onRender}>
          <TimingContext
            activeSession={sessions[0]}
            categoryListSelected={(categoryIds) => setSelectedCategories(new Set<EventCategoryId>(categoryIds))}
            eventTimeZone="Australia/Sydney"
            events={events}
            onAddRecord={() => undefined}
            onAssignFlagCategory={() => undefined}
            onChangeCategory={() => undefined}
            onEditRecord={() => undefined}
            onExclude={() => undefined}
            onMarkFlagDeleted={() => undefined}
            onRemoveFlagCategory={() => undefined}
            onSelectEvent={() => undefined}
            onSelectSession={() => undefined}
            onTimeDisplayZoneModeChange={() => undefined}
            participantSelected={participantSelected}
            raceState={props.raceState}
            selectedCategories={selectedCategories}
            selectedParticipants={selectedParticipants}
            sessions={sessions}
            timeDisplayZoneMode="event"
            timingEvent={events[0]}
            timingSessionValidCategoryIds={new Set<EventCategoryId>(props.raceState.categories.map((category) => category.id))}
            timingSessionValue={sessionId}
          />
        </React.Profiler>
      )}
    </div>
  );
};

describeTimingProfile('Timing profiling harness', () => {
  useUiConsoleGuards();

  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  const renderHarness = async (raceState: TimingProfileRaceState, onRender: ProfilerOnRenderCallback): Promise<void> => {
    await act(async () => {
      root.render(<TimingProfileHarness onRender={onRender} raceState={raceState} />);
    });

    await waitForCondition(() => {
      return !!container.querySelector('button[aria-label="Timing"]') && !!container.querySelector('button[aria-label="System"]');
    }, 'Profile harness navigation did not render');
  };

  it('profiles switching from System to Timing with a large record set', async () => {
    const instrumentedState = createInstrumentedRaceState(await createTimingProfileRaceState());
    const profiler = createProfilerCollector();

    await renderHarness(instrumentedState.raceState, profiler.onRender);

    profiler.clear();
    instrumentedState.resetMetrics();
    const startTime = performance.now();
    await clickButton(container, 'Timing');
    await waitForCondition(() => (container.querySelector('h1')?.textContent || '') === 'Timing', 'Timing view did not render');
    await waitForCondition(() => container.textContent?.includes('Recent Records') || false, 'Recent records did not render');
    const elapsedMs = performance.now() - startTime;
    const summary = profiler.getSummary();
    const lookupMetrics = instrumentedState.getMetrics();

    console.info(`[timing-profile] switch-to-timing elapsedMs=${elapsedMs.toFixed(2)} totalActualDurationMs=${summary.totalActualDurationMs.toFixed(2)} maxActualDurationMs=${summary.maxActualDurationMs.toFixed(2)} samples=${summary.sampleCount} records=${instrumentedState.raceState.records.length} ${formatLookupMetrics(lookupMetrics)}`);

    expect(summary.sampleCount).toBeGreaterThan(0);
  }, 30000);

  it('profiles selecting a visible timing row with a large record set', async () => {
    const instrumentedState = createInstrumentedRaceState(await createTimingProfileRaceState());
    const profiler = createProfilerCollector();

    await renderHarness(instrumentedState.raceState, profiler.onRender);

    await clickButton(container, 'Timing');
    await waitForCondition(() => container.textContent?.includes('Recent Records') || false, 'Recent records did not render');

    const firstRecord = instrumentedState.raceState.records.find((record) => {
      if (!isCrossingRecord(record) || !record.participantId) {
        return false;
      }

      const participant = instrumentedState.raceState.getParticipantById(record.participantId);
      return participant !== undefined && getParticipantNumber(participant) !== undefined;
    });
    expect(firstRecord).toBeDefined();
    const row = container.querySelector(`tr[data-record-id="${firstRecord!.id}"]`) as HTMLTableRowElement | null;
    expect(row).toBeTruthy();

    profiler.clear();
    instrumentedState.resetMetrics();
    const startTime = performance.now();
    await act(async () => {
      row!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await waitForCondition(() => row!.className.includes('selected-row'), 'Selected row highlight did not appear');
    const elapsedMs = performance.now() - startTime;
    const summary = profiler.getSummary();
    const lookupMetrics = instrumentedState.getMetrics();

    console.info(`[timing-profile] row-select elapsedMs=${elapsedMs.toFixed(2)} totalActualDurationMs=${summary.totalActualDurationMs.toFixed(2)} maxActualDurationMs=${summary.maxActualDurationMs.toFixed(2)} samples=${summary.sampleCount} recordId=${firstRecord!.id} ${formatLookupMetrics(lookupMetrics)}`);

    expect(summary.sampleCount).toBeGreaterThan(0);
  }, 30000);

  it('profiles opening the row context menu with a large record set', async () => {
    const instrumentedState = createInstrumentedRaceState(await createTimingProfileRaceState());
    const profiler = createProfilerCollector();

    await renderHarness(instrumentedState.raceState, profiler.onRender);

    await clickButton(container, 'Timing');
    await waitForCondition(() => container.textContent?.includes('Recent Records') || false, 'Recent records did not render');

    const firstRecord = instrumentedState.raceState.records.find((record) => isCrossingRecord(record) && record.participantId);
    expect(firstRecord).toBeDefined();
    const row = container.querySelector(`tr[data-record-id="${firstRecord!.id}"]`) as HTMLTableRowElement | null;
    expect(row).toBeTruthy();

    profiler.clear();
    instrumentedState.resetMetrics();
    const startTime = performance.now();
    await act(async () => {
      row!.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 120,
        clientY: 120,
      }));
    });
    await waitForCondition(() => Array.from(document.querySelectorAll('li[role="menuitem"]')).length > 0, 'Context menu did not open');
    const elapsedMs = performance.now() - startTime;
    const summary = profiler.getSummary();
    const lookupMetrics = instrumentedState.getMetrics();

    console.info(`[timing-profile] row-context-menu elapsedMs=${elapsedMs.toFixed(2)} totalActualDurationMs=${summary.totalActualDurationMs.toFixed(2)} maxActualDurationMs=${summary.maxActualDurationMs.toFixed(2)} samples=${summary.sampleCount} recordId=${firstRecord!.id} ${formatLookupMetrics(lookupMetrics)}`);

    expect(summary.sampleCount).toBeGreaterThan(0);
  }, 30000);
});
