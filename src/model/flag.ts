import type { EventCategoryId } from "./eventcategory.ts";
import type { ParticipantIdentifier } from "./eventparticipant.ts";
import type { TimeEvent } from "./timeevent.ts";
import type { uuid } from "./types.ts";

type CheckpointId = uuid | number;

export interface FlagEvent extends TimeEvent {
  flagType: string;
  flagValue: string;
  categoryIds?: EventCategoryId[];
}

export interface GreenFlagEvent extends FlagEvent {
  flagType: "green";
  flagValue: "course";
}

export interface WhiteFlagEvent extends FlagEvent {
  flagType: "white";
  flagValue: "course";
}

export interface ChequeredFlagEvent extends FlagEvent {
  flagType: "chequered";
  flagValue: "course";
  categoryId?: EventCategoryId;
}

export interface YellowFlagEvent extends FlagEvent {
  flagType: "yellow";
  flagValue: "caution" | "full course" | "local" | "debris" | "slow";
  point?: CheckpointId;
}

export interface BlueFlagEvent extends FlagEvent {
  flagType: "blue";
  flagValue: "pass" | "slow" | "caution";
  point?: CheckpointId;
  target: string;
  participantId?: ParticipantIdentifier;
}
