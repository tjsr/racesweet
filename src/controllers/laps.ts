import { elapsedTimeMilliseconds, millisecondsToTime } from "../app/utils/timeutils.js";
import type { EventSessionKind } from "../catalog/eventCatalog.js";
import type { EventParticipant, EventParticipantId } from "../model/eventparticipant.js";
import type { FlagRecord, GreenFlagRecord } from "../model/flag.js";
import type { CrossingUnrelatedReasonCode, ParticipantPassingRecord, TimeRecord } from "../model/timerecord.js";
import { EventFlagsError, NoStartFlagError, ParticipantStartFlagError, StartFlagHasNoTimeError } from "../validators/errors.js";
import { getCategoryFlags, getFlagEvents, getOrCacheGreenFlagForCategory } from "./flag.js";
import { calculateParticipantElapsedTimes, getParticipantNumber, getParticipantTransponders, getPassingsForParticipant } from "./participant.js";
import { getTimeRecordIdentifier, isRecordAfterStart } from "./timerecord.js";

import type { EventEntrantId } from "../model/entrant.js";
import type { EventCategoryId } from "../model/eventcategory.js";
import { CROSSING_FLAG_LAP_UNDER_MINIMUM, CROSSING_FLAG_NON_LAP_COMPLETION, CROSSING_UNRELATED_LAP_UNDER_MINIMUM, CROSSING_UNRELATED_NON_LAP_COMPLETION, CROSSING_UNRELATED_SESSION_CATEGORY, EVENT_SESSION_END } from "../model/timerecord.js";
import { warn } from "../utils.js";
import { setCategoryStartForPassings } from "./category.js";
import { entrantHasAnyTx } from "./participantMatch.js";
import { compareByTime } from './timerecord.js';

const MINIMUM_LAP_TIME_SECONDS = 300;
const DEFAULT_FINISH_LINE_NUMBERS = [1];
const SESSION_CATEGORY_UNRELATED_REASON = 'Participant category is not assigned to this session.';

const isRaceSessionKind = (sessionKind: EventSessionKind | undefined): boolean => {
  return sessionKind === undefined || sessionKind === 'race';
};

