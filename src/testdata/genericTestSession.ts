import type { RaceState } from "../model/racestate.ts";
import { Session } from "../model/racestate.ts";
import type { TestSession } from "./testsession.ts";

export abstract class GenericTestSession extends Session implements TestSession {
  public constructor(raceState?: RaceState) {
    super(raceState || {
      categories: [],
      participants: [],
      records: [],
      teams: [],
    });
  };

  public abstract loadCategories(): Promise<void>;
  public abstract loadParticipants(): Promise<void>;
  public abstract loadFlags(): Promise<void>;
  public abstract loadCrossings(): Promise<void>;

  public async loadTestData(): Promise<void> {
    return this.beginBulkProcess()
      .then(() => this.loadCategories().then(() => {
        console.log(`Loaded ${this.categories.length} categories successfully.`);
        console.log(this.categories.map((c) => `${c.id}: ${c.name}`).join('\n'));
      }))
      .then(() => this.loadParticipants().then(() => {
        console.log(`Loaded ${this.participants.length} participants successfully.`);
      }))
      .then(() => this.loadFlags())
      .then(() => this.loadCrossings())
      .then(() => this.endBulkProcess())
      .catch((error: unknown) => {
        console.log('Error loading test data:', error);
      });
  }
}
