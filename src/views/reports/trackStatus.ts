import { isFlagRecord } from '../../controllers/flag.js';
import { getPassingLineNumber } from '../../controllers/laps.js';
import { isCrossingRecord } from '../../controllers/timerecord.js';
import type { RaceState, RaceStateLookup } from '../../model/racestate.js';
import { EVENT_FLAG_RETRACTED, EVENT_SESSION_END } from '../../model/timerecord.js';
import type { TrackPlaybackIndex } from './trackPlayback.js';

export type TrackStatus = 'green' | 'yellow' | 'white' | 'black';

export interface TrackStatusSegment {
  endTime: number;
  startTime: number;
  status: TrackStatus;
}

const isRetracted = (record: { deleted?: boolean; recordType: number }): boolean => (
  record.deleted === true || (record.recordType & EVENT_FLAG_RETRACTED) !== 0
);

const isChequered = (record: { recordType: number; flagType?: string }): boolean => (
  (record.recordType & EVENT_SESSION_END) !== 0 || ['chequered', 'finish'].includes(record.flagType?.toLowerCase() || '')
);

const mergeAdjacentSegments = (segments: TrackStatusSegment[]): TrackStatusSegment[] => segments.reduce<TrackStatusSegment[]>((merged, segment) => {
  if (segment.endTime <= segment.startTime) {
    return merged;
  }
  const previous = merged.at(-1);
  if (previous && previous.status === segment.status && previous.endTime === segment.startTime) {
    previous.endTime = segment.endTime;
  } else {
    merged.push({ ...segment });
  }
  return merged;
}, []);

export const createTrackStatusSegments = (
  raceState: RaceState & RaceStateLookup,
  playbackIndex: TrackPlaybackIndex,
): TrackStatusSegment[] => {
  const startTime = playbackIndex.startTime;
  const endTime = playbackIndex.endTime;
  if (endTime <= startTime) {
    return [{ endTime, startTime, status: 'green' }];
  }

  const records = raceState.records
    .filter((record) => record.time !== undefined)
    .sort((left, right) => left.time!.getTime() - right.time!.getTime());
  const flags = records.filter(isFlagRecord);
  const chequered = flags.find(isChequered);
  const chequeredTime = chequered?.time?.getTime();
  let blackTime: number | undefined;
  if (chequeredTime !== undefined) {
    const leader = playbackIndex.seek(chequeredTime).entrants.find((entrant) => !entrant.didNotFinish && entrant.position === 1);
    const finishLines = raceState.getFinishLineNumbers?.() || [];
    const leaderCrossings = leader
      ? records.filter((record) => (
        isCrossingRecord(record) && record.participantId &&
        (raceState.getEntryIdForParticipant?.(record.participantId) || record.entrantId) === leader.entrantId &&
        record.time!.getTime() > chequeredTime &&
        (finishLines.length === 0 || finishLines.includes(getPassingLineNumber(record) || -1))
      ))
      : [];
    blackTime = Math.min(chequeredTime + 6 * 60 * 1000, leaderCrossings[1]?.time?.getTime() || Number.POSITIVE_INFINITY);
    if (!Number.isFinite(blackTime)) {
      blackTime = chequeredTime + 6 * 60 * 1000;
    }
  }

  const boundaries = new Map<number, TrackStatus>();
  boundaries.set(startTime, 'green');
  let status: TrackStatus = 'green';
  flags.forEach((flag) => {
    const time = flag.time?.getTime();
    if (time === undefined || time < startTime || time > endTime) {
      return;
    }
    const type = flag.flagType.toLowerCase();
    if (isRetracted(flag)) {
      if (type === 'yellow') {
        status = 'green';
        boundaries.set(time, status);
      }
      return;
    }
    if (isChequered(flag)) {
      status = 'white';
    } else if (type === 'yellow') {
      status = 'yellow';
    } else if (type === 'green' && (flag as { indicatesRaceStart?: boolean }).indicatesRaceStart === false) {
      status = 'green';
    } else {
      return;
    }
    boundaries.set(time, status);
  });
  if (chequeredTime !== undefined && blackTime !== undefined && blackTime >= startTime && blackTime <= endTime) {
    boundaries.set(blackTime, 'black');
  }

  const sortedBoundaries = Array.from(boundaries.entries()).sort((left, right) => left[0] - right[0]);
  return mergeAdjacentSegments(sortedBoundaries.map(([time, nextStatus], index) => ({
    endTime: sortedBoundaries[index + 1]?.[0] || endTime,
    startTime: time,
    status: nextStatus,
  })));
};
