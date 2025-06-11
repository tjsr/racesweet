import type { EventParticipant, EventParticipantId } from "../model/eventparticipant.ts";
import type { FlagRecord, GreenFlagRecord } from "../model/flag.ts";
import type { ParticipantPassingRecord, TimeRecord } from "../model/timerecord.ts";
import { ParticipantStartFlagError, StartFlagHasNoTimeError } from "../validators/errors.ts";
import { calculateParticipantElapsedTimes, getParticipantNumber, getParticipantTransponders, getPassingsForParticipant } from "./participant.ts";
import { elapsedTimeMilliseconds, millisecondsToTime } from "../app/utils/timeutils.ts";
import { getFlagEvents, getOrCacheGreenFlagForCategory } from "./flag.ts";
import { getTimeRecordIdentifier, isRecordAfterStart } from "./timerecord.ts";

import type { EventCategoryId } from "../model/eventcategory.ts";
import { entrantHasAnyTx } from "./participantMatch.ts";
import { setCategoryStartForPassings } from "./category.ts";
import { warn } from "../printCrossings.ts";

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
  const eventFlags: FlagRecord[] = getFlagEvents(allTimeRecords);

  if (!silenceWarnings && (!eventFlags || eventFlags.length === 0)) {
    console.warn(processAllParticipantLaps.name,
      `No event flags defined in event with ${allTimeRecords.length} and ${eventParticipants.size} participants.`
    );
  }

  const categoryEventFlags: Map<EventCategoryId, GreenFlagRecord> = new Map<EventCategoryId, GreenFlagRecord>();
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
    const participantCategoryStartFlag: GreenFlagRecord | null | undefined = eventFlags?.length > 0
      ? getOrCacheGreenFlagForCategory(
        participant.categoryId,
        eventFlags,
        categoryEventFlags
      ) : undefined;

    if (eventFlags?.length > 0) {
      try {
        validateParticipantStartFlag(participantCategoryStartFlag, participant);
        processParticipantLaps(participant, participantPassings, participantCategoryStartFlag!, minimumLapTimeMilliseconds);
      } catch (error: unknown) {
        if (error instanceof ParticipantStartFlagError || error instanceof StartFlagHasNoTimeError) {
          console.error(processAllParticipantLaps.name, error.message);
          return; // Skip processing this participant if the start flag is invalid
        } else {
          throw error; // Re-throw unexpected errors
        }
      }
    }
    participantTimesMap.set(participantId, participantPassings);
  });

  return participantTimesMap;
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

