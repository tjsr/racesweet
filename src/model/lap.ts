import type { EventParticipant } from "./eventparticipant.js";
import type { TimeRecord } from "./timerecord.js";

export interface EntrantLap {
  timeRecordId: TimeRecord['id'];
  lapStartedBy: EventParticipant['id'];
  elapsedTime: number | null;
  lapTime: number | undefined;
  lapStart: TimeRecord['id'] | null;
  lapNo: number | null;
  isExcluded: boolean;
  overallTrackPosition: number | undefined;
  positionInClass: number | undefined;
}