const millisecondsToFourDecimalTime = (milliseconds: number): string => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const fractional = Math.floor(milliseconds % 1000) * 10;
  const secondsText = `${String(seconds).padStart(2, '0')}.${String(fractional).padStart(4, '0')}`;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${secondsText}`
    : `${minutes}:${secondsText}`;
};

export const getLapUnderMinimumReason = (minimumLapTimeMilliseconds: number): string => {
  return `Lap time is below minimum of ${millisecondsToFourDecimalTime(minimumLapTimeMilliseconds)}.`;
};

const setPassingUnrelatedReason = (
  passing: ParticipantPassingRecord,
  reasonCode: CrossingUnrelatedReasonCode | undefined,
  reason: string | undefined
): void => {
  if (reasonCode === undefined) {
    passing.unrelatedReasonCode = undefined;
    passing.unrelatedReason = undefined;
    return;
  }

  passing.unrelatedReasonCode = reasonCode;
  passing.unrelatedReason = reason;
};

const setPassingLapUnderMinimum = (
  passing: ParticipantPassingRecord,
  minimumLapTimeMilliseconds: number
): void => {
  passing.infoFlags = (passing.infoFlags || 0) | CROSSING_FLAG_LAP_UNDER_MINIMUM;
  setPassingUnrelatedReason(
    passing,
    CROSSING_UNRELATED_LAP_UNDER_MINIMUM,
    getLapUnderMinimumReason(minimumLapTimeMilliseconds)
  );
};

const clearCalculatedUnrelatedReason = (passing: ParticipantPassingRecord): void => {
  passing.infoFlags = (passing.infoFlags || 0) & ~CROSSING_FLAG_LAP_UNDER_MINIMUM & ~CROSSING_FLAG_NON_LAP_COMPLETION;
  if (
    passing.unrelatedReasonCode === CROSSING_UNRELATED_LAP_UNDER_MINIMUM ||
    passing.unrelatedReasonCode === CROSSING_UNRELATED_NON_LAP_COMPLETION ||
    passing.unrelatedReasonCode === CROSSING_UNRELATED_SESSION_CATEGORY
  ) {
    setPassingUnrelatedReason(passing, undefined, undefined);
  }
};

const isParticipantAssignedToSession = (
  participant: EventParticipant,
  sessionValidCategoryIds: Set<EventCategoryId> | undefined
): boolean => {
  if (!sessionValidCategoryIds || sessionValidCategoryIds.size === 0) {
    return true;
  }

  return !!participant.categoryId && sessionValidCategoryIds.has(participant.categoryId);
};

const excludeParticipantPassingsForSessionCategory = (
  participantPassings: ParticipantPassingRecord[]
): void => {
  participantPassings.forEach((passing) => {
    resetPassingLapState(passing);
    setPassingUnrelatedReason(
      passing,
      CROSSING_UNRELATED_SESSION_CATEGORY,
      SESSION_CATEGORY_UNRELATED_REASON
    );
  });
};

const isLapCompletionPassing = (passing: ParticipantPassingRecord): boolean => passing.isLapCompletion !== false;

export const normalizeFinishLineNumbers = (finishLineNumbers: number[] | undefined): number[] => {
  const normalizedNumbers = Array.from(new Set(
    (finishLineNumbers || DEFAULT_FINISH_LINE_NUMBERS)
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
  ));
  return normalizedNumbers.length > 0 ? normalizedNumbers : [...DEFAULT_FINISH_LINE_NUMBERS];
};

const getPositiveInteger = (value: number | string | undefined): number | undefined => {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : undefined;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
};

export const getPassingLineNumber = (passing: ParticipantPassingRecord): number | undefined => {
  return getPositiveInteger(passing.lineNumber);
};

export const getPassingLoopNumber = (passing: ParticipantPassingRecord): number | undefined => {
  return getPositiveInteger(passing.loopNumber);
};

export const isFinishLinePassing = (
  passing: ParticipantPassingRecord,
  finishLineNumbers: number[] | undefined
): boolean => {
  const lineNumber = getPassingLineNumber(passing);
  if (lineNumber === undefined) {
    return true;
  }

  return normalizeFinishLineNumbers(finishLineNumbers).includes(lineNumber);
};

export const getTimingLineKey = (
  passing: ParticipantPassingRecord,
  finishLineNumbers: number[] | undefined
): string => {
  return isFinishLinePassing(passing, finishLineNumbers)
    ? 'finish'
    : `line:${getPassingLineNumber(passing)?.toString() || 'unknown'}`;
};

const resetPassingLapState = (passing: ParticipantPassingRecord): void => {
  passing.elapsedTime = undefined;
  passing.isExcluded = true;
  passing.isValid = false;
  passing.lapNo = undefined;
  passing.lapTime = undefined;
  passing.participantStartRecordId = undefined;
  passing.startingLapRecordId = undefined;
  clearCalculatedUnrelatedReason(passing);
};

const keepManuallyExcludedPassingOutOfResults = (passing: ParticipantPassingRecord): boolean => {
  if (!passing.isManuallyExcluded) {
    return false;
  }

  passing.elapsedTime = undefined;
  passing.isExcluded = true;
  passing.isValid = false;
  passing.lapNo = undefined;
  passing.lapTime = undefined;
  passing.participantStartRecordId = undefined;
  passing.startingLapRecordId = undefined;
  clearCalculatedUnrelatedReason(passing);
  return true;
};

export const validTimeAfterLastLap = (
  passing: ParticipantPassingRecord,
  prevPassing: ParticipantPassingRecord | undefined
): number | undefined => {
  if (!prevPassing || prevPassing.time === undefined) {
    return undefined;
  }
  if (!passing?.time) {
    if (passing) {
      warn(`Lap ${passing.id} has no time`);
    } else {
      warn(validTimeAfterLastLap.name, 'lap is undefined');
    }
    return undefined;
  }

  let lapTime: number | undefined;

  if (prevPassing?.time && passing.time?.getTime() > prevPassing.time.getTime()) {
    lapTime = elapsedTimeMilliseconds(prevPassing.time, passing.time);
  } else {
    lapTime = undefined;
  }
  return lapTime;
};

export const processParticipantLaps = (
  participant: EventParticipant,
  participantPassings: ParticipantPassingRecord[],
  participantCategoryStartFlag: GreenFlagRecord,
  minimumLapTimeMilliseconds: number = MINIMUM_LAP_TIME_SECONDS * 1000, // Default to 60 seconds if not provided
  sessionKind: EventSessionKind | undefined = 'race',
  finishLineNumbers: number[] | undefined = DEFAULT_FINISH_LINE_NUMBERS
): void => {
  validateParticipantStartFlag(participantCategoryStartFlag, participant);

  setCategoryStartForPassings(participantCategoryStartFlag.id, participantPassings);
  calculateParticipantElapsedTimes(participantCategoryStartFlag, participantPassings);
  calculateParticipantLapTimes(
    participantCategoryStartFlag,
    participantPassings,
    participant,
    minimumLapTimeMilliseconds,
    sessionKind,
    finishLineNumbers
  );
};

export const processAllParticipantLaps = (
  allTimeRecords: TimeRecord[],
  eventParticipants: Map<EventParticipantId, EventParticipant>,
  minimumLapTimeMilliseconds: number = MINIMUM_LAP_TIME_SECONDS * 1000, // Default to 60 seconds if not provided
  silenceWarnings: boolean = false,
  sessionKind: EventSessionKind | undefined = 'race',
  finishLineNumbers: number[] | undefined = DEFAULT_FINISH_LINE_NUMBERS,
  sessionValidCategoryIds: Set<EventCategoryId> | undefined = undefined
): Map<EventParticipantId, ParticipantPassingRecord[]> => {
  const participantTimesMap = new Map<EventParticipantId, ParticipantPassingRecord[]>();
  const entrantParticipantMap = new Map<EventEntrantId, EventParticipant[]>();
  const entrantPassingsMap = new Map<EventEntrantId, ParticipantPassingRecord[]>();
  const eventFlags: FlagRecord[] = getFlagEvents(allTimeRecords);

  if (!silenceWarnings && (!eventFlags || eventFlags.length === 0)) {
    console.warn(processAllParticipantLaps.name,
      `No event flags defined in event with ${allTimeRecords.length} and ${eventParticipants.size} participants.`
    );
  }

  const categoryEventFlags: Map<EventCategoryId, GreenFlagRecord> = new Map<EventCategoryId, GreenFlagRecord>();

  const getFinishFlagForCategory = (categoryId: EventCategoryId): FlagRecord | undefined => {
    return getCategoryFlags(eventFlags, categoryId)
      .filter((flag) => flag.time !== undefined)
      .filter((flag) => {
        const normalizedType = (flag.flagType || '').toLowerCase();
        return normalizedType === 'chequered' || normalizedType === 'checkered' || (flag.recordType & EVENT_SESSION_END) > 0;
      })
      .sort(compareByTime)[0];
  };

  eventParticipants.forEach((participant) => {
    const entrantId = participant.entrantId || participant.id;
    const entrantParticipants = entrantParticipantMap.get(entrantId) || [];
    entrantParticipants.push(participant);
    entrantParticipantMap.set(entrantId, entrantParticipants);
  });

  eventParticipants.forEach((participant, participantId) => {
    if (!participant.categoryId) {
      console.error(`Participant ${participantId} has no category ID`);
      return;
    }
    const participantPassings = getPassingsForParticipant(participantId, allTimeRecords);
    participantPassings.forEach(resetPassingLapState);
    if (!isParticipantAssignedToSession(participant, sessionValidCategoryIds)) {
      excludeParticipantPassingsForSessionCategory(participantPassings);
      participantTimesMap.set(participantId, participantPassings);
      return;
    }
    if (participantPassings.length === 0) {
      const txpart = entrantHasAnyTx(participant) ? `Tx${getParticipantTransponders(participant)}` : 'no assigned timing devices';
      const msg = `Participant ${getParticipantNumber(participant)} with ${txpart} has no passings.  Has assignParticpantsToCrossings() been called?`;
      if (!silenceWarnings) {
        console.warn(processAllParticipantLaps.name, msg);
      }
      return; // Skip processing this participant if they have no passings
    }

    const entrantId = participant.entrantId || participant.id;
    const entrantPassings = entrantPassingsMap.get(entrantId) || [];
    entrantPassings.push(...participantPassings);
    entrantPassingsMap.set(entrantId, entrantPassings);
  });

  entrantPassingsMap.forEach((entrantPassings, entrantId) => {
    const members = entrantParticipantMap.get(entrantId) || [];
    const participant = members[0];
    if (!participant) {
      return;
    }

    let participantCategoryStartFlag: GreenFlagRecord | null | undefined;
    try {
      participantCategoryStartFlag = eventFlags?.length > 0
        ? getOrCacheGreenFlagForCategory(
          participant.categoryId,
          eventFlags,
          categoryEventFlags
        ) : undefined;
    } catch (err: unknown) {
      if (err instanceof EventFlagsError || err instanceof NoStartFlagError) {
        console.debug(`No start flag found for participant ${getParticipantNumber(participant)} category ${participant.categoryId} when processing laps.`, err);
        return;
      } else {
        throw err;
      }
    }

    if (eventFlags?.length > 0 && participantCategoryStartFlag) {
      try {
        validateParticipantStartFlag(participantCategoryStartFlag, participant);
        const finishFlag = getFinishFlagForCategory(participant.categoryId);
        processEntrantLaps(
          entrantPassings,
          participantCategoryStartFlag!,
          minimumLapTimeMilliseconds,
          sessionKind,
          finishFlag,
          finishLineNumbers
        );
      } catch (error: unknown) {
        if (error instanceof ParticipantStartFlagError || error instanceof StartFlagHasNoTimeError) {
          console.error(processAllParticipantLaps.name, error.message);
          return;
        }
        throw error;
      }
    }

    members.forEach((member) => {
      participantTimesMap.set(member.id, entrantPassings.filter((passing) => passing.participantId === member.id));
    });
  });

  return participantTimesMap;
};

const processEntrantLaps = (
  entrantPassings: ParticipantPassingRecord[],
  entrantCategoryStartFlag: GreenFlagRecord,
  minimumLapTimeMilliseconds: number,
  sessionKind: EventSessionKind | undefined,
  finishFlag?: FlagRecord,
  finishLineNumbers: number[] | undefined = DEFAULT_FINISH_LINE_NUMBERS
): void => {
  setCategoryStartForPassings(entrantCategoryStartFlag.id, entrantPassings);

  const orderedPassings = [...entrantPassings].sort(compareByTime);
  const finishTime = finishFlag?.time;
  let hasCountedFirstPassingAfterFinish = false;
  let previousFinishPassing: ParticipantPassingRecord | undefined;
  const previousPassingByLine = new Map<string, ParticipantPassingRecord>();
  let lapNo = 0;
  const isRaceSession = isRaceSessionKind(sessionKind);

  orderedPassings.forEach((passing) => {
    if (keepManuallyExcludedPassingOutOfResults(passing)) {
      return;
    }

    if (passing.time === undefined) {
      return;
    }

    if (!isRecordAfterStart(passing, entrantCategoryStartFlag)) {
      passing.elapsedTime = undefined;
      passing.lapNo = undefined;
      passing.lapTime = undefined;
      passing.isValid = false;
      passing.isExcluded = true;
      clearCalculatedUnrelatedReason(passing);
      return;
    }

    const isAfterFinish = !!finishTime && passing.time.getTime() > finishTime.getTime();
    if (isAfterFinish && hasCountedFirstPassingAfterFinish) {
      passing.elapsedTime = elapsedTimeMilliseconds(entrantCategoryStartFlag.time!, passing.time);
      passing.lapNo = lapNo;
      passing.lapTime = validTimeAfterLastLap(passing, previousFinishPassing);
      passing.isValid = false;
      passing.isExcluded = true;
      clearCalculatedUnrelatedReason(passing);
      return;
    }

    const timingLineKey = getTimingLineKey(passing, finishLineNumbers);
    const previousPassingOnLine = previousPassingByLine.get(timingLineKey);
    const lapStartReference = previousFinishPassing || entrantCategoryStartFlag;
    const finishLine = isFinishLinePassing(passing, finishLineNumbers);

    passing.elapsedTime = elapsedTimeMilliseconds(entrantCategoryStartFlag.time!, passing.time);
    const lapTime = finishLine
      ? (previousPassingOnLine
        ? validTimeAfterLastLap(passing, previousPassingOnLine)
        : passing.elapsedTime)
      : elapsedTimeMilliseconds(lapStartReference.time!, passing.time);

    passing.lapTime = lapTime;
    passing.startingLapRecordId = (finishLine ? previousPassingOnLine?.id : previousFinishPassing?.id) || entrantCategoryStartFlag.id;

    if (!isLapCompletionPassing(passing)) {
      previousPassingByLine.set(timingLineKey, passing);
      passing.isValid = true;
      passing.isExcluded = false;
      clearCalculatedUnrelatedReason(passing);
      const sectorLineDuration = validTimeAfterLastLap(passing, previousPassingOnLine);
      if (sectorLineDuration !== undefined && sectorLineDuration < minimumLapTimeMilliseconds) {
        setPassingLapUnderMinimum(passing, minimumLapTimeMilliseconds);
      }
      passing.lapNo = lapNo;
      return;
    }

    const shouldForceCountAsFinishLap = isAfterFinish && !hasCountedFirstPassingAfterFinish;
    if ((lapTime || 0) >= minimumLapTimeMilliseconds || shouldForceCountAsFinishLap) {
      lapNo += 1;
      previousFinishPassing = passing;
      previousPassingByLine.set(timingLineKey, passing);
      passing.isValid = true;
      passing.isExcluded = false;
      clearCalculatedUnrelatedReason(passing);
      if (isAfterFinish) {
        hasCountedFirstPassingAfterFinish = true;
      }
    } else {
      passing.isValid = false;
      passing.isExcluded = true;
      setPassingLapUnderMinimum(passing, minimumLapTimeMilliseconds);
      if (!isRaceSession) {
        previousFinishPassing = passing;
        previousPassingByLine.set(timingLineKey, passing);
      }
    }

    passing.lapNo = lapNo;
  });
};

const validateParticipantStartFlag = (
  participantCategoryStartFlag: GreenFlagRecord | null | undefined,
  participant: EventParticipant
): void => {
  if (!participantCategoryStartFlag) {
    throw new ParticipantStartFlagError(`Participant ${getParticipantNumber(participant)} category (${participant.categoryId}) start flag is undefined`);
  }
  if (!participantCategoryStartFlag.time) {
    throw new StartFlagHasNoTimeError(`Participant ${getParticipantNumber(participant)} category (${participant.categoryId}) start flag has no time`);
  }
};

const getTxListStringForParticipant = (participant: EventParticipant): string => {
  const txList = getParticipantTransponders(participant);
  if (txList.length === 0) {
    return 'No Tx';
  }
  return txList.map((tx) => `Tx${tx}`).join(', ');
};

export const calculateParticipantLapTimes = (
  participantCategoryStartFlag: GreenFlagRecord,
  passings: ParticipantPassingRecord[],
  participant: EventParticipant,
  minimumLapTimeMilliseconds: number = MINIMUM_LAP_TIME_SECONDS * 1000, // 1 minute in milliseconds
  sessionKind: EventSessionKind | undefined = 'race',
  finishLineNumbers: number[] | undefined = DEFAULT_FINISH_LINE_NUMBERS
): void => {
  const identifier = '#' + getParticipantNumber(participant);
  if (!(passings?.length > 0)) {
    const txNoList = getTxListStringForParticipant(participant);
    console.error(`No passings to calculate lap times for ${identifier} with ${txNoList}`);
    return;
  }
  validateParticipantStartFlag(participantCategoryStartFlag, participant);

  let prevFinishPassing: ParticipantPassingRecord | undefined = undefined;
  const previousPassingByLine = new Map<string, ParticipantPassingRecord>();
  let onLapNumber = 0;
  const isRaceSession = isRaceSessionKind(sessionKind);
  passings.forEach((passing) => {
    if (keepManuallyExcludedPassingOutOfResults(passing)) {
      return;
    }

    if (passing.time === undefined) {
      console.error(calculateParticipantLapTimes.name, `Passing for ${getTimeRecordIdentifier(passing)} has no time`);
      return;
    }
    if (!isRecordAfterStart(passing, participantCategoryStartFlag)) {
      passing.lapNo = undefined;
      passing.lapTime = undefined;
      passing.elapsedTime = undefined;
      passing.isExcluded = true;
      passing.isValid = false;
      clearCalculatedUnrelatedReason(passing);
      return;
    }
    const timingLineKey = getTimingLineKey(passing, finishLineNumbers);
    const previousPassingOnLine = previousPassingByLine.get(timingLineKey);
    const lapStartReference = prevFinishPassing || participantCategoryStartFlag;
    const finishLine = isFinishLinePassing(passing, finishLineNumbers);
    const lapTime: number | undefined | null = finishLine
      ? (previousPassingOnLine ? validTimeAfterLastLap(passing, previousPassingOnLine) : passing.elapsedTime)
      : elapsedTimeMilliseconds(lapStartReference.time!, passing.time);
    passing.startingLapRecordId = (finishLine ? previousPassingOnLine?.id : prevFinishPassing?.id) || participantCategoryStartFlag?.id || null;
    if (!isLapCompletionPassing(passing)) {
      previousPassingByLine.set(timingLineKey, passing);
      passing.isExcluded = false;
      passing.isValid = true;
      clearCalculatedUnrelatedReason(passing);
      const sectorLineDuration = validTimeAfterLastLap(passing, previousPassingOnLine);
      if (sectorLineDuration !== undefined && sectorLineDuration < minimumLapTimeMilliseconds) {
        setPassingLapUnderMinimum(passing, minimumLapTimeMilliseconds);
      }
      passing.lapNo = onLapNumber;
      passing.lapTime = lapTime;
      return;
    }

    if ((lapTime || 0) >= minimumLapTimeMilliseconds) {
      onLapNumber++;
      prevFinishPassing = passing;
      previousPassingByLine.set(timingLineKey, passing);
      passing.isValid = true;
      passing.isExcluded = false;
      clearCalculatedUnrelatedReason(passing);
    } else {
      passing.isExcluded = true;
      passing.isValid = false;
      setPassingLapUnderMinimum(passing, minimumLapTimeMilliseconds);
      if (!isRaceSession) {
        prevFinishPassing = passing;
        previousPassingByLine.set(timingLineKey, passing);
      }
    }
    passing.lapNo = onLapNumber;
    passing.lapTime = lapTime;
  });
};

export const getLapTimeCell = (crossing: ParticipantPassingRecord): string => {
  if (crossing.lapTime === undefined) {
    return '--:--:--.---';
  };
  const str = millisecondsToTime(crossing.lapTime!);

  if (crossing.isValid === false || crossing.isExcluded === true) {
    return str.red;
  }

  return str;
};

