import type { ChipCrossingData } from "../model/chipcrossing.ts";
import type { PlateCrossingData } from "../model/platecrossing.ts";
import type { TimeEvent } from "../model/timeevent.ts";

export const getTimeEventIdentifier = (evt: TimeEvent): string => {
  if (Object.prototype.hasOwnProperty.call(evt, 'chipCode')) {
    const crossing = evt as ChipCrossingData;
    return `Tx${crossing.chipCode}`;
  };
  if (Object.prototype.hasOwnProperty.call(evt, 'plateNumber')) {
    const crossing = evt as PlateCrossingData;
    return `#${crossing.plateNumber}`;
  }
  return `@${evt.id}`;
};

export const compareByTime = (
  a: TimeEvent,
  b: TimeEvent
): number => compareTimes(a.time, b.time);

export const compareTimes = (a: Date | undefined, b: Date | undefined): number => {
  if (a === undefined && b === undefined) {
    return 0;
  }
  if (a === undefined) {
    return 1;
  }
  if (b === undefined) {
    return -1;
  }
  return a.getTime() - b.getTime();
};

export const filterToEventsBetween = (data: TimeEvent[], start: Date, end: Date): TimeEvent[] => {
  return data.filter((crossing) => {
    if (crossing.time === undefined) {
      return false;
    }
    const crossingTime = crossing.time.getTime();
    return crossingTime >= start.getTime() && crossingTime <= end.getTime();
  });
};

