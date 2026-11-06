import { describe, expect, it, vi } from "vitest";

import { createMutationId, createTimeRecordId } from "../model/ids.js";
import type { ManualCrossingCommand } from "../model/manualCrossing.js";
import { JsonManualCrossingOutboxPersistence } from "../persistence/jsonManualCrossingOutboxPersistence.js";
import type { ManualCrossingOutboxState } from "../persistence/manualCrossingOutboxPersistence.js";
import { ManualCrossingOutboxService } from "./manualCrossingOutboxService.js";

const command = (): ManualCrossingCommand => ({
  action: "record",
  crossing: {
    eventId: "event",
    identifierKind: "transmitter",
    identifierValue: "123",
    lineNumber: 1,
    localDate: "2026-01-01",
    localTime: "12:00:00",
    sessionId: "session",
    status: "needs-attention",
    time: "2026-01-01T12:00:00.000Z",
    timeZone: "UTC",
  },
  crossingId: createTimeRecordId(),
  mutationId: createMutationId(),
});

describe("durable manual timing outbox", (): void => {
  it("persists draft, local ledger, queued, sending, and acknowledgement in order and recovers offline", async (): Promise<void> => {
    let saved: ManualCrossingOutboxState = { items: [], quarantined: [] };
    const operations: string[] = [];
    const applied: Set<string> = new Set();
    let connected: boolean = false;
    const persistence = {
      load: async (): Promise<ManualCrossingOutboxState> =>
        structuredClone(saved),
      save: async (state: ManualCrossingOutboxState): Promise<void> => {
        saved = structuredClone(state);
        operations.push(state.items[0]?.status || "empty");
      },
    };
    const runtime = {
      applyLocal: async (submission: ManualCrossingCommand): Promise<void> => {
        operations.push("ledger");
        applied.add(submission.mutationId);
      },
      deliver: async (submission: ManualCrossingCommand) => {
        operations.push("network");
        if (!connected) throw new Error("offline");
        return {
          crossingId: submission.crossingId,
          mutationId: submission.mutationId,
          status: "already-accepted" as const,
        };
      },
      hasMutation: (mutationId: string): boolean => applied.has(mutationId),
      now: (): number => 1000,
    };
    const service: ManualCrossingOutboxService =
      new ManualCrossingOutboxService(persistence, runtime);
    await service.initialize();
    operations.length = 0;
    const submission: ManualCrossingCommand = command();
    await service.submit(submission);
    expect(operations).toEqual([
      "draft",
      "ledger",
      "queued",
      "sending",
      "network",
      "queued",
    ]);
    expect(saved.items[0]).toMatchObject({
      attempts: 1,
      lastError: "offline",
      status: "queued",
    });
    connected = true;
    const reopened: ManualCrossingOutboxService =
      new ManualCrossingOutboxService(persistence, runtime);
    await reopened.initialize();
    await reopened.retry();
    expect(saved.items[0]).toMatchObject({
      acknowledgement: { status: "already-accepted" },
      status: "needs-attention",
    });
    expect(applied.size).toBe(1);
  });
  it("never sends a failed ledger write and recovers an interrupted draft by the same mutation ID", async (): Promise<void> => {
    let saved: ManualCrossingOutboxState = { items: [], quarantined: [] };
    const delivery = vi.fn();
    const persistence = {
      load: async (): Promise<ManualCrossingOutboxState> => saved,
      save: async (state: ManualCrossingOutboxState): Promise<void> => {
        saved = structuredClone(state);
      },
    };
    const runtime = {
      applyLocal: vi.fn(async (): Promise<void> => {
        throw new Error("disk full");
      }),
      deliver: delivery,
      hasMutation: (): boolean => false,
    };
    const service: ManualCrossingOutboxService =
      new ManualCrossingOutboxService(persistence, runtime);
    await service.initialize();
    await expect(service.submit(command())).rejects.toThrow("disk full");
    expect(saved.items[0]?.status).toBe("draft");
    expect(delivery).not.toHaveBeenCalled();
    delivery.mockImplementation(async (submission: ManualCrossingCommand) => ({
      crossingId: submission.crossingId,
      mutationId: submission.mutationId,
      status: "accepted",
    }));
    const reopened: ManualCrossingOutboxService =
      new ManualCrossingOutboxService(persistence, {
        ...runtime,
        hasMutation: (): boolean => true,
      });
    await reopened.initialize();
    expect(delivery).toHaveBeenCalledTimes(1);
    expect(runtime.applyLocal).toHaveBeenCalledTimes(1);
  });
  it("quarantines malformed saved items and retains rejection reasons in JSON storage", async (): Promise<void> => {
    const submission: ManualCrossingCommand = command();
    let contents: string = JSON.stringify({
      items: [
        { attempts: 0, command: submission, status: "queued" },
        { command: {} },
      ],
    });
    const persistence = new JsonManualCrossingOutboxPersistence(
      "outbox.json",
      async (): Promise<string> => contents,
      async (_path: string, next: string): Promise<void> => {
        contents = next;
      },
    );
    const service = new ManualCrossingOutboxService(persistence, {
      applyLocal: async (): Promise<void> => undefined,
      hasMutation: (): boolean => true,
      deliver: async () => ({
        crossingId: submission.crossingId,
        mutationId: submission.mutationId,
        reason: "Session closed",
        status: "rejected" as const,
      }),
    });
    await service.initialize();
    expect(service.snapshot.quarantined).toHaveLength(1);
    expect(service.snapshot.items[0]).toMatchObject({
      lastError: "Session closed",
      status: "rejected",
    });
    expect((await persistence.load()).items[0]?.status).toBe("rejected");
  });
});
