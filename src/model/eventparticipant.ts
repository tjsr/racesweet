import type { ISO8601DateTime, ISO8601Duration, IdType, WithId } from "./types.js";

import type { EventCategoryId } from "./eventcategory.js";
import type { EventEntryId } from './entry.js';
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
  /** The competition unit whose laps and result include this participant. */
  entryId?: EventEntryId;
  /** The person or organisation responsible for the Entry. */
  entrantId: EventEntrantId;
  lastRecordTime: ISO8601DateTime | null;
  lastRecordTimingPoint?: TimingPointId | undefined;
  resultDuration: ISO8601Duration | null;
  currentResult: string | undefined;
  /**
   * Direct event participants own a category. Participants linked to an entrant
   * inherit that category from the entrant and must not duplicate it here.
   */
  categoryId?: EventCategoryId;
  identifiers: ParticipantIdentifier[];
  /** True while this participant was created only to represent unidentified timing data. */
  isPlaceholder?: boolean;
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
export type ParticipantIdentifierUpdate = RacePlateType | TransponderType | ParticipateRacePlate | ParticipantTransponder;
