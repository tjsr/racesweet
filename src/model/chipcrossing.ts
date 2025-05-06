import type { IdType, TimeEventSourceId, uuid } from "./types.js";

import { v5 as uuidv5 } from 'uuid';

const FILE_PATH_NAMESPACE = uuidv5('fs', '00000000-0000-0000-0000-000000000001');

export const generateTimeEventSourceId = ({ url, path } : {url?: URL; path?: string; }): TimeEventSourceId => {
  // Generate a new UUID (v5) for the time event source
  if (url) {
    return uuidv5(url.toString(), uuidv5.URL);
  }
  if (path) {
    return uuidv5(path, FILE_PATH_NAMESPACE);
  }
  throw new Error("Either URL or file path must be provided to generate a TimeEventSourceId");
};

export interface TimeEvent {
  id: uuid | number;
  source: TimeEventSourceId;
  time: Date;
  participant?: IdType | null | undefined;
}

export interface TimeEventSource {
  id: TimeEventSourceId;
  name: string;
  description?: string | null | undefined;
  timezone?: string | null | undefined;
  filePath?: string | undefined;
  url?: URL | undefined;
}

export interface ChipCrossingData extends TimeEvent {
  chipCode: number;
}

export interface PlateCrossingData extends TimeEvent {
  plateNumber: string | number;
}
