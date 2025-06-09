import type { ISO8601DateTime, ISO8601Duration, IdType, WithId } from "./types.ts";

import type { TimeRecord } from "./timerecord.ts";

export type EventCategoryId = IdType;

export interface EventCategory extends WithId<EventCategoryId> {
  name: string;
  code?: string;
  description?: string;
  startTime?: ISO8601DateTime;
  distance?: number;
  duration?: ISO8601Duration;
  startRecordFlag?: TimeRecord['id'];
}

export interface PlaceholderCategory extends EventCategory {
  isPlaceholder: true;
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
