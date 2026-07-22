import type { RaceState } from "../model/racestate.js";
import { Session } from "../model/racestate.js";
import type { TestSession, TestSessionItemLoadedCallback, TestSessionLoadProgressCallback } from "./testsession.js";

export abstract class GenericTestSession extends Session implements TestSession {
  // private _resourceProvider: RP | undefined;

  public constructor(raceState?: RaceState) {
    super(raceState || {
      categories: [],
      participants: [],
      records: [],
      teams: [],
    });
  };

  // public set resourceProvider(provider: RP) {
  //   this._resourceProvider = provider;
  // }

  // protected getResource(resource: string): Promise<ResourceType> {
  //   if (!this.resourceProvider) {
  //     throw new Error("Resource provider is not set for the test session.");
  //   }
  //   return this.resourceProvider.getResource(resource);
  // }

  // protected getJsonResource(fileName: string): Promise<unknown> {
  //   return this.getResource(fileName);
  //   // const resourcePath = this.getResourcePath(fileName);
  //   // return this.resourceProvider.iterateFile(resourcePath)
  //   //   .then((data: string) => JSON.parse(data))
  //   //   .catch((error: unknown) => {
  //   //     console.error(`Error reading JSON resource from ${resourcePath}:`, error);
  //   //     throw error;
  //   //   });
  // };

  public abstract loadCategories(onItemLoaded?: TestSessionItemLoadedCallback): Promise<void>;
  public abstract loadParticipants(onItemLoaded?: TestSessionItemLoadedCallback): Promise<void>;
  public abstract loadFlags(onItemLoaded?: TestSessionItemLoadedCallback): Promise<void>;
  public abstract loadCrossings(onItemLoaded?: TestSessionItemLoadedCallback): Promise<void>;

  protected async getTestDataLoadTotal(): Promise<number> {
    return 4;
  }

  public async loadTestData(noBulkProcess: boolean = false, onProgress?: TestSessionLoadProgressCallback): Promise<void> {
    const loadStartTime = new Date();
    let initPromise: Promise<boolean> = Promise.resolve(true);
    if (!noBulkProcess) {
      initPromise = this.beginBulkProcess();
    }
    const total = Math.max(1, await this.getTestDataLoadTotal());
    let completed = 0;
    const completeItem = async (currentTask: string): Promise<void> => {
      completed += 1;
      await onProgress?.({ completed, currentTask, total });
    };

    await onProgress?.({ completed: 0, currentTask: 'Preparing test session load', total });
    console.debug('Loading test data...');
    return initPromise
      .then(() => this.loadCategories(completeItem).then(() => {
        console.log(`Loaded ${this.categories.length} categories successfully.`);
        console.log(this.categories.map((c) => `${c.id}: ${c.name}`).join('\n'));
      }))
      .then(() => this.loadParticipants(completeItem).then(() => {
        console.log(`Loaded ${this.participants.length} participants successfully.`);
      }))
      .then(() => this.loadFlags(completeItem))
      .then(() => this.loadCrossings(completeItem))
      .then(() => {
        const loadEndTime = new Date();
        const loadDuration = (loadEndTime.getTime() - loadStartTime.getTime());
        console.log(`Test data loaded in ${loadDuration} milliseconds.`);
        if (noBulkProcess) {
          return Promise.resolve();
        }
        return this.endBulkProcess();
      })
      .catch((error: unknown) => {
        console.log('Error loading test data:', error);
        throw error;
      });
  }
}
