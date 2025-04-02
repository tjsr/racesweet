import { EventCategoryId } from "./eventcategory.js";
import { EventParticipantId } from "./eventparticipant.js";
import { IdType } from "./types.js";

export type EventTeamId = IdType;

export interface EventTeam {
  id: EventTeamId;
  name: string;
  description: string;
  categoryId: EventCategoryId;
  members: EventParticipantId[];
}
