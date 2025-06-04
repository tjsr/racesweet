import type { EventParticipant } from "./eventparticipant.ts";
import type { TimeRecord } from "./timerecord.ts";

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
