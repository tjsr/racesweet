import type { EventCategory } from "./eventcategory.ts";
import type { EventParticipant } from "./eventparticipant.ts";
import type { EventTeam } from "./eventteam.ts";

export interface RaceState {
  participants: EventParticipant[];
  categories: EventCategory[];
  teams: EventTeam[];
}
