import { describe, expect, it } from "vitest";

import { IndexedDbManualCrossingOutboxPersistence } from "./indexedDbManualCrossingOutboxPersistence.js";
import type { ManualCrossingOutboxState } from "./manualCrossingOutboxPersistence.js";

/** Minimal event-driven IDB fixture: production adapter is exercised without a browser process. */
const createFactory = (): {
  factory: IDBFactory;
  abortNext: () => void;
  closed: () => number;
} => {
  let state: ManualCrossingOutboxState | undefined;
  let abort: boolean = false;
  let closeCount: number = 0;
  const database: Partial<IDBDatabase> = {
    close: (): void => {
      closeCount += 1;
    },
    transaction: (): IDBTransaction => {
      const transaction: Partial<IDBTransaction> = {};
      const store: Partial<IDBObjectStore> = {
        get: (): IDBRequest => {
          const request: Partial<IDBRequest> = { result: state };
          queueMicrotask((): void => {
            request.onsuccess?.call(
              request as IDBRequest,
              new Event("success"),
            );
            if (abort) {
              abort = false;
              transaction.onabort?.call(
                transaction as IDBTransaction,
                new Event("abort"),
              );
            } else
              transaction.oncomplete?.call(
                transaction as IDBTransaction,
                new Event("complete"),
              );
          });
          return request as IDBRequest;
        },
        put: (value: ManualCrossingOutboxState): IDBRequest => {
          queueMicrotask((): void => {
            if (abort) {
              abort = false;
              transaction.onabort?.call(
                transaction as IDBTransaction,
                new Event("abort"),
              );
            } else {
              state = structuredClone(value);
              transaction.oncomplete?.call(
                transaction as IDBTransaction,
                new Event("complete"),
              );
            }
          });
          return {} as IDBRequest;
        },
      };
      transaction.objectStore = (): IDBObjectStore => store as IDBObjectStore;
      return transaction as IDBTransaction;
    },
  };
  const factory: Partial<IDBFactory> = {
    open: (): IDBOpenDBRequest => {
      const request: Partial<IDBOpenDBRequest> = {
        result: database as IDBDatabase,
      };
      queueMicrotask((): void =>
        request.onsuccess?.call(
          request as IDBOpenDBRequest,
          new Event("success"),
        ),
      );
      return request as IDBOpenDBRequest;
    },
  };
  return {
    abortNext: (): void => {
      abort = true;
    },
    closed: (): number => closeCount,
    factory: factory as IDBFactory,
  };
};

describe("browser manual timing outbox persistence", (): void => {
  it("persists and reloads state only after transaction commit and reports aborted writes", async (): Promise<void> => {
    const fixture = createFactory();
    const adapter = new IndexedDbManualCrossingOutboxPersistence(
      fixture.factory,
    );
    const state: ManualCrossingOutboxState = {
      items: [],
      quarantined: ["damaged entry retained"],
    };
    await adapter.save(state);
    expect(await adapter.load()).toEqual(state);
    fixture.abortNext();
    await expect(adapter.save({ items: [], quarantined: [] })).rejects.toThrow(
      /interrupted/,
    );
    expect(await adapter.load()).toEqual(state);
    expect(fixture.closed()).toBe(4);
  });
});
