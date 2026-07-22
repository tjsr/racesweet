import { getMissingLapCompletionEvidence, getSourceLapCompletion, getTimingLineKey, isLapCompletionPassing } from './laps.js';
import { getParticipantEntryId } from '../model/entry.js';
import { isCrossingRecord } from './timerecord.js';
import type { EventParticipantId } from '../model/eventparticipant.js';
import type { RaceStateLookup } from '../model/racestate.js';
import {
  isPassingExcluded,
  isPassingValid,
  type EventTimeRecord,
  type ParticipantPassingRecord,
  type TimeRecordId,
} from '../model/timerecord.js';

export const MISSING_CROSSING_LAP_TIME_RATIO = 1.9;
export const LIKELY_MISSING_CROSSING_LAP_TIME_RATIO = 1.98;

export type MissingCrossingIndicator = 'likely' | 'possible';

const average = (values: number[]): number | undefined => {
  return values.length > 0
    ? values.reduce((total: number, value: number): number => total + value, 0) / values.length
    : undefined;
};

const getEntrantKey = (participantId: EventParticipantId, raceStateLookup: RaceStateLookup): string => {
  const participant = raceStateLookup.getParticipantById(participantId);
  return raceStateLookup.getEntryIdForParticipant?.(participantId)?.toString() || (participant ? getParticipantEntryId(participant).toString() : participantId.toString());
};

const isUsableLapCompletion = (
  record: EventTimeRecord,
  raceStateLookup: RaceStateLookup
): record is ParticipantPassingRecord => {
  return isCrossingRecord(record) &&
    record.participantId !== undefined &&
    record.participantId !== null &&
    record.time !== undefined &&
    typeof record.lapTime === 'number' &&
    record.lapTime > 0 &&
    isPassingValid(record) &&
    !isPassingExcluded(record) &&
    isLapCompletionPassing(
      record,
      raceStateLookup.getFinishLineNumbers?.(),
      (passing) => getSourceLapCompletion(passing, raceStateLookup.getTimeRecordSourceById?.(passing.source)),
    );
};

const getEntrantLapCompletions = (
  records: EventTimeRecord[],
  participantId: EventParticipantId,
  raceStateLookup: RaceStateLookup
): ParticipantPassingRecord[] => {
  const entrantKey = getEntrantKey(participantId, raceStateLookup);
  return records
    .filter((record): record is ParticipantPassingRecord => isUsableLapCompletion(record, raceStateLookup))
    .filter((record: ParticipantPassingRecord): boolean => (
      getEntrantKey(record.participantId!, raceStateLookup) === entrantKey
    ))
    .sort((left: ParticipantPassingRecord, right: ParticipantPassingRecord): number => (
      left.time!.getTime() - right.time!.getTime()
    ));
};

export const isPotentialMissingCrossing = (
  record: ParticipantPassingRecord,
  records: EventTimeRecord[],
  raceStateLookup: RaceStateLookup
): boolean => {
  return getPotentialMissingCrossingIndicators(records, raceStateLookup).has(record.id);
};

export const getPotentialMissingCrossingIndicators = (
  records: EventTimeRecord[],
  raceStateLookup: RaceStateLookup
): Map<TimeRecordId, MissingCrossingIndicator> => {
  const usableRecords = records.filter((record): record is ParticipantPassingRecord => (
    isUsableLapCompletion(record, raceStateLookup)
  ));
  const fastestLapTimeByEntrant = new Map<string, number>();
  usableRecords.forEach((record: ParticipantPassingRecord): void => {
    const entrantKey = getEntrantKey(record.participantId!, raceStateLookup);
    const fastestLapTime = fastestLapTimeByEntrant.get(entrantKey);
    if (fastestLapTime === undefined || record.lapTime! < fastestLapTime) {
      fastestLapTimeByEntrant.set(entrantKey, record.lapTime!);
    }
  });

  const passingsByEntrant = new Map<string, ParticipantPassingRecord[]>();
  records
    .filter((record): record is ParticipantPassingRecord => isCrossingRecord(record) && !!record.participantId && !!record.time)
    .forEach((record) => {
      const entrantKey = getEntrantKey(record.participantId!, raceStateLookup);
      passingsByEntrant.set(entrantKey, [...(passingsByEntrant.get(entrantKey) || []), record]);
    });
  const evidenceIndicators = new Map<TimeRecordId, MissingCrossingIndicator>();
  passingsByEntrant.forEach((passings) => {
    getMissingLapCompletionEvidence(
      passings,
      0,
      raceStateLookup.getFinishLineNumbers?.(),
      (passing) => getSourceLapCompletion(passing, raceStateLookup.getTimeRecordSourceById?.(passing.source)),
    ).forEach((evidence) => {
      evidenceIndicators.set(evidence.nextFinishRecord.id, 'likely');
    });
  });

  const durationIndicators = new Map(usableRecords.flatMap((record: ParticipantPassingRecord): [TimeRecordId, MissingCrossingIndicator][] => {
    const fastestLapTime = fastestLapTimeByEntrant.get(getEntrantKey(record.participantId!, raceStateLookup));
    if (fastestLapTime === undefined || record.lapTime! <= fastestLapTime * MISSING_CROSSING_LAP_TIME_RATIO) {
      return [];
    }
    const indicator: MissingCrossingIndicator = (
      record.lapTime! < fastestLapTime * LIKELY_MISSING_CROSSING_LAP_TIME_RATIO
        ? 'possible'
        : 'likely'
    );
    return [[record.id, indicator]];
  }));
  return new Map([...durationIndicators, ...evidenceIndicators]);
};

