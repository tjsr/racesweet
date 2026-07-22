import type { EventTrackTimingLine } from '../../catalog/eventCatalog.js';
import { getPassingLineNumber, getSourceLapCompletion, isCountedLapPassing } from '../../processing/laps.js';
import { isCrossingRecord } from '../../processing/timerecord.js';
import type { EventEntrantId } from '../../model/entrant.js';
import { getParticipantEntryId } from '../../model/entry.js';
import type { RaceState, RaceStateLookup } from '../../model/racestate.js';
import type { ParticipantPassingRecord } from '../../model/timerecord.js';

export interface TrackPlaybackEntrantState {
  didNotFinish: boolean;
  entrantId: EventEntrantId;
  fastestLap?: number;
  lastLapTime?: number;
  lapCount: number;
  position: number;
  progress: number;
  raceElapsedTime?: number;
}

const DNF_INACTIVITY_MILLISECONDS = 3 * 60 * 1000;

export interface TrackPlaybackSnapshot {
  entrants: TrackPlaybackEntrantState[];
  time: number;
}

export interface TrackPlaybackIndex {
  endTime: number;
  seek: (time: number) => TrackPlaybackSnapshot;
  startTime: number;
}

interface PreparedPassing {
  entrantId: EventEntrantId;
  entrantIndex: number;
  passing: ParticipantPassingRecord;
  progress: number;
}

interface MutableEntrantState {
  fastestLap?: number;
  lastLapTime?: number;
  lapCount: number;
  passingIndex: number;
  raceElapsedTime?: number;
}

const comparePassingTime = (left: ParticipantPassingRecord, right: ParticipantPassingRecord): number => {
  const timeDifference = (left.time?.getTime() || 0) - (right.time?.getTime() || 0);
  return timeDifference !== 0
    ? timeDifference
    : (left.timeTenthOfMillisecond || 0) - (right.timeTenthOfMillisecond || 0);
};

const interpolateProgress = (
  previous: PreparedPassing | undefined,
  next: PreparedPassing | undefined,
  time: number,
): number => {
  if (!previous) {
    return next?.progress || 0;
  }
  if (!next || !previous.passing.time || !next.passing.time) {
    return previous.progress;
  }
  const previousTime = previous.passing.time.getTime();
  const nextTime = next.passing.time.getTime();
  if (nextTime <= previousTime) {
    return previous.progress;
  }
  const timeRatio = Math.max(0, Math.min(1, (time - previousTime) / (nextTime - previousTime)));
  const nextUnwrappedProgress = next.progress <= previous.progress ? next.progress + 1 : next.progress;
  return previous.progress + (nextUnwrappedProgress - previous.progress) * timeRatio;
};

