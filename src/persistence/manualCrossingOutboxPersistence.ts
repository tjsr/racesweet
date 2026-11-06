import { validate as validateUuid } from "uuid";

import type { ManualCrossingOutboxItem, ManualCrossingOutboxState } from '../model/manualCrossingOutbox.js';
export type { ManualCrossingDeliveryStatus, ManualCrossingOutboxItem, ManualCrossingOutboxState } from '../model/manualCrossingOutbox.js';
export interface ManualCrossingOutboxPersistence {
  load: () => Promise<ManualCrossingOutboxState>;
  save: (state: ManualCrossingOutboxState) => Promise<void>;
}

/** Storage is untrusted: invalid items are retained separately and never delivered. */
export const parseManualCrossingOutboxState = (
  value: unknown,
): ManualCrossingOutboxState => {
  if (value === undefined) return { items: [], quarantined: [] };
  const parsed: Partial<ManualCrossingOutboxState> =
    value && typeof value === "object"
      ? (value as Partial<ManualCrossingOutboxState>)
      : {};
  const items: ManualCrossingOutboxItem[] = [];
  const quarantined: string[] = Array.isArray(parsed.quarantined)
    ? parsed.quarantined.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  if (!Array.isArray(parsed.items)) return { items: [], quarantined: [...quarantined, JSON.stringify(value)] };
  const candidates: unknown[] = Array.isArray(parsed.items) ? parsed.items : [];
  candidates.forEach((candidate: unknown): void => {
    const item: Partial<ManualCrossingOutboxItem> =
      candidate && typeof candidate === "object"
        ? (candidate as Partial<ManualCrossingOutboxItem>)
        : {};
    if (
      item.command &&
      ["record", "correct", "reverse", "reconcile"].includes(
        item.command.action,
      ) &&
      typeof item.command.mutationId === "string" &&
      validateUuid(item.command.mutationId) &&
      typeof item.command.crossingId === "string" &&
      validateUuid(item.command.crossingId) &&
      item.command.crossing &&
      typeof item.command.crossing.eventId === "string" &&
      typeof item.command.crossing.sessionId === "string" &&
      typeof item.command.crossing.time === "string" &&
      Number.isFinite(Date.parse(item.command.crossing.time)) &&
      typeof item.command.crossing.identifierValue === "string" &&
      ["entrant", "plate", "chip", "transmitter"].includes(
        item.command.crossing.identifierKind,
      ) &&
      ["needs-attention", "scored"].includes(item.command.crossing.status) &&
      typeof item.command.crossing.localDate === "string" &&
      typeof item.command.crossing.localTime === "string" &&
      typeof item.command.crossing.timeZone === "string" &&
      Number.isInteger(item.command.crossing.lineNumber) &&
      item.command.crossing.lineNumber > 0 &&
      Number.isInteger(item.attempts) &&
      item.attempts! >= 0 &&
      (item.nextRetryAt === undefined ||
        (typeof item.nextRetryAt === "string" &&
          Number.isFinite(Date.parse(item.nextRetryAt)))) &&
      (item.lastError === undefined || typeof item.lastError === "string") &&
      (item.command.crossing.loopNumber === undefined ||
        (Number.isInteger(item.command.crossing.loopNumber) &&
          item.command.crossing.loopNumber > 0)) &&
      (item.command.crossing.captureInstant === undefined ||
        (typeof item.command.crossing.captureInstant === "string" &&
          Number.isFinite(Date.parse(item.command.crossing.captureInstant)))) &&
      (item.command.crossing.entryMethod === undefined ||
        ["keyboard", "keypad", "voice"].includes(
          item.command.crossing.entryMethod,
        )) &&
      (item.acknowledgement === undefined ||
        (item.acknowledgement.crossingId === item.command.crossingId &&
          item.acknowledgement.mutationId === item.command.mutationId)) &&
      [
        "draft",
        "queued",
        "sending",
        "accepted",
        "rejected",
        "needs-attention",
      ].includes(item.status || "")
    ) {
      items.push(item as ManualCrossingOutboxItem);
    } else quarantined.push(JSON.stringify(candidate));
  });
  return { items, quarantined };
};
