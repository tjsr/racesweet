import type { EventParticipant, EventParticipantId } from "../model/eventparticipant.js";
import type { EventEntrantId } from "../model/entrant.js";
import type { FlagRecord, GreenFlagRecord } from "../model/flag.js";
import { EVENT_SESSION_END } from "../model/timerecord.js";
import type { ParticipantPassingRecord, TimeRecord } from "../model/timerecord.js";
import { ParticipantStartFlagError, StartFlagHasNoTimeError } from "../validators/errors.js";
import { calculateParticipantElapsedTimes, getParticipantNumber, getParticipantTransponders, getPassingsForParticipant } from "./participant.js";
import { elapsedTimeMilliseconds, millisecondsToTime } from "../app/utils/timeutils.js";
import { getCategoryFlags, getFlagEvents, getOrCacheGreenFlagForCategory } from "./flag.js";
import { getTimeRecordIdentifier, isRecordAfterStart } from "./timerecord.js";
import { compareByTime } from './timerecord.js';

import type { EventCategoryId } from "../model/eventcategory.js";
import { entrantHasAnyTx } from "./participantMatch.js";
import { setCategoryStartForPassings } from "./category.js";
import { warn } from "../utils.js";

const MINIMUM_LAP_TIME_SECONDS = 300;

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
  minimumLapTimeMilliseconds: number = MINIMUM_LAP_TIME_SECONDS * 1000 // Default to 60 seconds if not provided
): void => {
  validateParticipantStartFlag(participantCategoryStartFlag, participant);

  setCategoryStartForPassings(participantCategoryStartFlag.id, participantPassings);
  calculateParticipantElapsedTimes(participantCategoryStartFlag, participantPassings);
  calculateParticipantLapTimes(participantCategoryStartFlag, participantPassings, participant, minimumLapTimeMilliseconds);
};

export const processAllParticipantLaps = (
  allTimeRecords: TimeRecord[],
  eventParticipants: Map<EventParticipantId, EventParticipant>,
  minimumLapTimeMilliseconds: number = MINIMUM_LAP_TIME_SECONDS * 1000, // Default to 60 seconds if not provided
  silenceWarnings: boolean = false
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

    const participantCategoryStartFlag: GreenFlagRecord | null | undefined = eventFlags?.length > 0
      ? getOrCacheGreenFlagForCategory(
        participant.categoryId,
        eventFlags,
        categoryEventFlags
      ) : undefined;

    if (eventFlags?.length > 0) {
      try {
        validateParticipantStartFlag(participantCategoryStartFlag, participant);
        const finishFlag = getFinishFlagForCategory(participant.categoryId);
        processEntrantLaps(entrantPassings, participantCategoryStartFlag!, minimumLapTimeMilliseconds, finishFlag);
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
  finishFlag?: FlagRecord
): void => {
  setCategoryStartForPassings(entrantCategoryStartFlag.id, entrantPassings);

  const orderedPassings = [...entrantPassings].sort(compareByTime);
  const finishTime = finishFlag?.time;
  let hasCountedFirstPassingAfterFinish = false;
  let previousPassing: ParticipantPassingRecord | undefined;
  let lapNo = 0;

  orderedPassings.forEach((passing) => {
    if (passing.time === undefined) {
      return;
    }

    if (!isRecordAfterStart(passing, entrantCategoryStartFlag)) {
      passing.elapsedTime = undefined;
      passing.lapNo = undefined;
      passing.lapTime = undefined;
      passing.isValid = false;
      passing.isExcluded = true;
      return;
    }

    const isAfterFinish = !!finishTime && passing.time.getTime() > finishTime.getTime();
    if (isAfterFinish && hasCountedFirstPassingAfterFinish) {
      passing.elapsedTime = elapsedTimeMilliseconds(entrantCategoryStartFlag.time!, passing.time);
      passing.lapNo = lapNo;
      passing.lapTime = validTimeAfterLastLap(passing, previousPassing);
      passing.isValid = false;
      passing.isExcluded = true;
      return;
    }

    passing.elapsedTime = elapsedTimeMilliseconds(entrantCategoryStartFlag.time!, passing.time);
    const lapTime = previousPassing
      ? validTimeAfterLastLap(passing, previousPassing)
      : passing.elapsedTime;

    passing.lapTime = lapTime;
    passing.startingLapRecordId = previousPassing?.id || entrantCategoryStartFlag.id;

    const shouldForceCountAsFinishLap = isAfterFinish && !hasCountedFirstPassingAfterFinish;
    if ((lapTime || 0) > minimumLapTimeMilliseconds || shouldForceCountAsFinishLap) {
      lapNo += 1;
      previousPassing = passing;
      passing.isValid = true;
      passing.isExcluded = false;
      if (isAfterFinish) {
        hasCountedFirstPassingAfterFinish = true;
      }
    } else {
      passing.isValid = false;
      passing.isExcluded = true;
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
  minimumLapTimeMilliseconds: number = MINIMUM_LAP_TIME_SECONDS * 1000 // 1 minute in milliseconds
): void => {
  const identifier = '#' + getParticipantNumber(participant);
  if (!(passings?.length > 0)) {
    const txNoList = getTxListStringForParticipant(participant);
    console.error(`No passings to calculate lap times for ${identifier} with ${txNoList}`);
    return;
  }
  validateParticipantStartFlag(participantCategoryStartFlag, participant);

  let prevPassing: ParticipantPassingRecord | undefined = undefined;
  let onLapNumber = 0;
  passings.forEach((passing) => {
    if (passing.time === undefined) {
      console.error(calculateParticipantLapTimes.name, `Passing for ${getTimeRecordIdentifier(passing)} has no time`);
      return;
    }
    if (!isRecordAfterStart(passing, participantCategoryStartFlag)) {
      passing.lapNo = undefined;
      passing.lapTime = undefined;
      return;
    }
    let lapTime: number | undefined | null;
    if (prevPassing) {
      // if (passing.time.getTime() < prevPassing.time!.getTime()) {
      //   console.error(`Passing for ${getTimeRecordIdentifier(passing)} is before previous passing @${getTimeRecordIdentifier(prevPassing)}`);
      //   passing.lapNo = undefined;
      //   passing.lapTime = undefined;
      //   return;
      // }
      passing.startingLapRecordId = prevPassing.id;
      lapTime = validTimeAfterLastLap(passing, prevPassing);
    } else {
      passing.startingLapRecordId = participantCategoryStartFlag?.id || null;
      lapTime = passing.elapsedTime;
    }
    if ((lapTime || 0) > minimumLapTimeMilliseconds) {
      onLapNumber++;
      prevPassing = passing;
      passing.isValid = true;
      passing.isExcluded = false;
    } else {
      passing.isExcluded = true;
      passing.isValid = false;
    }
    //  else {
    //   passing.startingLapRecordId = participantCategoryStartFlag?.id || null;
    //   // passing.lapStart = prevPassing?.id || participantCategoryStartFlag?.id || null;
    // }
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

