import type { EventCategoryId } from "./eventcategory.js";
import type { EventParticipantId } from "./eventparticipant.js";
import type { IdType } from "./types.js";

export type EventTeamId = IdType;

export interface EventTeam {
  id: EventTeamId;
  name: string;
  description: string;
  categoryId: EventCategoryId;
  members: EventParticipantId[];
}
