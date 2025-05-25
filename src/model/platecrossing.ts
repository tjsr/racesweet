import type { TimeEvent } from "./timeevent.ts";

export interface PlateCrossingData extends TimeEvent {
  plateNumber: string | number;
}
