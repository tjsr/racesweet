import type { RaceState } from "../model/racestate.ts";
import { Session } from "../model/racestate.ts";
import type { TestSession } from "./testsession.ts";

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

  public abstract loadCategories(): Promise<void>;
  public abstract loadParticipants(): Promise<void>;
  public abstract loadFlags(): Promise<void>;
  public abstract loadCrossings(): Promise<void>;

  public async loadTestData(noBulkProcess: boolean = false): Promise<void> {
    const loadStartTime = new Date();
    let initPromise: Promise<boolean> = Promise.resolve(true);
    if (!noBulkProcess) {
      initPromise = this.beginBulkProcess();
    }
    return initPromise
      .then(() => this.loadCategories().then(() => {
        console.log(`Loaded ${this.categories.length} categories successfully.`);
        console.log(this.categories.map((c) => `${c.id}: ${c.name}`).join('\n'));
      }))
      .then(() => this.loadParticipants().then(() => {
        console.log(`Loaded ${this.participants.length} participants successfully.`);
      }))
      .then(() => this.loadFlags())
      .then(() => this.loadCrossings())
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
      });
  }
}
