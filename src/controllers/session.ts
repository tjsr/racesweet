import { EVENT_SESSION_START, type TimeRecord } from "../model/timerecord.js";
import type { FlagRecord, GreenFlagRecord } from "../model/flag.js";
import type { EventCategoryId } from "../model/eventcategory.js";
import { compareByTime } from "./timerecord.js";
import { isFlagRecord, isGreenFlag } from "./flag.js";

const flagAppliesToCategory = (flagEvent: FlagRecord, categoryId?: EventCategoryId): boolean => {
  if (!categoryId) {
    return true;
  }
  if (flagEvent.categoryIds === undefined || flagEvent.categoryIds.length === 0) {
    return true;
  }
  return flagEvent.categoryIds.includes(categoryId);
};

export const isStartRecord = (event: TimeRecord, categoryId?: EventCategoryId): boolean => {
  if (event.time === undefined) {
    return false;
  }
  if (event.recordType & EVENT_SESSION_START) {
    return true;
  }
  if (!isFlagRecord(event) || !isGreenFlag(event)) {
    return false;
  }

  const flagEvent = event as GreenFlagRecord;
  if (flagEvent.indicatesRaceStart === false) {
    return false;
  }

  return flagAppliesToCategory(flagEvent, categoryId);
};

export const isCategoryStartRecord = (event: TimeRecord, categoryId: EventCategoryId): boolean => {
  return isStartRecord(event, categoryId);
};

export const findSessionStartTime = (
  eventFlagEvents: FlagRecord[],
  category?: EventCategoryId
): Date | undefined => findSessionStart(eventFlagEvents, category)?.time;

export const findSessionStart = (
  eventFlagEvents: FlagRecord[],
  category?: EventCategoryId
): FlagRecord|undefined => {
  if (eventFlagEvents.length === 0) {
    return undefined;
  }
  const startRecords: FlagRecord[] = eventFlagEvents.filter((event) => {
    if (event.time === undefined) {
      return false;
    }
    return category ? isCategoryStartRecord(event, category) : isStartRecord(event);
  });

  // The most recent from the unfiltered start records is the start time for this category.
  if (startRecords.length > 0) {
    startRecords.sort(compareByTime);
    return startRecords[startRecords.length - 1];
  }
  return undefined;
};
