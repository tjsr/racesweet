import type { IdType, TimeEventSourceId, uuid } from "./types.ts";

import { v5 as uuidv5 } from "uuid";

export const FILE_PATH_NAMESPACE = uuidv5('fs', '00000000-0000-0000-0000-000000000000');

export type TimeEventId = uuid | number;export interface TimeEvent {
  sequence: number;
  id: TimeEventId;
  source: TimeEventSourceId;
  time?: Date;
  timeString?: string | null | undefined;
  participant?: IdType | null | undefined;
  dataLine?: string | null | undefined;
}
// export type UnparsedTimeEvent<TE extends TimeEvent> = Omit<TE, 'time'> & {
//   timeString: string;
// }

export interface TimeEventSource {
  id: TimeEventSourceId;
  name: string;
  description?: string | null | undefined;
  timezone?: string | null | undefined;
  filePath?: string | undefined;
  url?: URL | undefined;
}

export interface ParsedTimeEvent {
  time: Date;
}

export interface UnparsedTimeStringEvent {
  timeString: string;
}

export const generateTimeEventSourceId = ({ url, path }: { url?: URL; path?: string; }): TimeEventSourceId => {
  // Generate a new UUID (v5) for the time event source
  if (url) {
    return uuidv5(url.toString(), uuidv5.URL);
  }
  if (path) {
    return uuidv5(path, FILE_PATH_NAMESPACE);
  }
  throw new Error("Either URL or file path must be provided to generate a TimeEventSourceId");
};
