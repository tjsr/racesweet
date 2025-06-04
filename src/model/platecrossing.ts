import type { ParticipantPassingRecord } from "./timerecord.ts";

export interface PlateCrossingData extends ParticipantPassingRecord {
  plateNumber: string | number;
}
