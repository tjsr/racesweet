import { EVENT_FLAG_DISPLAYED, EVENT_SESSION_START, type TimeEvent } from "../model/timeevent.ts";
import type { FlagEvent, GreenFlagEvent } from "../model/flag.ts";
import type { EventCategoryId } from "../model/eventcategory.ts";
import { compareByTime } from "./timeevent.ts";

export const isStartRecord = (event: TimeEvent): boolean => {
  if (event.time === undefined) {
    return false;
  }
  if (event.eventType & EVENT_SESSION_START) {
    return true;
  }
  if (event.eventType & EVENT_FLAG_DISPLAYED) {
    const flagEvent = event as FlagEvent;
    if (flagEvent.flagType !== 'green') {
      return false;
    }
    const greenFlagEvent = flagEvent as GreenFlagEvent;
    return greenFlagEvent.indicatesRaceStart == true;
  }
  return false;
};

export const isCategoryStartRecord = (event: TimeEvent, categoryId: EventCategoryId): boolean => {
  const isStart = isStartRecord(event);
  if (isStart) {
    const flagEvent = event as FlagEvent;
    if (flagEvent.categoryIds === undefined || flagEvent.categoryIds.length === 0) {
      return true;
    }
    return flagEvent.categoryIds?.includes(categoryId);
  }
  return false;
};

export const findSessionStartTime = (
  eventFlagEvents: FlagEvent[],
  category?: EventCategoryId
): Date | undefined => findSessionStart(eventFlagEvents, category)?.time;

export const findSessionStart = (
  eventFlagEvents: FlagEvent[],
  category?: EventCategoryId
): FlagEvent|undefined => {
  if (eventFlagEvents.length === 0) {
    return undefined;
  }
  const startRecords: FlagEvent[] = eventFlagEvents.filter((event) => {
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