export const createTrackPlaybackIndex = (
  raceState: RaceState & RaceStateLookup,
  configuredTimingLines: EventTrackTimingLine[],
): TrackPlaybackIndex => {
  const recordsWithTimes = raceState.records.filter((record) => record.time !== undefined);
  const startTime = recordsWithTimes.length > 0
    ? Math.min(...recordsWithTimes.map((record) => record.time!.getTime()))
    : Date.now();
  const endTime = Math.max(...recordsWithTimes.map((record) => record.time!.getTime()), startTime);
  const configuredProgressByLine = new Map(
    configuredTimingLines.map((line) => [line.lineNumber, Math.max(0, Math.min(1, line.progress))]),
  );
  const observedLineNumbers = Array.from(new Set(recordsWithTimes
    .filter(isCrossingRecord)
    .map((record) => getPassingLineNumber(record))
    .filter((lineNumber): lineNumber is number => lineNumber !== undefined)))
    .sort((left, right) => left - right);
  const fallbackProgressByLine = new Map(observedLineNumbers.map((lineNumber, index) => (
    [lineNumber, observedLineNumbers.length <= 1 ? 0 : index / observedLineNumbers.length]
  )));
  const passingsByEntrant = new Map<EventEntrantId, PreparedPassing[]>();

  recordsWithTimes
    .filter(isCrossingRecord)
    .sort(comparePassingTime)
    .forEach((passing) => {
      if (!passing.participantId) {
        return;
      }
      const participant = raceState.getParticipantById(passing.participantId);
      if (!participant) {
        return;
      }
      const entrantId = raceState.getEntryIdForParticipant?.(participant.id) || getParticipantEntryId(participant);
      const entrantPassings = passingsByEntrant.get(entrantId) || [];
      const lineNumber = getPassingLineNumber(passing);
      entrantPassings.push({
        entrantId,
        entrantIndex: entrantPassings.length,
        passing,
        progress: lineNumber === undefined
          ? 0
          : configuredProgressByLine.get(lineNumber) ?? fallbackProgressByLine.get(lineNumber) ?? 0,
      });
      passingsByEntrant.set(entrantId, entrantPassings);
    });

  const preparedPassings = Array.from(passingsByEntrant.values()).flat().sort((left, right) => (
    comparePassingTime(left.passing, right.passing)
  ));
  const mutableStateByEntrant = new Map<EventEntrantId, MutableEntrantState>();
  let appliedRecordCursor = -1;
  let currentTime = startTime;

  const reset = (): void => {
    mutableStateByEntrant.clear();
    passingsByEntrant.forEach((_passings, entrantId) => {
      mutableStateByEntrant.set(entrantId, { lapCount: 0, passingIndex: -1 });
    });
    appliedRecordCursor = -1;
  };

  const applyPassing = (prepared: PreparedPassing): void => {
    const state = mutableStateByEntrant.get(prepared.entrantId) || { lapCount: 0, passingIndex: -1 };
    state.passingIndex = prepared.entrantIndex;
    const passing = prepared.passing;
    const countedLap = isCountedLapPassing(passing, raceState.getFinishLineNumbers?.(), (candidate) => (
      getSourceLapCompletion(candidate, raceState.getTimeRecordSourceById?.(candidate.source))
    ));
    if (countedLap) {
      state.lapCount = Math.max(state.lapCount, passing.lapNo || state.lapCount + 1);
      state.lastLapTime = passing.lapTime || undefined;
      state.raceElapsedTime = passing.elapsedTime || undefined;
      if (typeof passing.lapTime === 'number' && passing.lapTime > 0) {
        state.fastestLap = state.fastestLap === undefined
          ? passing.lapTime
          : Math.min(state.fastestLap, passing.lapTime);
      }
    }
    mutableStateByEntrant.set(prepared.entrantId, state);
  };

  const seek = (requestedTime: number): TrackPlaybackSnapshot => {
    const time = Math.max(startTime, Math.min(endTime, requestedTime));
    if (time < currentTime) {
      reset();
    }
    while (appliedRecordCursor + 1 < preparedPassings.length) {
      const nextPrepared = preparedPassings[appliedRecordCursor + 1]!;
      if ((nextPrepared.passing.time?.getTime() || 0) > time) {
        break;
      }
      appliedRecordCursor += 1;
      applyPassing(nextPrepared);
    }
    currentTime = time;

    let activePosition = 0;
    const entrants = Array.from(passingsByEntrant.entries()).map(([entrantId, passings]) => {
      const state = mutableStateByEntrant.get(entrantId) || { lapCount: 0, passingIndex: -1 };
      const previous = state.passingIndex >= 0 ? passings[state.passingIndex] : undefined;
      const next = passings[state.passingIndex + 1];
      const lastPassingTime = previous?.passing.time?.getTime();
      return {
        didNotFinish: lastPassingTime !== undefined && next === undefined && time - lastPassingTime > DNF_INACTIVITY_MILLISECONDS,
        entrantId,
        fastestLap: state.fastestLap,
        lastLapTime: state.lastLapTime,
        lapCount: state.lapCount,
        position: 0,
        progress: interpolateProgress(previous, next, time),
        raceElapsedTime: state.raceElapsedTime,
      };
    }).sort((left, right) => {
      if (left.lapCount !== right.lapCount) {
        return right.lapCount - left.lapCount;
      }
      return (left.raceElapsedTime ?? Number.POSITIVE_INFINITY) -
        (right.raceElapsedTime ?? Number.POSITIVE_INFINITY);
    }).map((entrant) => ({
      ...entrant,
      position: entrant.didNotFinish ? 0 : ++activePosition,
    }));

    return { entrants, time };
  };

  reset();
  return { endTime, seek, startTime };
};
