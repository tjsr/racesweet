import { EVENT_FLAG_DISPLAYED, EVENT_SESSION_START, type TimeRecord } from "../model/timerecord.ts";
import type { FlagRecord, GreenFlagRecord } from "../model/flag.ts";
import type { EventCategoryId } from "../model/eventcategory.ts";
import { compareByTime } from "./timerecord.ts";

export const isStartRecord = (event: TimeRecord): boolean => {
  if (event.time === undefined) {
    return false;
  }
  if (event.recordType & EVENT_SESSION_START) {
    return true;
  }
  if (event.recordType & EVENT_FLAG_DISPLAYED) {
    const flagEvent = event as FlagRecord;
    if (flagEvent.flagType !== 'green') {
      return false;
    }
    const greenFlagEvent = flagEvent as GreenFlagRecord;
    return greenFlagEvent.indicatesRaceStart == true;
  }
  return false;
};

export const isCategoryStartRecord = (event: TimeRecord, categoryId: EventCategoryId): boolean => {
  const isStart = isStartRecord(event);
  if (isStart) {
    const flagEvent = event as FlagRecord;
    if (flagEvent.categoryIds === undefined || flagEvent.categoryIds.length === 0) {
      return true;
    }
    return flagEvent.categoryIds?.includes(categoryId);
  }
  return false;
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
    if (category) {
      if (isCategoryStartRecord(event, category)) {
        return true;
      }
    }
    return isStartRecord(event);
  });

  // The most recent from the unfiltered start records is the start time for this category.
  if (startRecords.length > 0) {
    startRecords.sort(compareByTime);
    return startRecords[startRecords.length - 1];
  }
  return undefined;
};
