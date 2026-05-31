import type { EventEntrant, EventEntrantId } from "./entrant.js";

import type { EventParticipantId } from "./eventparticipant.js";

export type EventTeamId = EventEntrantId;

export interface EventTeam extends EventEntrant<EventTeamId> {
  name: string;
  description: string;
  members: EventParticipantId[];
}
