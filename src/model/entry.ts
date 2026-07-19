import type { EventEntrantId } from './entrant.js';
import type { EventCategoryId } from './eventcategory.js';
import type { EventParticipant, EventParticipantId, ParticipantIdentifier } from './eventparticipant.js';
import type { EventId } from './raceevent.js';
import type { IdType } from './types.js';

export type EventEntryId = IdType;

/** A competition unit entered by an Entrant and represented by one or more Participants. */
export interface EventEntry {
  categoryId?: EventCategoryId;
  entrantId?: EventEntrantId;
  eventId: EventId;
  id: EventEntryId;
  identifiers: ParticipantIdentifier[];
  name?: string;
  participantIds: EventParticipantId[];
  raceNumber?: string;
}

/** Legacy race states used participant.entrantId as the competition-unit ID. */
export const getParticipantEntryId = (participant: EventParticipant): EventEntryId => (
  participant.entryId || participant.entrantId || participant.id
);
