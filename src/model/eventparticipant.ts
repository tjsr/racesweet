import type { ISO8601DateTime, ISO8601Duration, IdType, WithId } from "./types.js";

import type { EventCategoryId } from "./eventcategory.js";
import type { EventEntrantId } from "./entrant.js";
import type { TimingPointId } from "./timingpoint.js";

export type EventParticipantId = IdType;

export interface ParticipantIdentifier {
  fromTime: Date | undefined;
  toTime: Date | undefined;
}

export interface EventParticipant extends WithId<EventParticipantId> {
  firstname: string;
  surname: string;
  entrantId: EventEntrantId;
  lastRecordTime: ISO8601DateTime | null;
  lastRecordTimingPoint?: TimingPointId | undefined;
  resultDuration: ISO8601Duration | null;
  currentResult: string | undefined;
  categoryId: EventCategoryId;
  identifiers: ParticipantIdentifier[];
}

export interface ParticipateRacePlate extends ParticipantIdentifier {
  racePlate: string;
}

export interface ParticipantTransponder extends ParticipantIdentifier {
  txNo: string | number;
}

export type ChipCodeType = ParticipantTransponder['txNo'];
export type RacePlateType = ParticipateRacePlate['racePlate'];
export type TransponderType = ParticipantTransponder['txNo'];
