import type { ParticipantPassingRecord } from "./timerecord.js";

export interface PlateCrossingData extends ParticipantPassingRecord {
  plateNumber: string | number;
}
