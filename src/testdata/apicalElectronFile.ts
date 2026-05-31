import { v1 as randomUUID, v5 as uuidv5 } from "uuid";

import { ApicalTestRace } from "./apical.js";
import { ElectronBufferResourceProvider } from "../controllers/resource/electron";

export class ApicalElectronFile extends ApicalTestRace {
  constructor() {
    const localProvider: ElectronBufferResourceProvider = new ElectronBufferResourceProvider('../../src/testdata');
    super(localProvider);
    // Set a unique event ID for the session.
    super.eventId = uuidv5('1', randomUUID());
  }
}
