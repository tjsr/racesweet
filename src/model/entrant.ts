import type { EventCategoryId } from "./eventcategory.ts";
import type { IdType } from "./types.ts";

export type EventEntrantId = IdType;

export interface EventEntrant<IdType extends EventEntrantId> {
  id: IdType;
  categoryId: EventCategoryId;
}
