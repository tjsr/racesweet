import type { EventEntrant, EventEntrantId } from "./entrant.ts";

import type { EventParticipantId } from "./eventparticipant.ts";

export type EventTeamId = EventEntrantId;

export interface EventTeam extends EventEntrant<EventTeamId> {
  name: string;
  description: string;
  members: EventParticipantId[];
}
