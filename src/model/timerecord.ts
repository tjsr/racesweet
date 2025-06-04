import type { TimeRecordSourceId, WithId, uuid } from "./types.ts";

import type { EventParticipantId } from "./eventparticipant.ts";
import { v5 as uuidv5 } from "uuid";

export const FILE_PATH_NAMESPACE = uuidv5('fs', '00000000-0000-0000-0000-000000000000');

export const EVENT_SESSION_START = 1;
export const EVENT_SESSION_END = 2;
export const EVENT_FLAG_DISPLAYED = 4;
export const EVENT_FLAG_RETRACTED = 8;

export type TimeRecordId = uuid | number;
export type PassingRecordId = TimeRecordId;

export interface TimeRecord extends WithId<TimeRecordId> {
  recordType: number;
  sequence: number;
  source: TimeRecordSourceId;
  time?: Date;
  timeString?: string | null | undefined;
  dataLine?: string | null | undefined;
}

export const CROSSING_FLAG_SESSION_FASTEST = 0x01; // Indicates a crossing is the fastest of the session so far.
export const CROSSING_FLAG_PARTICIPANT_FASTEST = 0x02; // Indicates a crossing is the fastest for the participant so far.
export const CROSSING_FLAG_PARTICIPANT_IMPROVED = 0x04; // Indicates a crossing is quicker than previous lap.
export const CROSSING_FLAG_LAP_UNDER_MINIMUM = 0x08; // Indicates a crossing is under the minimum lap time.

export interface ParticipantPassingRecord extends TimeRecord {
  id: PassingRecordId;
  participantId?: EventParticipantId | null | undefined;
  participantStartRecordId?: TimeRecordId | null | undefined;
  startingLapRecordId?: TimeRecordId | null | undefined;
  elapsedTime?: number | null | undefined; // in milliseconds
  lapTime?: number | null | undefined; // in milliseconds
  // lapStart?: TimeRecordId | null | undefined;
  lapNo?: number | null | undefined;
  isExcluded?: boolean | null | undefined;
  overallTrackPosition?: number | null | undefined;
  positionInClass?: number | null | undefined;
  isValid?: boolean | null | undefined; // Indicates if the record is valid
  infoFlags?: number;
}

// export type UnparsedTimeRecord<TE extends TimeRecord> = Omit<TE, 'time'> & {
//   timeString: string;
// }

export interface TimeRecordSource {
  id: TimeRecordSourceId;
  name: string;
  description?: string | null | undefined;
  timezone?: string | null | undefined;
  filePath?: string | undefined;
  url?: URL | undefined;
}

export interface ParsedTimeRecord {
  time: Date;
}

export interface UnparsedTimeStringEvent {
  timeString: string;
}

export const generateTimeRecordSourceId = ({ url, path }: { url?: URL; path?: string; }): TimeRecordSourceId => {
  // Generate a new UUID (v5) for the time event source
  if (url) {
    return uuidv5(url.toString(), uuidv5.URL);
  }
  if (path) {
    return uuidv5(path, FILE_PATH_NAMESPACE);
  }
  throw new Error("Either URL or file path must be provided to generate a TimeRecordSourceId");
};
