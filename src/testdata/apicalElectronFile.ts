import { v1 as randomUUID, v5 as uuidv5 } from "uuid";

import { ApicalTestRace } from "./apical.ts";
import { ElectronResourceProvider } from "../controllers/resource/electron";

export class ApicalElectronFile extends ApicalTestRace {
  constructor() {
    const localProvider: ElectronResourceProvider<Buffer> = new ElectronResourceProvider<Buffer>('../../src/testdata');
    super(localProvider);
    // Set a unique event ID for the session.
    super.eventId = uuidv5('1', randomUUID());
  }
}
