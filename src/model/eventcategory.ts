import type { ISO8601DateTime, ISO8601Duration, IdType } from "./types.js";

export type EventCategoryId = IdType;

export interface EventCategory {
  id: EventCategoryId;
  name: string;
  description: string;
  startTime: ISO8601DateTime;
  distance: number;
  duration: ISO8601Duration;
}
