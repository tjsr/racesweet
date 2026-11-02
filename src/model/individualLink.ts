import type { EventEntrantId } from './entrant.js';
import type { EventParticipantId } from './eventparticipant.js';
import type { EventId } from './raceevent.js';

/** A directory identity linked to a race participant without changing race state. */
export interface IndividualLinkInput {
  entrantId: EventEntrantId;
  eventId: EventId;
  individualId: string;
  participantId?: EventParticipantId;
}

export interface IndividualLink extends IndividualLinkInput {
  createdAt: string;
  displayName: string;
  id: string;
  removed: boolean;
  updatedAt: string;
}
