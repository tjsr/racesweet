import { flagAppliesToCategory, isFlagRecord } from './flag.js';
import type { EventCategoryId } from '../model/eventcategory.js';
import type { FlagRecord } from '../model/flag.js';
import type { ParticipantPassingRecord, TimeRecord } from '../model/timerecord.js';
import { EVENT_FLAG_RETRACTED } from '../model/timerecord.js';

export interface YellowFlagPeriodParticipant {
  laps: ParticipantPassingRecord[];
  name: string;
}

export interface YellowFlagPeriod {
  duration?: number;
  fromLap?: number;
  fromTime?: Date;
  leaderAtFlag?: string;
  untilLap?: number;
  untilTime?: Date;
}

const recordTime = (record: TimeRecord): number | undefined => record.time?.getTime();

const isRetracted = (flag: FlagRecord): boolean => flag.deleted === true || (flag.recordType & EVENT_FLAG_RETRACTED) !== 0;

const leaderAt = (participants: YellowFlagPeriodParticipant[], time: Date | undefined): { lap?: number; name?: string } => {
  const timestamp = time?.getTime();
  if (timestamp === undefined) {
    return {};
  }

  const candidates = participants.flatMap((participant) => participant.laps
    .filter((lap) => lap.isValid !== false && lap.isExcluded !== true && typeof lap.lapNo === 'number' && (lap.time?.getTime() || 0) <= timestamp)
    .map((lap) => ({ lap, name: participant.name })));
  candidates.sort((left, right) => {
    if (left.lap.lapNo !== right.lap.lapNo) {
      return (right.lap.lapNo || 0) - (left.lap.lapNo || 0);
    }
    return (left.lap.time?.getTime() || 0) - (right.lap.time?.getTime() || 0);
  });
  const leader = candidates[0];
  return leader ? { lap: leader.lap.lapNo || undefined, name: leader.name } : {};
};

export const calculateYellowFlagPeriods = (
  records: TimeRecord[],
  participants: YellowFlagPeriodParticipant[],
  categoryId?: EventCategoryId,
): YellowFlagPeriod[] => {
  const flags = records
    .filter((record): record is FlagRecord => isFlagRecord(record))
    .filter((flag) => flagAppliesToCategory(flag, categoryId))
    .filter((flag) => flag.flagType.toLowerCase() === 'yellow' || flag.flagType.toLowerCase() === 'green')
    .filter((flag) => recordTime(flag) !== undefined)
    .sort((left, right) => (recordTime(left) || 0) - (recordTime(right) || 0));
  const periods: YellowFlagPeriod[] = [];
  let open: { flag: FlagRecord; from: YellowFlagPeriod } | undefined;

  flags.forEach((flag) => {
    const isYellow = flag.flagType.toLowerCase() === 'yellow';
    const isRemoval = isYellow ? isRetracted(flag) : (flag as FlagRecord & { indicatesRaceStart?: boolean }).indicatesRaceStart === false;
    if (isYellow && !isRemoval) {
      if (open) {
        periods.push(open.from);
      }
      const leader = leaderAt(participants, flag.time);
      open = {
        flag,
        from: { fromLap: leader.lap, fromTime: flag.time, leaderAtFlag: leader.name },
      };
      return;
    }
    if (isRemoval && open) {
      const leader = leaderAt(participants, flag.time);
      const startTime = recordTime(open.flag);
      const endTime = recordTime(flag);
      open.from.untilLap = leader.lap;
      open.from.untilTime = flag.time;
      open.from.duration = startTime !== undefined && endTime !== undefined ? Math.max(0, endTime - startTime) : undefined;
      periods.push(open.from);
      open = undefined;
    }
  });

  if (open) {
    periods.push(open.from);
  }
  return periods;
};
