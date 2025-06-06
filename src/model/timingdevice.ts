import type { IdType } from "./types.ts";

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
