import type { EventCategoryId } from "./eventcategory.js";
import type { IdType } from "./types.js";

export type EventEntrantId = IdType;

export interface EventEntrant<IdType extends EventEntrantId> {
  id: IdType;
  categoryId: EventCategoryId;
}
