import type { ChipCrossingData, TimeEvent } from "../model/chipcrossing.js";

const assertValidTimeEvent = (event: TimeEvent): void => {
  if (!event) {
    throw new Error("Crossing is undefined");
  }
  if (!event.time) {
    throw new Error("Crossing time is undefined");
  }
  if (!event.source) {
    throw new Error("Crossing source is undefined");
  }
};

export const addCrossing = (crossings: TimeEvent[], crossing: ChipCrossingData): void => {
  assertValidTimeEvent(crossing);
  
  let psn = crossings.push(crossing) - 1;
  while (psn > 0) {
    if (crossings[psn].time.getTime() < crossings[psn - 1].time.getTime()) {
      const temp = crossings[psn];
      crossings[psn] = crossings[psn - 1];
      crossings[psn - 1] = temp;
      psn--;
    } else {
      break;
    }
  }
};