export const getPotentialMissingCrossingIds = (
  records: EventTimeRecord[],
  raceStateLookup: RaceStateLookup
): Set<TimeRecordId> => {
  return new Set(getPotentialMissingCrossingIndicators(records, raceStateLookup).keys());
};

const getClosestCrossing = (
  crossings: ParticipantPassingRecord[],
  time: number,
  maximumDistance: number
): ParticipantPassingRecord | undefined => {
  return crossings.reduce<ParticipantPassingRecord | undefined>((closest, crossing) => {
    const distance = Math.abs(crossing.time!.getTime() - time);
    if (distance > maximumDistance) {
      return closest;
    }
    return !closest || distance < Math.abs(closest.time!.getTime() - time) ? crossing : closest;
  }, undefined);
};

const getProjectedTimeFromNeighbour = (
  neighbour: ParticipantPassingRecord,
  previousEntrantCrossings: ParticipantPassingRecord[],
  lineCrossings: ParticipantPassingRecord[],
  averageLapTime: number
): number | undefined => {
  if (!neighbour.participantId) {
    return undefined;
  }
  const neighbourCrossings = lineCrossings.filter((crossing: ParticipantPassingRecord): boolean => (
    crossing.participantId === neighbour.participantId
  ));
  const historicalDeltas = previousEntrantCrossings.flatMap((entrantCrossing: ParticipantPassingRecord): number[] => {
    const closest = getClosestCrossing(neighbourCrossings, entrantCrossing.time!.getTime(), averageLapTime / 2);
    return closest ? [entrantCrossing.time!.getTime() - closest.time!.getTime()] : [];
  });
  const averageDelta = average(historicalDeltas);
  return averageDelta === undefined ? undefined : neighbour.time!.getTime() + averageDelta;
};

export const estimateMissingCrossingTime = (
  record: ParticipantPassingRecord,
  records: EventTimeRecord[],
  raceStateLookup: RaceStateLookup
): Date | undefined => {
  if (!record.participantId || !record.time || !isPotentialMissingCrossing(record, records, raceStateLookup)) {
    return undefined;
  }

  const entrantCrossings = getEntrantLapCompletions(records, record.participantId, raceStateLookup);
  const previousEntrantCrossings = entrantCrossings
    .filter((candidate: ParticipantPassingRecord): boolean => candidate.time!.getTime() < record.time!.getTime())
    .slice(-3);
  const averageLapTime = average(previousEntrantCrossings.map((candidate: ParticipantPassingRecord): number => candidate.lapTime!));
  if (averageLapTime === undefined) {
    return undefined;
  }

  const baselineTime = record.time.getTime() - averageLapTime;
  const finishLineNumbers = raceStateLookup.getFinishLineNumbers?.();
  const timingLineKey = getTimingLineKey(record, finishLineNumbers);
  const targetEntrantKey = getEntrantKey(record.participantId, raceStateLookup);
  const lineCrossings = records
    .filter((candidate): candidate is ParticipantPassingRecord => (
      isCrossingRecord(candidate) && !!candidate.participantId && !!candidate.time &&
      !isPassingExcluded(candidate) && getTimingLineKey(candidate, finishLineNumbers) === timingLineKey
    ))
    .sort((left: ParticipantPassingRecord, right: ParticipantPassingRecord): number => left.time!.getTime() - right.time!.getTime());
  const otherEntrantCrossings = lineCrossings.filter((candidate: ParticipantPassingRecord): boolean => (
    getEntrantKey(candidate.participantId!, raceStateLookup) !== targetEntrantKey
  ));
  const ahead = [...otherEntrantCrossings].reverse().find((candidate: ParticipantPassingRecord): boolean => (
    candidate.time!.getTime() <= baselineTime
  ));
  const behind = otherEntrantCrossings.find((candidate: ParticipantPassingRecord): boolean => (
    candidate.time!.getTime() >= baselineTime
  ));
  const projectedTimes = [ahead, behind].flatMap((neighbour: ParticipantPassingRecord | undefined): number[] => {
    if (!neighbour) {
      return [];
    }
    const projected = getProjectedTimeFromNeighbour(
      neighbour,
      previousEntrantCrossings,
      lineCrossings,
      averageLapTime
    );
    return projected === undefined ? [] : [projected];
  });
  const estimatedTime = average([baselineTime, ...projectedTimes]) ?? baselineTime;
  const previousTime = previousEntrantCrossings.at(-1)?.time?.getTime();
  const lowerBound = previousTime === undefined ? Number.NEGATIVE_INFINITY : previousTime + 1;
  const upperBound = record.time.getTime() - 1;
  return new Date(Math.min(upperBound, Math.max(lowerBound, Math.round(estimatedTime))));
};
