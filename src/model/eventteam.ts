import type { EventCategoryId } from "./eventcategory.ts";
import type { EventParticipantId } from "./eventparticipant.ts";
import type { IdType } from "./types.ts";

export type EventTeamId = IdType;

export interface EventTeam {
  id: EventTeamId;
  name: string;
  description: string;
  categoryId: EventCategoryId;
  members: EventParticipantId[];
}
