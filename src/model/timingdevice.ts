import { ChipCrossingData } from "./chipcrossing.ts";
import type { IdType } from "./types.ts";
import { TransmitterCrossingData } from "./transmitter.ts";
import { TransponderCrossingData } from "./transponder.ts";

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
