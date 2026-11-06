import type {
  ManualCrossingAcknowledgement,
  ManualCrossingCommand,
} from "../model/manualCrossing.js";
import type {
  ManualCrossingOutboxItem,
  ManualCrossingOutboxPersistence,
  ManualCrossingOutboxState,
} from "../persistence/manualCrossingOutboxPersistence.js";

export interface ManualCrossingOutboxRuntime {
  applyLocal: (command: ManualCrossingCommand) => Promise<void>;
  deliver: (
    command: ManualCrossingCommand,
  ) => Promise<ManualCrossingAcknowledgement>;
  hasMutation: (mutationId: string) => boolean;
  onRejected?: (
    command: ManualCrossingCommand,
    acknowledgement: ManualCrossingAcknowledgement,
  ) => Promise<void>;
  now?: () => number;
}

export class ManualCrossingOutboxService {
  private readonly persistence: ManualCrossingOutboxPersistence;
  private readonly runtime: ManualCrossingOutboxRuntime;
  private state: ManualCrossingOutboxState = { items: [], quarantined: [] };
  private operations: Promise<void> = Promise.resolve();
  private readonly listeners: Set<(state: ManualCrossingOutboxState) => void> = new Set();

  public constructor(
    persistence: ManualCrossingOutboxPersistence,
    runtime: ManualCrossingOutboxRuntime,
  ) {
    this.persistence = persistence;
    this.runtime = runtime;
  }
  public get snapshot(): ManualCrossingOutboxState {
    return structuredClone(this.state);
  }
  private serialize = (operation: () => Promise<void>): Promise<void> => {
    const next: Promise<void> = this.operations
      .catch((): void => undefined)
      .then(operation);
    this.operations = next;
    return next;
  };
  public subscribe = (listener: (state: ManualCrossingOutboxState) => void): (() => void) => {
    this.listeners.add(listener);
    listener(this.snapshot);
    return (): void => { this.listeners.delete(listener); };
  };
  private persist = (): Promise<void> => this.persistence.save(this.snapshot).then((): void => {
    this.listeners.forEach((listener: (state: ManualCrossingOutboxState) => void): void => listener(this.snapshot));
  });

  public initialize = (): Promise<void> =>
    this.serialize(async (): Promise<void> => {
      this.state = await this.persistence.load();
      await this.recoverDrafts();
      await this.persist();
      await this.flushItems(false);
    });

  private recoverDrafts = async (): Promise<void> => {
    for (const item of this.state.items) {
      if (item.status === "sending") item.status = "queued";
      if (item.status === "draft") {
        if (this.runtime.hasMutation(item.command.mutationId))
          item.status = "queued";
        else {
          try {
            await this.persist();
            await this.runtime.applyLocal(item.command);
            item.status = "queued";
          } catch (error: unknown) {
            item.lastError =
              error instanceof Error ? error.message : String(error);
          }
        }
      }
    }
  };

  public submit = (command: ManualCrossingCommand): Promise<void> =>
    this.serialize(async (): Promise<void> => {
      if (
        this.state.items.some(
          (item: ManualCrossingOutboxItem): boolean =>
            item.command.mutationId === command.mutationId,
        )
      ) {
        throw new Error("This manual timing action is already in the outbox.");
      }
      const item: ManualCrossingOutboxItem = {
        attempts: 0,
        command: structuredClone(command),
        status: "draft",
      };
      this.state.items.push(item);
      await this.persist();
    await this.runtime.applyLocal(item.command);
      item.status = "queued";
      await this.persist();
      await this.deliverItem(item);
    });

  public retry = (force: boolean = true): Promise<void> =>
    this.serialize(async (): Promise<void> => {
      await this.recoverDrafts();
      await this.persist();
      await this.flushItems(force);
    });
  private flushItems = async (force: boolean): Promise<void> => {
    const now: number = this.runtime.now?.() ?? Date.now();
    for (const item of this.state.items) {
      if (
        item.status === "queued" &&
        (force || !item.nextRetryAt || Date.parse(item.nextRetryAt) <= now)
      )
        await this.deliverItem(item);
    }
  };
  private deliverItem = async (
    item: ManualCrossingOutboxItem,
  ): Promise<void> => {
    item.status = "sending";
    item.attempts += 1;
    await this.persist();
    try {
      const acknowledgement: ManualCrossingAcknowledgement =
        await this.runtime.deliver(item.command);
      if (
        acknowledgement.crossingId !== item.command.crossingId ||
        acknowledgement.mutationId !== item.command.mutationId ||
        !["accepted", "already-accepted", "conflict", "rejected"].includes(
          acknowledgement.status,
        )
      )
        throw new Error(
          "The manual timing acknowledgement does not match this action.",
        );
      item.acknowledgement = acknowledgement;
      item.status =
        acknowledgement.status === "accepted" ||
        acknowledgement.status === "already-accepted"
          ? item.command.crossing.status === "needs-attention" &&
            item.command.action !== "reverse"
            ? "needs-attention"
            : "accepted"
          : "rejected";
      item.lastError = acknowledgement.reason;
      item.nextRetryAt = undefined;
      if (item.status === "rejected")
        await this.runtime.onRejected?.(item.command, acknowledgement);
    } catch (error: unknown) {
      item.status = "queued";
      item.lastError = error instanceof Error ? error.message : String(error);
      item.nextRetryAt = new Date(
        (this.runtime.now?.() ?? Date.now()) +
          Math.min(60_000, 1_000 * 2 ** Math.min(item.attempts, 6)),
      ).toISOString();
    }
    await this.persist();
  };
}
