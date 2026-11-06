import { validate as validateUuid } from "uuid";

import type { ManualCrossingInput } from "../../model/manualCrossing.js";
import type { ManualCrossingAction } from "../../model/manualCrossing.js";

export interface ManualCrossingSubmission {
  action?: ManualCrossingAction;
  crossing: ManualCrossingInput;
  crossingId: string;
  mutationId: string;
  reason?: string;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const parseManualCrossingSubmission = (
  value: unknown,
): ManualCrossingSubmission => {
  if (
    !isObject(value) ||
    !isObject(value.crossing) ||
    typeof value.crossingId !== "string" ||
    !validateUuid(value.crossingId) ||
    typeof value.mutationId !== "string" ||
    !validateUuid(value.mutationId)
  ) {
    throw new Error("A crossing, crossingId, and mutationId are required.");
  }
  const crossing: Record<string, unknown> = value.crossing;
  if (
    (value.action !== undefined &&
      !["record", "correct", "reverse", "reconcile"].includes(
        String(value.action),
      )) ||
    (value.reason !== undefined && typeof value.reason !== "string")
  )
    throw new Error("The manual timing action is invalid.");
  const requiredStrings: string[] = [
    "eventId",
    "identifierValue",
    "localDate",
    "localTime",
    "sessionId",
    "time",
    "timeZone",
  ];
  if (
    requiredStrings.some(
      (key: string): boolean => typeof crossing[key] !== "string",
    ) ||
    typeof crossing.lineNumber !== "number" ||
    (crossing.loopNumber !== undefined &&
      typeof crossing.loopNumber !== "number") ||
    (crossing.entrantId !== undefined &&
      typeof crossing.entrantId !== "string") ||
    (crossing.participantId !== undefined &&
      typeof crossing.participantId !== "string") ||
    !["chip", "entrant", "plate", "transmitter"].includes(
      String(crossing.identifierKind),
    ) ||
    !["needs-attention", "scored"].includes(String(crossing.status))
  ) {
    throw new Error("The manual crossing payload is invalid.");
  }
  const parsed: ManualCrossingInput = {
    eventId: crossing.eventId as string,
    identifierKind:
      crossing.identifierKind as ManualCrossingInput["identifierKind"],
    identifierValue: crossing.identifierValue as string,
    lineNumber: crossing.lineNumber as number,
    localDate: crossing.localDate as string,
    localTime: crossing.localTime as string,
    sessionId: crossing.sessionId as string,
    status: crossing.status as ManualCrossingInput["status"],
    time: crossing.time as string,
    timeZone: crossing.timeZone as string,
  };
  if (crossing.entrantId !== undefined) {
    parsed.entrantId = crossing.entrantId as string;
  }
  if (crossing.loopNumber !== undefined) {
    parsed.loopNumber = crossing.loopNumber as number;
  }
  if (crossing.participantId !== undefined) {
    parsed.participantId = crossing.participantId as string;
  }
  if (crossing.entryMethod !== undefined) {
    if (!["keyboard", "keypad", "voice"].includes(String(crossing.entryMethod)))
      throw new Error("Invalid entry method.");
    parsed.entryMethod =
      crossing.entryMethod as ManualCrossingInput["entryMethod"];
  }
  if (crossing.captureInstant !== undefined) {
    if (typeof crossing.captureInstant !== "string")
      throw new Error("Invalid capture instant.");
    parsed.captureInstant = crossing.captureInstant;
  }
  if (crossing.operatorLabel !== undefined) {
    if (typeof crossing.operatorLabel !== "string")
      throw new Error("Invalid operator label.");
    parsed.operatorLabel = crossing.operatorLabel;
  }
  return {
    ...(value.action === undefined
      ? {}
      : { action: value.action as ManualCrossingAction }),
    crossing: parsed,
    crossingId: value.crossingId,
    mutationId: value.mutationId,
    ...(value.reason === undefined ? {} : { reason: value.reason as string }),
  };
};
