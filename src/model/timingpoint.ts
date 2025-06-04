import type { IdType, PhysicalLocation } from "./types.ts";

import type { TimingDeviceId } from "./timingdevice.ts";

export type TimingPointId = IdType;

export interface TimingPoint {
  id: TimingPointId;
  name: string;
  locationDescription: string;
  locationCoordinate: PhysicalLocation;
  courseLocationDistance: number;
  timingDeviceId: TimingDeviceId;
}
