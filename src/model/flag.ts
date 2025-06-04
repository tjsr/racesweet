import type { EventCategoryId } from "./eventcategory.ts";
import type { EventParticipantId } from "./eventparticipant.ts";
import type { TimeRecord } from "./timerecord.ts";
import type { uuid } from "./types.ts";

type CheckpointId = uuid | number;

export interface FlagRecord extends TimeRecord {
  flagType: string;
  flagValue: string;
  categoryIds?: EventCategoryId[];
}

export interface GreenFlagRecord extends FlagRecord {
  flagType: "green";
  flagValue: "course" | "local";
  indicatesRaceStart?: boolean;
}

export type StartRecord = GreenFlagRecord;

export interface WhiteFlagRecord extends FlagRecord {
  flagType: "white";
  flagValue: "course";
}

export interface ChequeredFlagRecord extends FlagRecord {
  flagType: "chequered";
  flagValue: "course";
  categoryId?: EventCategoryId;
}

export interface YellowFlagRecord extends FlagRecord {
  flagType: "yellow";
  flagValue: "caution" | "full course" | "local" | "debris" | "slow";
  point?: CheckpointId;
}

export interface BlueFlagRecord extends FlagRecord {
  flagType: "blue";
  flagValue: "pass" | "slow" | "caution";
  point?: CheckpointId;
  target: string;
  participantId?: EventParticipantId;
}
