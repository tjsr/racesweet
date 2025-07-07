import { ParticipantPassingRecord, TimeRecord } from "./timerecord.ts";

export type AutomaticTimingIdentifiactionCrossing<Node extends string> =
  TimeRecord & ParticipantPassingRecord & {
    [K in Node]: number;
  };


