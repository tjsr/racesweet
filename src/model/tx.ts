import { EventTimeRecord, ParticipantPassingRecord } from "./timerecord.ts";

export type AutomaticTimingIdentifiactionCrossing<Node extends string> =
  EventTimeRecord & ParticipantPassingRecord & {
    [K in Node]: number;
  };


