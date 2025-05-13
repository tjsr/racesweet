import type { ISO8601DateTime, ISO8601Duration, IdType } from "./types.ts";

import type { EventCategoryId } from "./eventcategory.ts";
import type { TimingPointId } from "./timingpoint.ts";

export type EventParticipantId = IdType;

export interface ParticipantIdentifier {
  fromTime: Date | undefined;
  toTime: Date | undefined;
}

export interface EventParticipant {
  id: EventParticipantId;
  firstname: string;
  surname: string;
  lastRecordTime: ISO8601DateTime;
  lastRecordTimingPoint: TimingPointId;
  resultDuration: ISO8601Duration | null;
  currentResult: string;
  categoryId: EventCategoryId;
  identifiers: ParticipantIdentifier[];
}

export interface ParticipateRacePlate extends ParticipantIdentifier {
  racePlate: string;
}

export interface ParticipantTransponder extends ParticipantIdentifier {
  txNo: string | number;
}

