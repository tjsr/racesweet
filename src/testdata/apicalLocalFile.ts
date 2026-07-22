import { v1 as randomUUID, v5 as uuidv5 } from "uuid";

import { ApicalTestRace } from "./apical.js";
import LocalFileResourceProvider from "../processing/resource/local.js";

// class ApicalElectronFile extends ApicalTestRace {
//   constructor() {
//     const bufferProvider: ElectronResourceProvider<Buffer> = new ElectronResourceProvider<Buffer>();
//     const apicalResourceProvider:  ResourceProvider<ApicalLapByCategory> = new ElectronResourceProvider<ApicalLapByCategory>();
//     electronFileResourceProvider: ResourceProvider<ApicalLapByCategory> = new ElectronResourceProvider<ApicalLapByCategory>('src/testdata');
//     super(electronFileResourceProvider);
//     // Set a unique event ID for the session.
//     super.eventId = 'apical-electron-file-session';
//   }

//   public async retrieveApicalDataAsRaceState(): Promise<Partial<RaceState>> {
//     // This method should read data from a file or other source.
//     // For now, we return an empty object as a placeholder.
//     return {};
//   }
// }


export class ApicalLocalFile extends ApicalTestRace {
  constructor() {
    const localProvider: LocalFileResourceProvider<Buffer> = new LocalFileResourceProvider<Buffer>('src/testdata');
    super(localProvider);
    // Set a unique event ID for the session.
    super.eventId = uuidv5('1', randomUUID());
  }
}
