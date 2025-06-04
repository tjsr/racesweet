import type { ParticipantPassingRecord, TimeRecord } from "./timerecord.ts";

export interface ChipCrossingData extends TimeRecord, ParticipantPassingRecord {
  chipCode: number;
}

