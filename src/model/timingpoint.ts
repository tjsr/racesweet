import { IdType, PhysicalLocation } from "./types.js";

import { TimingDeviceId } from "./timingdevice.js";

export type TimingPointId = IdType;

export interface TimingPoint {
  id: TimingPointId;
  name: string;
  locationDescription: string;
  locationCoordinate: PhysicalLocation;
  courseLocationDistance: number;
  timingDeviceId: TimingDeviceId;
}
