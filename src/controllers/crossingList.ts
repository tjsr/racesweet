import type { TimeRecord } from "../model/timerecord.ts";

export const assertValidTimeRecord = (event: TimeRecord): void => {
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

const swap = <T>(arr: T[], i: number, j: number): void => {
  const temp = arr[i];
  arr[i] = arr[j];
  arr[j] = temp;
};

export const moveForwardIfUndefined = (crossings: TimeRecord[], index: number): void => {
  if (index >= crossings.length) {
    return;
  }
  let psn = index;
  while (psn > 0 && crossings[psn]?.time === undefined && crossings[psn-1]?.time !== undefined) {
    swap(crossings, psn, psn - 1);
    psn--;
  }
};


