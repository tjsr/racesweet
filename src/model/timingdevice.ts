import { ChipCrossingData } from "./chipcrossing.js";
import type { IdType } from "./types.js";
import { TransmitterCrossingData } from "./transmitter.js";
import { TransponderCrossingData } from "./transponder.js";

export type TimingDeviceId = IdType;

export interface TimingDevice {
  id: TimingDeviceId;
  name: string;
  description: string;
  location: string;
  ipAddress: string;
  port: number;
  status: string;
}

export type AutomaticTimingIdentifiactionCrossing = ChipCrossingData | TransmitterCrossingData | TransponderCrossingData;
