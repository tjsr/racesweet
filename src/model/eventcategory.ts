import type { ISO8601DateTime, ISO8601Duration, IdType } from "./types.ts";

import type { TimeRecordId } from "./timerecord.ts";

export type EventCategoryId = IdType;

export interface EventCategory {
  id: EventCategoryId;
  name: string;
  description?: string;
  startTime?: ISO8601DateTime;
  distance?: number;
  duration?: ISO8601Duration;
  startRecordFlag?: TimeRecordId;
}

export class CategoryNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CategoryNotFoundError";
  }
}

export class NoUnknownEntrantCategoryError extends CategoryNotFoundError {
  constructor(message: string) {
    super(message);
    this.name = "NoUnknownEntrantCategoryError";
  }  
}  
