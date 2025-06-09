import {
  EVENT_FLAG_DISPLAYED,
  EVENT_FLAG_RETRACTED,
  EVENT_SESSION_END,
  EVENT_SESSION_START
} from "../model/timerecord.ts";
import type { FlagRecord, GreenFlagRecord } from '../model/flag.ts';
import type { TimeRecord, TimeRecordId } from "../model/timerecord.ts";
import { getTimeRecordIdentifier, isNotRecordType } from './timerecord.ts';
import { v1 as uuid1, v5 as uuid5 } from 'uuid';

import type { EventCategoryId } from "../model/eventcategory.ts";
import type { EventParticipantId } from '../model/eventparticipant.ts';
import { NoEventFlagsError } from "../validators/errors.ts";

const FLAG_NAMESPACE = uuid5('flag', '00000000-0000-0000-0000-000000000000');
const EVENT_FLAG_GREEN = EVENT_FLAG_DISPLAYED | 16;

const createFlagEvent = <F extends FlagRecord>(event: Partial<F>): F => {
  const newEvent: Partial<F> = {
    ...event,
    id: event.id || uuid5(uuid1(), FLAG_NAMESPACE),
    recordType: (event.recordType || 0) & EVENT_FLAG_DISPLAYED,
    source: event.source || 'flag',
    time: event.time || new Date(),
  };
  return newEvent as F;
};

export const createGreenFlagEvent = (event: Partial<GreenFlagRecord>): GreenFlagRecord => {
  const flag = createFlagEvent(event);
  const green: Partial<GreenFlagRecord> = {
    ...flag,
    flagType: 'green',
    recordType: flag.recordType | EVENT_FLAG_GREEN,
    // flagValue: "course",
  };

  return green as GreenFlagRecord;
};
//   const newFlagEvent = createFlagEvent(event);
//   const flagEventId = newFlagEvent.id;
//   const flagEventSource = newFlagEvent.source;
//   const flagEventTime = newFlagEvent.time;

// };

class InvalidParticipantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidParticipantError';
  }
}

export const addFlagEvent = (laps: Map<EventParticipantId, TimeRecord[]>, participantId: EventParticipantId, flagTime: FlagRecord): void => {
  if (!participantId) {
    throw new InvalidParticipantError(`Flag event for ${getTimeRecordIdentifier(flagTime)} has no participant ID`);
  }
  if (!laps.has(participantId)) {
    laps.set(participantId, []);
  }
  const participantLaps = laps.get(participantId)!;
  participantLaps.push(flagTime);
};

export const getFlagEvents = (timeRecords: TimeRecord[]): FlagRecord[] => {
  return timeRecords.filter((record): record is FlagRecord => isFlagRecord(record));
};

const isFlagForCategory = (
  flag: FlagRecord, categoryId: EventCategoryId
): boolean => flag.categoryIds === undefined || flag.categoryIds?.map((id) => id?.toString()).includes(categoryId.toString());

export const getCategoryFlags = (
  flagEvents: FlagRecord[], categoryId: EventCategoryId
): FlagRecord[] => flagEvents.filter((flag) => isFlagForCategory(flag, categoryId));

const isRetractedFlag = (flag: FlagRecord): boolean =>
  (flag.recordType & EVENT_FLAG_RETRACTED) > 0;

export const isGreenFlag = (
  flag: FlagRecord,
  includeRetracted: boolean = false
): flag is GreenFlagRecord => {
  if (flag.flagType !== 'green') {
    return false;
  }
  if (includeRetracted) {
    return true;
  }

  return !isRetractedFlag(flag);
};

export const isFlagRecord = (event: TimeRecord): event is FlagRecord => {
  if (event.recordType & EVENT_FLAG_DISPLAYED || event.recordType & EVENT_FLAG_RETRACTED) {
    return true;
  }
  const flag = event as FlagRecord;
  return flag.flagType !== undefined;
};

export const hasCategoryIds = (
  record: FlagRecord
): boolean => record?.categoryIds !== undefined &&
Array.isArray(record.categoryIds) &&
record.categoryIds.length > 0;

export const isStartRecord = (event: TimeRecord): boolean => 
  (event.recordType & EVENT_SESSION_START) > 0 ||
  (isFlagRecord(event) && (isNotRecordType(event, EVENT_SESSION_END | EVENT_FLAG_RETRACTED) && isGreenFlag(event as FlagRecord)));


export const getEventStartFlagForCategory = (
  categoryId: EventCategoryId,
  eventFlags: FlagRecord[]
): GreenFlagRecord | null => {
  const catFlags = getCategoryFlags(eventFlags, categoryId);

  const green = catFlags.find((flag) => {
    if (isGreenFlag(flag)) {
      const greenFlag = flag as GreenFlagRecord;
      if (greenFlag.indicatesRaceStart === false) {
        return false;
      }
      return true;
    }
    return false;
  }) as GreenFlagRecord | undefined;
  return green ?? null;
};


export const getStartFlagsForCategories = (
  categories: EventCategoryId[],
  eventFlags: FlagRecord[]
): Map<EventCategoryId, TimeRecordId> => {
  const startFlags = new Map<EventCategoryId, TimeRecordId>();
  categories.forEach((categoryId) => {
    const categoryEventFlags = getEventStartFlagForCategory(categoryId, eventFlags);
    if (categoryEventFlags) {
      startFlags.set(categoryId, categoryEventFlags.id);
    }
  });
  return startFlags;
};

export const getOrCacheGreenFlagForCategory = (
  categoryId: EventCategoryId,
  eventFlags: FlagRecord[],
  categoryEventFlags: Map<EventCategoryId, GreenFlagRecord>
): GreenFlagRecord | null => {
  if (!eventFlags || eventFlags.length === 0) {
    throw new NoEventFlagsError(`No event flags in event when searching for relevant category ${categoryId} start flag.`);
  }
  if (categoryEventFlags.has(categoryId)) {
    return categoryEventFlags.get(categoryId) || null;
  }
  const categoryStartFlag = getEventStartFlagForCategory(categoryId, eventFlags);
  if (!categoryStartFlag) {
    console.error(getOrCacheGreenFlagForCategory.name , `No start flag found for category ${categoryId}`);
    return null;
  }
  categoryEventFlags.set(categoryId, categoryStartFlag);
  return categoryStartFlag as GreenFlagRecord;
};

export const getCategoryGreenFlags = (
  eventFlags: FlagRecord[],
  eventCategoryIds: EventCategoryId[]
): Map<EventCategoryId, GreenFlagRecord> => {
  const categoryEventFlags: Map<EventCategoryId, GreenFlagRecord> = new Map<EventCategoryId, GreenFlagRecord>();
  eventCategoryIds.forEach((categoryId) => {
    const categoryStartFlag = getEventStartFlagForCategory(categoryId, eventFlags);
    categoryEventFlags.set(categoryId, categoryStartFlag as GreenFlagRecord);
  });
  return categoryEventFlags;
};

