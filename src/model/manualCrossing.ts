import type { EventEntrantId } from "./entrant.js";
import type { EventParticipantId } from "./eventparticipant.js";
import type { EventId, SessionId } from "./raceevent.js";
import type { TimeRecordId } from "./timerecord.js";

export type ManualCrossingIdentifierKind =
  "chip" | "entrant" | "plate" | "transmitter";
export type ManualCrossingStatus = "needs-attention" | "scored";

export interface ManualCrossing {
  crossingId: TimeRecordId;
  entrantId?: EventEntrantId;
  eventId: EventId;
  identifierKind: ManualCrossingIdentifierKind;
  identifierValue: string;
  lineNumber: number;
  localDate: string;
  localTime: string;
  loopNumber?: number;
  participantId?: EventParticipantId;
  sessionId: SessionId;
  status: ManualCrossingStatus;
  time: string;
  timeZone: string;
}

export type ManualCrossingInput = Omit<ManualCrossing, "crossingId">;

export interface EffectiveManualCrossing extends ManualCrossing {
  lastMutationId: string;
  reversed: boolean;
  reversalReason?: string;
}
