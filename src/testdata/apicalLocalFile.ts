import { v1 as randomUUID, v5 as uuidv5 } from "uuid";

import { ApicalLapByCategory } from "../model/apical.ts";
import { ApicalTestRace } from "./apical.ts";
import type { PathLike } from "fs";
import { RaceState } from "../model";
import { ResourceProvider } from "../controllers/resource/provider.ts";
import fs from 'fs/promises';

export class ApicalLocalFile extends ApicalTestRace {
  constructor(resourceProvider: ResourceProvider<ApicalLapByCategory>) {
    super(resourceProvider);
    super.eventId = uuidv5('1', randomUUID());
  }

  public async read(): Promise<Partial<RaceState>> {
    const filePath: PathLike = 'src/testdata/2025-06-06-data.json';
    super.getResource('2025-06-06-data.json');
    return fs.readFile(filePath, 'utf8')
      .then(d => JSON.parse(d) as ApicalLapByCategory)
      .then(apicalData => super.convert(this.eventId, apicalData));
  }
}
