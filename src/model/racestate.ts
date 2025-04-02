import { EventCategory } from "./eventcategory.js";
import { EventParticipant } from "./eventparticipant.js";
import { EventTeam } from "./eventteam.js";

export interface RaceState {
  participants: EventParticipant[];
  categories: EventCategory[];
  teams: EventTeam[];
}
