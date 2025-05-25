import type { EventParticipant } from "./eventparticipant.ts";
import type { TimeEvent } from "./timeevent.ts";

export interface EntrantLap {
  timeEventId: TimeEvent['id'];
  lapStartedBy: EventParticipant['id'];
  elapsedTime: number | null;
  lapTime: number | undefined;
  lapStart: TimeEvent['id'] | null;
  lapNo: number | null;
  isExcluded: boolean;
  overallTrackPosition: number | undefined;
  positionInClass: number | undefined;
}
