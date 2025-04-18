import type { ISO8601DateTime, ISO8601Duration, IdType } from "./types.js";

import type { EventCategoryId } from "./eventcategory.js";
import type { TimingPointId } from "./timingpoint.js";

export type EventParticipantId = IdType;

export interface EventParticipant {
  id: EventParticipantId;
  firstname: string;
  surname: string;
  lastRecordTime: ISO8601DateTime;
  lastRecordTimingPoint: TimingPointId;
  resultDuration: ISO8601Duration | null;
  currentResult: string;
  categoryId: EventCategoryId;
}
