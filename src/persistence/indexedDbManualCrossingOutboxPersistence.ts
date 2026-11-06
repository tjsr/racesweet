import {
  type ManualCrossingOutboxPersistence,
  type ManualCrossingOutboxState,
  parseManualCrossingOutboxState,
} from "./manualCrossingOutboxPersistence.js";

export class IndexedDbManualCrossingOutboxPersistence implements ManualCrossingOutboxPersistence {
  private readonly factory: IDBFactory;
  public constructor(factory: IDBFactory = indexedDB) {
    this.factory = factory;
  }

  private open = (): Promise<IDBDatabase> =>
    new Promise(
      (
        resolve: (database: IDBDatabase) => void,
        reject: (reason: Error) => void,
      ): void => {
        const request: IDBOpenDBRequest = this.factory.open(
          "racesweet-manual-crossings",
          1,
        );
        request.onupgradeneeded = (): void => {
          request.result.createObjectStore("outbox");
        };
        request.onsuccess = (): void => resolve(request.result);
        request.onerror = (): void =>
          reject(
            request.error ||
              new Error("Could not open the manual timing outbox."),
          );
        request.onblocked = (): void =>
          reject(
            new Error(
              "Manual timing storage is blocked by another tab. Close older RaceSweet tabs and retry.",
            ),
          );
      },
    );

  public load = (): Promise<ManualCrossingOutboxState> =>
    this.open().then(
      (database: IDBDatabase): Promise<ManualCrossingOutboxState> =>
        new Promise(
          (
            resolve: (state: ManualCrossingOutboxState) => void,
            reject: (reason: Error) => void,
          ): void => {
            const transaction: IDBTransaction = database.transaction(
              "outbox",
              "readonly",
            );
            const request: IDBRequest = transaction
              .objectStore("outbox")
              .get("state");
            let loaded: ManualCrossingOutboxState = {
              items: [],
              quarantined: [],
            };
            request.onsuccess = (): void => {
              loaded = parseManualCrossingOutboxState(request.result);
            };
            request.onerror = (): void =>
              reject(
                request.error ||
                  new Error("Could not read the manual timing outbox."),
              );
            transaction.oncomplete = (): void => {
              database.close();
              resolve(loaded);
            };
            transaction.onerror = (): void => {
              database.close();
              reject(
                transaction.error ||
                  new Error("Could not read manual timing storage."),
              );
            };
            transaction.onabort = (): void => {
              database.close();
              reject(
                transaction.error ||
                  new Error("Reading manual timing storage was interrupted."),
              );
            };
          },
        ),
    );

  public save = (state: ManualCrossingOutboxState): Promise<void> =>
    this.open().then(
      (database: IDBDatabase): Promise<void> =>
        new Promise(
          (resolve: () => void, reject: (reason: Error) => void): void => {
            const transaction: IDBTransaction = database.transaction(
              "outbox",
              "readwrite",
            );
            transaction.objectStore("outbox").put(state, "state");
            transaction.oncomplete = (): void => {
              database.close();
              resolve();
            };
            transaction.onerror = (): void => {
              database.close();
              reject(
                transaction.error ||
                  new Error("Could not save the manual timing outbox."),
              );
            };
            transaction.onabort = (): void => {
              database.close();
              reject(
                transaction.error ||
                  new Error("Saving manual timing storage was interrupted."),
              );
            };
          },
        ),
    );
}
