import type { EventCategory } from "./eventcategory.js";
import type { EventParticipant } from "./eventparticipant.js";
import type { EventTeam } from "./eventteam.js";

export interface RaceState {
  participants: EventParticipant[];
  categories: EventCategory[];
  teams: EventTeam[];
}
